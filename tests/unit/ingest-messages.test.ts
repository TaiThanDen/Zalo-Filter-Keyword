import assert from "node:assert/strict";
import test from "node:test";
import { MatchDecision, MatchType, Prisma, RuleType, WatcherReportedStatus, type Watcher } from "@prisma/client";
import { db } from "@/src/lib/db";
import { groupsRepository } from "@/src/modules/groups/groups.repository";
import { ingestInboundMessage } from "@/src/modules/messages/messages.service";
import { messagesRepository } from "@/src/modules/messages/messages.repository";
import { notificationsRepository } from "@/src/modules/notifications/notifications.repository";

type EnsuredGroup = Awaited<ReturnType<typeof groupsRepository.ensureDiscoveredGroup>>["group"];
type InboundMessageCreateInput = Parameters<typeof messagesRepository.createInboundMessage>[0];
type MatchLogCreateInput = Parameters<typeof messagesRepository.createMatchLog>[0];
type NotificationCreateInput = Parameters<typeof notificationsRepository.createDeliveries>[0];

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

test("ingest auto-creates unknown group, evaluates first message, and schedules notification delivery", { concurrency: false }, async (t) => {
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
  let inboundMessageInput: InboundMessageCreateInput | undefined;
  let matchLogInput: MatchLogCreateInput | undefined;
  let deliveryInput: NotificationCreateInput | undefined;

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
    stubMethod(messagesRepository, "findPotentialDuplicateByExternalId", async () => null),
  );
  restore.push(
    stubMethod(messagesRepository, "findPotentialDuplicateByFingerprint", async () => null),
  );
  restore.push(
    stubMethod(messagesRepository, "createInboundMessage", async (input: InboundMessageCreateInput) => {
      inboundMessageInput = input;
      return { id: "inbound-1" } as unknown as Awaited<ReturnType<typeof messagesRepository.createInboundMessage>>;
    }),
  );
  restore.push(
    stubMethod(messagesRepository, "createMatchLog", async (input: MatchLogCreateInput) => {
      matchLogInput = input;
      return { id: "match-log-1" } as unknown as Awaited<ReturnType<typeof messagesRepository.createMatchLog>>;
    }),
  );
  restore.push(
    stubMethod(notificationsRepository, "createDeliveries", async (input: NotificationCreateInput) => {
      deliveryInput = input;
      return [{ id: "delivery-1" }] as unknown as Awaited<ReturnType<typeof notificationsRepository.createDeliveries>>;
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

  assert.ok(inboundMessageInput);
  assert.ok(matchLogInput);
  assert.ok(deliveryInput);

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
  assert.equal(result.notificationDeliveriesCreated, 1);
  assert.deepEqual(inboundMessageInput, {
    source: "zalo",
    watcherId: "watcher-1",
    groupId: "group-1",
    groupExternalId: "group-001",
    groupName: "PB Support Group",
    messageExternalId: "msg-1",
    senderExternalId: null,
    senderName: "Alice",
    messageText: "Can team PB support this ticket?",
    normalizedText: "can team pb support this ticket?",
    messageTime: new Date("2026-04-12T01:23:45.000Z"),
    fingerprint: inboundMessageInput.fingerprint,
    rawPayload: { raw: true },
  });
  assert.deepEqual(matchLogInput, {
    inboundMessageId: "inbound-1",
    decision: MatchDecision.MATCHED,
    matchedIncludeRules: [
      {
        id: "rule-PB",
        pattern: "PB",
        type: "INCLUDE",
        matchType: "CONTAINS",
      },
    ],
    matchedExcludeRules: [],
    reason: "matched",
  });
  assert.deepEqual(deliveryInput, {
    matchLogId: "match-log-1",
    payload: {
      groupName: "PB Support Group",
      senderName: "Alice",
      messageText: "Can team PB support this ticket?",
      messageTime: "2026-04-12T01:23:45.000Z",
      matchedKeywords: ["PB"],
    },
  });
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
  const tx = {
    rule: {
      findMany: async () => [{ id: "rule-1" }],
    },
    groupRule: {
      createMany: async () => ({ count: 1 }),
    },
    group: {
      findUnique: async () => {
        findUniqueCalls += 1;
        return findUniqueCalls === 1 ? null : (existingGroupRecord as unknown);
      },
      create: async () => {
        createCalls += 1;
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["source", "externalId"] },
        });
      },
      update: async (input: unknown) => {
        updateInput = input;
        return { id: "group-existing" };
      },
      findUniqueOrThrow: async (input: { select?: unknown }) => {
        if (input.select) {
          return existingGroupRecord;
        }

        return hydratedGroup;
      },
    },
  };

  restore.push(
    stubMethod(db, "$transaction", async (arg: unknown) => {
      if (typeof arg !== "function") {
        throw new Error("Expected interactive transaction callback");
      }

      return (arg as (client: typeof tx) => Promise<unknown>)(tx);
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
