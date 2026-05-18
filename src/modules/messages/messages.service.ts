import { MatchDecision, Prisma, type Watcher } from "@prisma/client";
import { ensureGroupForInboundMessage } from "@/src/modules/groups/groups.service";
import { queueMatchedRuleNotifications } from "@/src/modules/notifications/notifications.service";
import { buildFingerprint, evaluateRules, normalizeText } from "@/src/modules/matching/matching.service";
import { messagesRepository } from "@/src/modules/messages/messages.repository";

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

  const dedupeReservation = await messagesRepository.reserveMessageDedupe({
    source: payload.source,
    groupExternalId: payload.groupExternalId,
    messageExternalId: payload.messageExternalId ?? null,
    fingerprint,
    messageTime,
  });

  const evaluation = evaluateRules({
    isGroupKnown: true,
    isGroupEnabled: group.isEnabled,
    isDuplicate: !dedupeReservation.reserved,
    messageText: payload.messageText,
    rules: group.groupRules.map((groupRule) => groupRule.rule),
  });

  let notificationsQueued = 0;

  if (evaluation.decision === MatchDecision.MATCHED) {
    const queued = await queueMatchedRuleNotifications(
      {
        groupName: group.name,
        senderName: payload.senderName || payload.senderExternalId || "Unknown sender",
        messageText: payload.messageText,
        messageTime: messageTime.toISOString(),
        matchedKeywords: Array.from(new Set(evaluation.includeHits.map((rule) => rule.pattern))),
      },
      evaluation.includeHits.map((rule) => rule.id),
      {
        source: payload.source,
        normalizedText,
        messageTime,
        senderExternalId: payload.senderExternalId ?? null,
        senderName: payload.senderName ?? null,
      },
    );
    notificationsQueued = queued.length;
  }

  return {
    accepted: true,
    inboundMessageId: null,
    messageDedupeId: dedupeReservation.id,
    decision: evaluation.decision,
    reason: evaluation.reason,
    matchedIncludeRules: evaluation.includeHits.map((rule) => rule.pattern),
    matchedExcludeRules: evaluation.excludeHits.map((rule) => rule.pattern),
    notificationDeliveriesCreated: 0,
    notificationsQueued,
  };
}

