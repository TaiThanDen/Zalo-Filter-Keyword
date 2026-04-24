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
  $queryRaw: (...args: unknown[]) => Promise<unknown>;
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
};

function createBaseTransactionState() {
  const createdChannelIds: string[] = [];

  const tx: MockTransaction = {
    $queryRaw: async () => [],
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




