import { MatchDecision, Prisma, type Watcher } from "@prisma/client";
import { ensureGroupForInboundMessage } from "@/src/modules/groups/groups.service";
import { scheduleNotificationDeliveries } from "@/src/modules/notifications/notifications.service";
import { buildFingerprint, evaluateRules, normalizeText } from "@/src/modules/matching/matching.service";
import { messagesRepository } from "@/src/modules/messages/messages.repository";

function toRuleSnapshot(rule: {
  id: string;
  pattern: string;
  type: "INCLUDE" | "EXCLUDE";
  matchType: "CONTAINS" | "WHOLE_WORD";
}) {
  return {
    id: rule.id,
    pattern: rule.pattern,
    type: rule.type,
    matchType: rule.matchType,
  };
}

function isInboundExternalIdConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
    && Array.isArray(error.meta?.target)
    && error.meta.target.includes("source")
    && error.meta.target.includes("groupExternalId")
    && error.meta.target.includes("messageExternalId")
  );
}

export async function ingestInboundMessage(
  watcher: Watcher,
  payload: {
    source: string;
    groupExternalId: string;
    groupName?: string;
    messageExternalId?: string;
    senderExternalId?: string;
    senderName?: string;
    messageText: string;
    messageTime: string;
    rawPayload?: Prisma.InputJsonValue;
  },
) {
  const group = await ensureGroupForInboundMessage({
    source: payload.source,
    groupExternalId: payload.groupExternalId,
    groupName: payload.groupName,
    watcherId: watcher.id,
  });

  const messageTime = new Date(payload.messageTime);
  const normalizedText = normalizeText(payload.messageText, false);
  const fingerprint = buildFingerprint({
    source: payload.source,
    groupExternalId: payload.groupExternalId,
    senderExternalId: payload.senderExternalId,
    senderName: payload.senderName,
    normalizedText,
    messageTime,
  });

  const duplicate = payload.messageExternalId
    ? await messagesRepository.findPotentialDuplicateByExternalId({
        source: payload.source,
        groupExternalId: payload.groupExternalId,
        messageExternalId: payload.messageExternalId,
      })
    : await messagesRepository.findPotentialDuplicateByFingerprint({
        fingerprint,
        messageTime,
      });

  const evaluation = evaluateRules({
    isGroupKnown: true,
    isGroupEnabled: group.isEnabled,
    isDuplicate: Boolean(duplicate),
    messageText: payload.messageText,
    rules: group.groupRules.map((groupRule) => groupRule.rule),
  });

  let inboundMessage;

  try {
    inboundMessage = await messagesRepository.createInboundMessage({
      source: payload.source,
      watcherId: watcher.id,
      groupId: group.id,
      groupExternalId: payload.groupExternalId,
      groupName: payload.groupName ?? null,
      messageExternalId: payload.messageExternalId ?? null,
      senderExternalId: payload.senderExternalId ?? null,
      senderName: payload.senderName ?? null,
      messageText: payload.messageText,
      normalizedText,
      messageTime,
      fingerprint,
      rawPayload: payload.rawPayload,
    });
  } catch (error) {
    if (!payload.messageExternalId || !isInboundExternalIdConflict(error)) {
      throw error;
    }

    const existingInbound = await messagesRepository.findBySourceGroupAndExternalId({
      source: payload.source,
      groupExternalId: payload.groupExternalId,
      messageExternalId: payload.messageExternalId,
    });

    return {
      accepted: true,
      inboundMessageId: existingInbound?.id ?? null,
      decision: existingInbound?.matchLog?.decision ?? MatchDecision.REJECTED_DUPLICATE,
      reason: existingInbound?.matchLog?.reason ?? "duplicate_message",
      matchedIncludeRules: [],
      matchedExcludeRules: [],
      notificationDeliveriesCreated: 0,
    };
  }

  const matchLog = await messagesRepository.createMatchLog({
    inboundMessageId: inboundMessage.id,
    decision: evaluation.decision,
    matchedIncludeRules: evaluation.includeHits.map(toRuleSnapshot) as Prisma.InputJsonValue,
    matchedExcludeRules: evaluation.excludeHits.map(toRuleSnapshot) as Prisma.InputJsonValue,
    reason: evaluation.reason,
  });

  let notificationDeliveriesCreated = 0;

  if (evaluation.decision === MatchDecision.MATCHED) {
    const created = await scheduleNotificationDeliveries(
      matchLog.id,
      {
        groupName: group.name,
        senderName: payload.senderName || payload.senderExternalId || "Unknown sender",
        messageText: payload.messageText,
        messageTime: messageTime.toISOString(),
        matchedKeywords: Array.from(new Set(evaluation.includeHits.map((rule) => rule.pattern))),
      },
      evaluation.includeHits.map((rule) => rule.id),
    );
    notificationDeliveriesCreated = created.length;
  }

  return {
    accepted: true,
    inboundMessageId: inboundMessage.id,
    decision: evaluation.decision,
    reason: evaluation.reason,
    matchedIncludeRules: evaluation.includeHits.map((rule) => rule.pattern),
    matchedExcludeRules: evaluation.excludeHits.map((rule) => rule.pattern),
    notificationDeliveriesCreated,
  };
}

