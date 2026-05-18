import { NotificationDeliveryStatus, Prisma } from "@prisma/client";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { addMilliseconds } from "@/src/lib/time";
import { AppError } from "@/src/lib/errors";
import { notificationsRepository } from "@/src/modules/notifications/notifications.repository";
import { telegramProvider } from "@/src/modules/notifications/telegram.provider";
import type { NotificationPayload } from "@/src/modules/notifications/notifications.types";
import { messagesRepository } from "@/src/modules/messages/messages.repository";
import { rulesRepository } from "@/src/modules/rules/rules.repository";

type DirectNotificationDedupeInput = {
  source: string;
  normalizedText: string;
  messageTime: Date;
  senderExternalId?: string | null;
  senderName?: string | null;
};

type TelegramConfig = {
  botToken?: string;
  chatId?: string;
  parseMode?: string;
};

const runtimeStatePruneIntervalMs = 15 * 60 * 1000;
let lastRuntimeStatePrunedAt = 0;

function normalizeNotificationIdentity(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildChannelDestinationKey(channel: {
  id: string;
  type: "TELEGRAM" | "MESSENGER";
  config: Prisma.JsonValue;
}) {
  if (channel.type !== "TELEGRAM") {
    return `${channel.type}:${channel.id}`;
  }

  const config = (channel.config ?? {}) as TelegramConfig;
  return [
    channel.type,
    String(config.botToken ?? ""),
    String(config.chatId ?? ""),
    String(config.parseMode ?? ""),
  ].join("|");
}

function buildDirectDedupeKey(destinationKey: string, input: DirectNotificationDedupeInput) {
  const senderIdentity = normalizeNotificationIdentity(input.senderExternalId || input.senderName || "unknown_sender");
  const bucket = Math.floor(input.messageTime.getTime() / IMPLEMENTATION_DEFAULTS.notificationCrossGroupDedupeWindowMs);

  return [
    destinationKey,
    input.source,
    senderIdentity,
    input.normalizedText,
    String(bucket),
  ].join("|");
}

async function ensureNotificationRulesExist(ruleIds: string[]) {
  const uniqueRuleIds = Array.from(new Set(ruleIds));

  if (uniqueRuleIds.length === 0) {
    return [];
  }

  const rules = await rulesRepository.findManyByIds(uniqueRuleIds);

  if (rules.length !== uniqueRuleIds.length) {
    throw new AppError("RULE_NOT_FOUND", "One or more selected rules do not exist", 400);
  }

  return uniqueRuleIds;
}

export async function listNotificationChannels() {
  return notificationsRepository.listChannels();
}

export async function getNotificationChannelById(id: string) {
  const channel = await notificationsRepository.findChannelById(id);

  if (!channel) {
    throw new AppError("CHANNEL_NOT_FOUND", "Notification channel not found", 404);
  }

  return channel;
}

export async function createNotificationChannel(input: {
  type: "TELEGRAM" | "MESSENGER";
  name: string;
  isActive: boolean;
  config: Prisma.InputJsonValue;
  ruleIds: string[];
}) {
  const ruleIds = await ensureNotificationRulesExist(input.ruleIds);

  return notificationsRepository.createChannel({
    ...input,
    ruleIds,
  });
}

export async function updateNotificationChannel(
  id: string,
  input: { name?: string; isActive?: boolean; config?: Prisma.InputJsonValue; ruleIds?: string[] },
) {
  await getNotificationChannelById(id);

  const ruleIds = input.ruleIds === undefined ? undefined : await ensureNotificationRulesExist(input.ruleIds);

  return notificationsRepository.updateChannel(id, {
    ...input,
    ...(ruleIds === undefined ? {} : { ruleIds }),
  });
}

export async function deleteNotificationChannel(id: string) {
  await getNotificationChannelById(id);
  await notificationsRepository.deleteChannel(id);
}

export async function scheduleNotificationDeliveries(
  matchLogId: string,
  payload: NotificationPayload,
  matchedRuleIds: string[],
) {
  return notificationsRepository.createDeliveries({
    matchLogId,
    payload: payload as Prisma.InputJsonValue,
    matchedRuleIds,
  });
}

export async function queueMatchedRuleNotifications(
  payload: NotificationPayload,
  matchedRuleIds: string[],
  dedupeInput: DirectNotificationDedupeInput,
) {
  const matchedRuleIdSet = new Set(matchedRuleIds);
  const channels = await notificationsRepository.listChannels();
  const matchingChannels = channels.filter((channel) => {
    if (!channel.isActive) {
      return false;
    }

    if (channel.notificationChannelRules.length === 0) {
      return true;
    }

    return channel.notificationChannelRules.some((channelRule) => matchedRuleIdSet.has(channelRule.ruleId));
  });
  const dedupedChannels = matchingChannels.filter((channel, index, items) => {
    const currentKey = buildChannelDestinationKey(channel);
    return items.findIndex((candidate) => buildChannelDestinationKey(candidate) === currentKey) === index;
  });
  const expiresAt = new Date(Date.now() + IMPLEMENTATION_DEFAULTS.notificationOutboxTtlMs);
  const items = dedupedChannels.map((channel) => {
    const destinationKey = buildChannelDestinationKey(channel);

    return {
      notificationChannelId: channel.id,
      payload: payload as Prisma.InputJsonValue,
      dedupeKey: buildDirectDedupeKey(destinationKey, dedupeInput),
      expiresAt,
    };
  });

  const created = await notificationsRepository.createOutboxItems(items);

  return created;
}

export async function processDueNotificationDeliveries() {
  await pruneExpiredNotificationRuntimeState();

  const deliveries = await notificationsRepository.listDueDeliveries(
    new Date(),
    IMPLEMENTATION_DEFAULTS.workerClaimBatchSize,
  );

  for (const delivery of deliveries) {
    const nextAttempt = delivery.attempts + 1;
    await notificationsRepository.markProcessing(delivery.id, nextAttempt);

    try {
      if (delivery.notificationChannel.type !== "TELEGRAM") {
        throw new Error("Unsupported notification provider for MVP");
      }

      await telegramProvider.send(
        delivery.payload as NotificationPayload,
        delivery.notificationChannel.config,
      );
      await notificationsRepository.markSent(delivery.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryDelay = IMPLEMENTATION_DEFAULTS.notificationRetryScheduleMs[nextAttempt - 1];

      if (nextAttempt >= env.NOTIFICATION_MAX_ATTEMPTS || !retryDelay) {
        await notificationsRepository.markFailed(delivery.id, message);
      } else {
        await notificationsRepository.markRetry(
          delivery.id,
          message,
          addMilliseconds(new Date(), retryDelay),
        );
      }
    }
  }

  const outboxItems = await notificationsRepository.listDueOutboxItems(
    new Date(),
    IMPLEMENTATION_DEFAULTS.workerClaimBatchSize,
  );

  await dispatchOutboxItems(outboxItems);

  return deliveries.length + outboxItems.length;
}

async function dispatchOutboxItems(
  outboxItems: Awaited<ReturnType<typeof notificationsRepository.listDueOutboxItems>>,
) {
  for (const item of outboxItems) {
    const nextAttempt = item.attempts + 1;
    await notificationsRepository.markOutboxProcessing(item.id, nextAttempt);

    try {
      if (item.notificationChannel.type !== "TELEGRAM") {
        throw new Error("Unsupported notification provider for MVP");
      }

      await telegramProvider.send(
        item.payload as unknown as NotificationPayload,
        item.notificationChannel.config,
      );
      await notificationsRepository.markOutboxSent(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryDelay = IMPLEMENTATION_DEFAULTS.notificationRetryScheduleMs[nextAttempt - 1];

      if (nextAttempt >= env.NOTIFICATION_MAX_ATTEMPTS || !retryDelay) {
        await notificationsRepository.markOutboxFailed(item.id, message);
      } else {
        await notificationsRepository.markOutboxRetry(
          item.id,
          message,
          addMilliseconds(new Date(), retryDelay),
        );
      }
    }
  }
}

async function pruneExpiredNotificationRuntimeState(now = new Date()) {
  if (now.getTime() - lastRuntimeStatePrunedAt < runtimeStatePruneIntervalMs) {
    return;
  }

  lastRuntimeStatePrunedAt = now.getTime();

  await Promise.all([
    messagesRepository.pruneExpiredMessageDedupes(now),
    notificationsRepository.pruneExpiredOutboxItems(now),
  ]);
}

export function summarizeNotificationStatus(statuses: NotificationDeliveryStatus[]) {
  if (statuses.length === 0) {
    return "NONE";
  }

  if (statuses.some((status) => status === NotificationDeliveryStatus.FAILED)) {
    return "FAILED";
  }

  if (statuses.some((status) => status === NotificationDeliveryStatus.RETRY_SCHEDULED)) {
    return "RETRY_SCHEDULED";
  }

  if (statuses.some((status) => status === NotificationDeliveryStatus.PROCESSING)) {
    return "PROCESSING";
  }

  if (statuses.every((status) => status === NotificationDeliveryStatus.SENT)) {
    return "SENT";
  }

  return "PENDING";
}
