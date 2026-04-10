import { MatchDecision, Prisma, type Watcher } from "@prisma/client";
import { groupsRepository } from "@/src/modules/groups/groups.repository";
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

  const group = await groupsRepository.findBySourceExternalId(payload.source, payload.groupExternalId);

  const duplicate = payload.messageExternalId
    ? await messagesRepository.findPotentialDuplicateByExternalId({
        source: payload.source,
        groupExternalId: payload.groupExternalId,
        messageExternalId: payload.messageExternalId,
        messageTime,
      })
    : await messagesRepository.findPotentialDuplicateByFingerprint({
        fingerprint,
        messageTime,
      });

  const evaluation = evaluateRules({
    isGroupKnown: Boolean(group),
    isGroupEnabled: group?.isEnabled ?? false,
    isDuplicate: Boolean(duplicate),
    messageText: payload.messageText,
    rules: group?.groupRules.map((groupRule) => groupRule.rule) ?? [],
  });

  const inboundMessage = await messagesRepository.createInboundMessage({
    source: payload.source,
    watcherId: watcher.id,
    groupId: group?.id ?? null,
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

  const matchLog = await messagesRepository.createMatchLog({
    inboundMessageId: inboundMessage.id,
    decision: evaluation.decision,
    matchedIncludeRules: evaluation.includeHits.map(toRuleSnapshot) as Prisma.InputJsonValue,
    matchedExcludeRules: evaluation.excludeHits.map(toRuleSnapshot) as Prisma.InputJsonValue,
    reason: evaluation.reason,
  });

  let notificationDeliveriesCreated = 0;

  if (evaluation.decision === MatchDecision.MATCHED) {
    const created = await scheduleNotificationDeliveries(matchLog.id, {
      groupName: group?.name || payload.groupName || payload.groupExternalId,
      senderName: payload.senderName || payload.senderExternalId || "Unknown sender",
      messageText: payload.messageText,
      messageTime: messageTime.toISOString(),
      matchedKeywords: Array.from(new Set(evaluation.includeHits.map((rule) => rule.pattern))),
    });
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
