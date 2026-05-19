import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { db } from '@/src/lib/db';
import { notificationsRepository } from '@/src/modules/notifications/notifications.repository';

function stubMethod<T extends object, K extends keyof T>(obj: T, key: K, value: unknown) {
  const original = obj[key];
  obj[key] = value as T[K];
  return () => {
    obj[key] = original;
  };
}

type MockChannel = {
  id: string;
  type: 'TELEGRAM' | 'MESSENGER';
  config: { botToken: string; chatId: string; parseMode: string };
  notificationChannelRules: Array<{ ruleId: string }>;
};

type MockTransaction = {
  $executeRaw: (...args: unknown[]) => Promise<unknown>;
  matchLog: {
    findUniqueOrThrow: () => Promise<{
      inboundMessage: {
        source: string;
        normalizedText: string;
        senderExternalId: string;
        senderName: string;
        messageTime: Date;
      };
    }>;
  };
  notificationChannel: {
    findMany: () => Promise<MockChannel[]>;
  };
  notificationDelivery: {
    findFirst: (input: { where: { notificationChannelId: string | { in: string[] } } }) => Promise<{ id: string } | null>;
    create: (input: { data: { notificationChannelId: string } }) => Promise<{ id: string }>;
  };
  notificationOutbox: {
    findFirst: (input: { where: { dedupeKey?: { in: string[] }; createdAt?: { gte: Date } } }) => Promise<{ id: string } | null>;
    create: (input: { data: { notificationChannelId: string; dedupeKey: string } }) => Promise<{ id: string }>;
  };
};

function createBaseTransactionState() {
  const createdChannelIds: string[] = [];

  const tx: MockTransaction = {
    $executeRaw: async () => 1,
    matchLog: {
      findUniqueOrThrow: async () => ({
        inboundMessage: {
          source: 'zalo',
          normalizedText: 'need pg support',
          senderExternalId: 'sender-1',
          senderName: 'Alice',
          messageTime: new Date('2026-04-19T12:00:00.000Z'),
        },
      }),
    },
    notificationChannel: {
      findMany: async () => [],
    },
    notificationDelivery: {
      findFirst: async () => null,
      create: async (input: { data: { notificationChannelId: string } }) => {
        createdChannelIds.push(input.data.notificationChannelId);
        return { id: `delivery-${input.data.notificationChannelId}` };
      },
    },
    notificationOutbox: {
      findFirst: async () => null,
      create: async (input: { data: { notificationChannelId: string; dedupeKey: string } }) => ({
        id: `outbox-${input.data.notificationChannelId}-${input.data.dedupeKey}`,
      }),
    },
  };

  return { tx, createdChannelIds };
}

test('createDeliveries sends to channels with matching rules and channels with no rule filter', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const { tx, createdChannelIds } = createBaseTransactionState();
  tx.notificationChannel.findMany = async () => [
    {
      id: 'channel-all',
      type: 'TELEGRAM',
      config: { botToken: 'token-a', chatId: '-1001', parseMode: 'HTML' },
      notificationChannelRules: [],
    },
    {
      id: 'channel-pb',
      type: 'TELEGRAM',
      config: { botToken: 'token-b', chatId: '-1002', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pb' }],
    },
    {
      id: 'channel-pg',
      type: 'TELEGRAM',
      config: { botToken: 'token-c', chatId: '-1003', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pg' }],
    },
    {
      id: 'channel-pb-duplicate-destination',
      type: 'TELEGRAM',
      config: { botToken: 'token-b', chatId: '-1002', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pb' }],
    },
  ];

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: MockTransaction) => Promise<unknown>)(tx);
    }),
  );

  const deliveries = await notificationsRepository.createDeliveries({
    matchLogId: 'match-log-1',
    payload: { matchedKeywords: ['pb'] },
    matchedRuleIds: ['rule-pb'],
  });

  assert.deepEqual(createdChannelIds, ['channel-all', 'channel-pb']);
  assert.equal(deliveries.length, 2);
});

test('createOutboxItems suppresses nearby direct duplicates across adjacent time buckets', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const { tx } = createBaseTransactionState();
  const createdKeys: string[] = [];
  const existingKeys = new Set(['channel-a|zalo|need pb roadshow|41']);
  tx.notificationOutbox.findFirst = async (input) => {
    const keys = input.where.dedupeKey?.in ?? [];
    return keys.some((key) => existingKeys.has(key)) ? { id: 'outbox-existing' } : null;
  };
  tx.notificationOutbox.create = async (input) => {
    createdKeys.push(input.data.dedupeKey);
    return { id: `outbox-${createdKeys.length}` };
  };

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: MockTransaction) => Promise<unknown>)(tx);
    }),
  );

  const created = await notificationsRepository.createOutboxItems([
    {
      notificationChannelId: 'channel-a',
      payload: { matchedKeywords: ['pb'] },
      dedupeKey: 'channel-a|zalo|need pb roadshow|42',
      dedupeConflictKeys: [
        'channel-a|zalo|need pb roadshow|41',
        'channel-a|zalo|need pb roadshow|42',
        'channel-a|zalo|need pb roadshow|43',
      ],
      dedupeLockKey: 'channel-a|zalo|need pb roadshow',
      dedupeWindowStart: new Date('2026-05-19T00:00:00.000Z'),
      expiresAt: new Date('2026-05-22T00:00:00.000Z'),
    },
  ]);

  assert.equal(created.length, 0);
  assert.deepEqual(createdKeys, []);
});

test('createDeliveries does not send rule-filtered channels when no selected rule matches', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const { tx, createdChannelIds } = createBaseTransactionState();
  tx.notificationChannel.findMany = async () => [
    {
      id: 'channel-all',
      type: 'TELEGRAM',
      config: { botToken: 'token-a', chatId: '-1001', parseMode: 'HTML' },
      notificationChannelRules: [],
    },
    {
      id: 'channel-pb',
      type: 'TELEGRAM',
      config: { botToken: 'token-b', chatId: '-1002', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pb' }],
    },
  ];

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: MockTransaction) => Promise<unknown>)(tx);
    }),
  );

  const deliveries = await notificationsRepository.createDeliveries({
    matchLogId: 'match-log-2',
    payload: { matchedKeywords: ['helper'] },
    matchedRuleIds: ['rule-helper'],
  });

  assert.deepEqual(createdChannelIds, ['channel-all']);
  assert.equal(deliveries.length, 1);
});

test('createDeliveries suppresses duplicate Telegram alerts for same sender and content across groups', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const { tx, createdChannelIds } = createBaseTransactionState();
  const findFirstCalls: Array<string | { in: string[] }> = [];
  tx.notificationChannel.findMany = async () => [
    {
      id: 'channel-all',
      type: 'TELEGRAM',
      config: { botToken: 'token-a', chatId: '-1001', parseMode: 'HTML' },
      notificationChannelRules: [],
    },
    {
      id: 'channel-pg',
      type: 'TELEGRAM',
      config: { botToken: 'token-b', chatId: '-1002', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pg' }],
    },
  ];
  tx.notificationDelivery.findFirst = async (input: { where: { notificationChannelId: string | { in: string[] } } }) => {
    findFirstCalls.push(input.where.notificationChannelId);

    if (
      typeof input.where.notificationChannelId !== 'string'
      && input.where.notificationChannelId.in.includes('channel-pg')
    ) {
      return { id: 'delivery-existing' };
    }

    return null;
  };

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: MockTransaction) => Promise<unknown>)(tx);
    }),
  );

  const deliveries = await notificationsRepository.createDeliveries({
    matchLogId: 'match-log-3',
    payload: { matchedKeywords: ['PG'] },
    matchedRuleIds: ['rule-pg'],
  });

  assert.deepEqual(findFirstCalls, [{ in: ['channel-all'] }, { in: ['channel-pg'] }]);
  assert.deepEqual(createdChannelIds, ['channel-all']);
  assert.equal(deliveries.length, 1);
});

test('createDeliveries tolerates a race on the same matchLog/channel without creating a duplicate alert', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const { tx, createdChannelIds } = createBaseTransactionState();
  tx.notificationChannel.findMany = async () => [
    {
      id: 'channel-pb',
      type: 'TELEGRAM',
      config: { botToken: 'token-b', chatId: '-1002', parseMode: 'HTML' },
      notificationChannelRules: [{ ruleId: 'rule-pb' }],
    },
  ];
  tx.notificationDelivery.create = async () => {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['matchLogId', 'notificationChannelId'] },
    });
  };

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: MockTransaction) => Promise<unknown>)(tx);
    }),
  );

  const deliveries = await notificationsRepository.createDeliveries({
    matchLogId: 'match-log-race',
    payload: { matchedKeywords: ['pb'] },
    matchedRuleIds: ['rule-pb'],
  });

  assert.deepEqual(createdChannelIds, []);
  assert.equal(deliveries.length, 0);
});




