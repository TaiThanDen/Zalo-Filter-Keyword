import assert from "node:assert/strict";
import test from "node:test";
import { MatchDecision, MatchType, Prisma, RuleType, WatcherReportedStatus, type Watcher } from "@prisma/client";
import { db } from "@/src/lib/db";
import { groupsRepository } from "@/src/modules/groups/groups.repository";
import { ingestInboundMessage } from "@/src/modules/messages/messages.service";
import { messagesRepository } from "@/src/modules/messages/messages.repository";
import { notificationsRepository } from "@/src/modules/notifications/notifications.repository";
import { telegramProvider } from "@/src/modules/notifications/telegram.provider";

type EnsuredGroup = Awaited<ReturnType<typeof groupsRepository.ensureDiscoveredGroup>>["group"];

function stubMethod<T extends object, K extends keyof T>(obj: T, key: K, value: unknown) {
  const original = obj[key];
  obj[key] = value as T[K];
  return () => {
    obj[key] = original;
  };
}

function createWatcher(): Watcher {
  return {
    id: "watcher-1",
    name: "Watcher 1",
    apiKeyHash: "hash",
    reportedStatus: WatcherReportedStatus.ONLINE,
    lastHeartbeatAt: null,
    lastSeenIp: null,
    lastVersion: "0.1.0",
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
  };
}

function createIncludeRule(pattern: string) {
  return {
    id: `rule-${pattern}`,
    type: RuleType.INCLUDE,
    pattern,
    matchType: MatchType.CONTAINS,
    caseSensitive: false,
    isActive: true,
    note: null,
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
  };
}

test("ingest auto-creates unknown group, evaluates first message, and queues lightweight notifications", { concurrency: false }, async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const ensuredGroup = {
    id: "group-1",
    source: "zalo",
    externalId: "group-001",
    name: "PB Support Group",
    isEnabled: true,
    watcherId: "watcher-1",
    watcher: null,
    groupRules: [
      {
        id: "group-rule-1",
        groupId: "group-1",
        ruleId: "rule-PB",
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        rule: createIncludeRule("PB"),
      },
    ],
    inboundMessages: [],
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
  } as unknown as EnsuredGroup;

  let ensuredInput: unknown;
  let createInboundMessageCalled = false;
  let createMatchLogCalled = false;
  let outboxItems: Array<{ notificationChannelId: string; payload: unknown; dedupeKey: string }> = [];
  const sentPayloads: unknown[] = [];

  restore.push(
    stubMethod(groupsRepository, "ensureDiscoveredGroup", async (input: unknown) => {
      ensuredInput = input;
      return {
        group: ensuredGroup,
        created: true,
        updated: false,
      };
    }),
  );
  restore.push(
    stubMethod(messagesRepository, "reserveMessageDedupe", async () => ({
      reserved: true,
      id: "dedupe-1",
    })),
  );
  restore.push(
    stubMethod(messagesRepository, "createInboundMessage", async () => {
      createInboundMessageCalled = true;
      throw new Error("should not persist inbound message logs");
    }),
  );
  restore.push(
    stubMethod(messagesRepository, "createMatchLog", async () => {
      createMatchLogCalled = true;
      throw new Error("should not persist match logs");
    }),
  );
  restore.push(
    stubMethod(notificationsRepository, "listChannels", async () => [
      {
        id: "channel-all",
        type: "TELEGRAM",
        name: "Telegram all",
        isActive: true,
        config: { botToken: "token", chatId: "-1001", parseMode: "HTML" },
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        updatedAt: new Date("2026-04-12T00:00:00.000Z"),
        notificationChannelRules: [],
      },
      {
        id: "channel-pb",
        type: "TELEGRAM",
        name: "Telegram PB",
        isActive: true,
        config: { botToken: "token-2", chatId: "-1002", parseMode: "HTML" },
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        updatedAt: new Date("2026-04-12T00:00:00.000Z"),
        notificationChannelRules: [
          {
            id: "channel-rule-1",
            notificationChannelId: "channel-pb",
            ruleId: "rule-PB",
            createdAt: new Date("2026-04-12T00:00:00.000Z"),
            rule: createIncludeRule("PB"),
          },
        ],
      },
      {
        id: "channel-pg",
        type: "TELEGRAM",
        name: "Telegram PG",
        isActive: true,
        config: { botToken: "token-3", chatId: "-1003", parseMode: "HTML" },
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        updatedAt: new Date("2026-04-12T00:00:00.000Z"),
        notificationChannelRules: [
          {
            id: "channel-rule-2",
            notificationChannelId: "channel-pg",
            ruleId: "rule-PG",
            createdAt: new Date("2026-04-12T00:00:00.000Z"),
            rule: createIncludeRule("PG"),
          },
        ],
      },
    ] as Awaited<ReturnType<typeof notificationsRepository.listChannels>>),
  );
  restore.push(
    stubMethod(notificationsRepository, "createOutboxItems", async (items: typeof outboxItems) => {
      outboxItems = items;
      return items.map((item, index) => ({ id: `outbox-${index + 1}`, ...item }));
    }),
  );
  restore.push(
    stubMethod(notificationsRepository, "listOutboxItemsByIds", async () => outboxItems.map((item, index) => ({
      id: `outbox-${index + 1}`,
      notificationChannelId: item.notificationChannelId,
      status: "PENDING",
      attempts: 0,
      nextRetryAt: null,
      sentAt: null,
      lastError: null,
      payload: item.payload,
      dedupeKey: item.dedupeKey,
      expiresAt: new Date("2026-04-15T00:00:00.000Z"),
      createdAt: new Date("2026-04-12T00:00:00.000Z"),
      updatedAt: new Date("2026-04-12T00:00:00.000Z"),
      notificationChannel: {
        id: item.notificationChannelId,
        type: "TELEGRAM",
        name: item.notificationChannelId,
        isActive: true,
        config: { botToken: "token", chatId: "-1001", parseMode: "HTML" },
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        updatedAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    }))),
  );
  restore.push(
    stubMethod(notificationsRepository, "markOutboxProcessing", async () => ({})),
  );
  restore.push(
    stubMethod(notificationsRepository, "markOutboxSent", async () => ({})),
  );
  restore.push(
    stubMethod(notificationsRepository, "markOutboxRetry", async () => ({})),
  );
  restore.push(
    stubMethod(notificationsRepository, "markOutboxFailed", async () => ({})),
  );
  restore.push(
    stubMethod(telegramProvider, "send", async (payload: unknown) => {
      sentPayloads.push(payload);
      return { ok: true };
    }),
  );

  const result = await ingestInboundMessage(createWatcher(), {
    source: "zalo",
    groupExternalId: "group-001",
    groupName: "PB Support Group",
    messageExternalId: "msg-1",
    senderName: "Alice",
    messageText: "Can team PB support this ticket?",
    messageTime: "2026-04-12T01:23:45.000Z",
    rawPayload: { raw: true },
  });

  assert.deepEqual(ensuredInput, {
    source: "zalo",
    externalId: "group-001",
    name: "PB Support Group",
    watcherId: "watcher-1",
  });
  assert.equal(result.decision, MatchDecision.MATCHED);
  assert.notEqual(result.decision, MatchDecision.REJECTED_UNKNOWN_GROUP);
  assert.equal(result.reason, "matched");
  assert.deepEqual(result.matchedIncludeRules, ["PB"]);
  assert.equal(result.inboundMessageId, null);
  assert.equal(result.messageDedupeId, "dedupe-1");
  assert.equal(result.notificationDeliveriesCreated, 0);
  assert.equal(result.notificationsQueued, 2);
  assert.equal(createInboundMessageCalled, false);
  assert.equal(createMatchLogCalled, false);
  assert.deepEqual(outboxItems.map((item) => item.notificationChannelId), ["channel-all", "channel-pb"]);
  assert.deepEqual(outboxItems.map((item) => item.payload), [
    {
      groupName: "PB Support Group",
      senderName: "Alice",
      messageText: "Can team PB support this ticket?",
      messageTime: "2026-04-12T01:23:45.000Z",
      matchedKeywords: ["PB"],
    },
    {
      groupName: "PB Support Group",
      senderName: "Alice",
      messageText: "Can team PB support this ticket?",
      messageTime: "2026-04-12T01:23:45.000Z",
      matchedKeywords: ["PB"],
    },
  ]);
  assert.equal(sentPayloads.length, 0);
});

test("ensureDiscoveredGroup falls back to existing group on unique conflict without creating duplicates", { concurrency: false }, async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const existingGroupRecord = {
    id: "group-existing",
    name: "group-001",
    externalId: "group-001",
    watcherId: null,
  };
  const hydratedGroup = {
    id: "group-existing",
    source: "zalo",
    externalId: "group-001",
    name: "Fresh name from payload",
    isEnabled: true,
    watcherId: "watcher-1",
    watcher: null,
    groupRules: [],
    inboundMessages: [],
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
  } as unknown as EnsuredGroup;

  let createCalls = 0;
  let updateInput: unknown;
  let findUniqueCalls = 0;

  restore.push(
    stubMethod(db.rule, "findMany", async () => [{ id: "rule-1" }]),
  );
  restore.push(
    stubMethod(db.groupRule, "createMany", async () => ({ count: 1 })),
  );
  restore.push(
    stubMethod(db.group, "findUnique", async () => {
      findUniqueCalls += 1;
      return findUniqueCalls === 1 ? (null as unknown) : (existingGroupRecord as unknown);
    }),
  );
  restore.push(
    stubMethod(db.group, "create", async () => {
      createCalls += 1;
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["source", "externalId"] },
      });
    }),
  );
  restore.push(
    stubMethod(db.group, "update", async (input: unknown) => {
      updateInput = input;
      return { id: "group-existing" } as never;
    }),
  );
  restore.push(
    stubMethod(db.group, "findUniqueOrThrow", async (input: { select?: unknown }) => {
      if (input.select) {
        return existingGroupRecord as never;
      }

      return hydratedGroup as never;
    }),
  );

  const result = await groupsRepository.ensureDiscoveredGroup({
    source: "zalo",
    externalId: "group-001",
    name: "Fresh name from payload",
    watcherId: "watcher-1",
  });

  assert.equal(createCalls, 1);
  assert.deepEqual(updateInput, {
    where: { id: "group-existing" },
    data: {
      name: "Fresh name from payload",
      watcherId: "watcher-1",
    },
  });
  assert.equal(result.created, false);
  assert.equal(result.updated, true);
  assert.equal(result.group.id, "group-existing");
  assert.equal(result.group.name, "Fresh name from payload");
});


test("ingest suppresses duplicates from lightweight dedupe without writing a log or alert", { concurrency: false }, async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const ensuredGroup = {
    id: "group-1",
    source: "zalo",
    externalId: "group-001",
    name: "PB Support Group",
    isEnabled: true,
    watcherId: "watcher-1",
    watcher: null,
    groupRules: [
      {
        id: "group-rule-1",
        groupId: "group-1",
        ruleId: "rule-PB",
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        rule: createIncludeRule("PB"),
      },
    ],
    inboundMessages: [],
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
  } as unknown as EnsuredGroup;

  let matchLogCalled = false;
  let deliveriesCalled = false;
  let outboxCalled = false;

  restore.push(
    stubMethod(groupsRepository, "ensureDiscoveredGroup", async () => ({
      group: ensuredGroup,
      created: false,
      updated: false,
    })),
  );
  restore.push(
    stubMethod(messagesRepository, "reserveMessageDedupe", async () => ({
      reserved: false,
      id: null,
    })),
  );
  restore.push(
    stubMethod(messagesRepository, "createMatchLog", async () => {
      matchLogCalled = true;
      throw new Error("should not create a second match log");
    }),
  );
  restore.push(
    stubMethod(notificationsRepository, "createDeliveries", async () => {
      deliveriesCalled = true;
      throw new Error("should not create duplicate deliveries");
    }),
  );
  restore.push(
    stubMethod(notificationsRepository, "createOutboxItems", async () => {
      outboxCalled = true;
      throw new Error("should not queue duplicate notification");
    }),
  );

  const result = await ingestInboundMessage(createWatcher(), {
    source: "zalo",
    groupExternalId: "group-001",
    groupName: "PB Support Group",
    messageExternalId: "msg-1",
    senderName: "Alice",
    messageText: "Can team PB support this ticket?",
    messageTime: "2026-04-12T01:23:45.000Z",
  });

  assert.equal(result.inboundMessageId, null);
  assert.equal(result.decision, MatchDecision.REJECTED_DUPLICATE);
  assert.equal(result.reason, "duplicate_message");
  assert.equal(result.notificationDeliveriesCreated, 0);
  assert.equal(result.notificationsQueued, 0);
  assert.equal(matchLogCalled, false);
  assert.equal(deliveriesCalled, false);
  assert.equal(outboxCalled, false);
});
