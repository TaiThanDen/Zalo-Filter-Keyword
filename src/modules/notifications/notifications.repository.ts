import { NotificationDeliveryStatus, Prisma } from "@prisma/client";
import { db } from "@/src/lib/db";

export const notificationsRepository = {
  listChannels() {
    return db.notificationChannel.findMany({
      orderBy: { updatedAt: "desc" },
    });
  },
  findChannelById(id: string) {
    return db.notificationChannel.findUnique({ where: { id } });
  },
  createChannel(data: {
    type: "TELEGRAM" | "MESSENGER";
    name: string;
    isActive: boolean;
    config: Prisma.InputJsonValue;
  }) {
    return db.notificationChannel.create({ data });
  },
  updateChannel(id: string, data: { name?: string; isActive?: boolean; config?: Prisma.InputJsonValue }) {
    return db.notificationChannel.update({ where: { id }, data });
  },
  createDeliveries(data: {
    matchLogId: string;
    payload: Prisma.InputJsonValue;
  }) {
    return db.$transaction(async (tx) => {
      const channels = await tx.notificationChannel.findMany({ where: { isActive: true } });

      if (channels.length === 0) {
        return [];
      }

      return Promise.all(
        channels.map((channel) =>
          tx.notificationDelivery.create({
            data: {
              matchLogId: data.matchLogId,
              notificationChannelId: channel.id,
              payload: data.payload,
            },
          }),
        ),
      );
    });
  },
  listDueDeliveries(now: Date, take: number) {
    return db.notificationDelivery.findMany({
      where: {
        OR: [
          { status: NotificationDeliveryStatus.PENDING },
          {
            status: NotificationDeliveryStatus.RETRY_SCHEDULED,
            nextRetryAt: { lte: now },
          },
        ],
      },
      include: {
        notificationChannel: true,
        matchLog: {
          include: {
            inboundMessage: {
              include: {
                group: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take,
    });
  },
  markProcessing(id: string, attempts: number) {
    return db.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.PROCESSING,
        attempts,
      },
    });
  },
  markSent(id: string) {
    return db.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        lastError: null,
        nextRetryAt: null,
      },
    });
  },
  markRetry(id: string, lastError: string, nextRetryAt: Date) {
    return db.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.RETRY_SCHEDULED,
        lastError,
        nextRetryAt,
      },
    });
  },
  markFailed(id: string, lastError: string) {
    return db.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        lastError,
        nextRetryAt: null,
      },
    });
  },
};
