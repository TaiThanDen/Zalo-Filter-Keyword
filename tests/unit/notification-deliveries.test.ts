import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@/src/lib/db';
import { notificationsRepository } from '@/src/modules/notifications/notifications.repository';

function stubMethod<T extends object, K extends keyof T>(obj: T, key: K, value: unknown) {
  const original = obj[key];
  obj[key] = value as T[K];
  return () => {
    obj[key] = original;
  };
}

test('createDeliveries sends to channels with matching rules and channels with no rule filter', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const createdChannelIds: string[] = [];
  const tx = {
    notificationChannel: {
      findMany: async () => [
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
      ],
    },
    notificationDelivery: {
      create: async (input: { data: { notificationChannelId: string } }) => {
        createdChannelIds.push(input.data.notificationChannelId);
        return { id: `delivery-${input.data.notificationChannelId}` };
      },
    },
  };

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: typeof tx) => Promise<unknown>)(tx);
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

  const createdChannelIds: string[] = [];
  const tx = {
    notificationChannel: {
      findMany: async () => [
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
      ],
    },
    notificationDelivery: {
      create: async (input: { data: { notificationChannelId: string } }) => {
        createdChannelIds.push(input.data.notificationChannelId);
        return { id: `delivery-${input.data.notificationChannelId}` };
      },
    },
  };

  restore.push(
    stubMethod(db, '$transaction', async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected interactive transaction callback');
      }

      return (callback as (client: typeof tx) => Promise<unknown>)(tx);
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
