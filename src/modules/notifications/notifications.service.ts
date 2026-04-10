import { NotificationDeliveryStatus, Prisma } from "@prisma/client";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { addMilliseconds } from "@/src/lib/time";
import { AppError } from "@/src/lib/errors";
import { notificationsRepository } from "@/src/modules/notifications/notifications.repository";
import { telegramProvider } from "@/src/modules/notifications/telegram.provider";
import type { NotificationPayload } from "@/src/modules/notifications/notifications.types";

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
}) {
  return notificationsRepository.createChannel(input);
}

export async function updateNotificationChannel(
  id: string,
  input: { name?: string; isActive?: boolean; config?: Prisma.InputJsonValue },
) {
  await getNotificationChannelById(id);
  return notificationsRepository.updateChannel(id, input);
}

export async function scheduleNotificationDeliveries(
  matchLogId: string,
  payload: NotificationPayload,
) {
  return notificationsRepository.createDeliveries({
    matchLogId,
    payload: payload as Prisma.InputJsonValue,
  });
}

export async function processDueNotificationDeliveries() {
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

  return deliveries.length;
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
