import { NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { IMPLEMENTATION_DEFAULTS } from '@/src/config/constants';
import { db } from '@/src/lib/db';

type TelegramConfig = {
  botToken?: string;
  chatId?: string;
  parseMode?: string;
};

function normalizeNotificationIdentity(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const notificationChannelWithRulesArgs = Prisma.validator<Prisma.NotificationChannelDefaultArgs>()({
  include: {
    notificationChannelRules: {
      include: {
        rule: true,
      },
      orderBy: {
        rule: {
          pattern: 'asc',
        },
      },
    },
  },
});

export type NotificationChannelWithRules = Prisma.NotificationChannelGetPayload<typeof notificationChannelWithRulesArgs>;

function buildChannelDestinationKey(channel: {
  id: string;
  type: 'TELEGRAM' | 'MESSENGER';
  config: Prisma.JsonValue;
}) {
  if (channel.type !== 'TELEGRAM') {
    return `${channel.type}:${channel.id}`;
  }

  const config = (channel.config ?? {}) as TelegramConfig;
  return [
    channel.type,
    String(config.botToken ?? ''),
    String(config.chatId ?? ''),
    String(config.parseMode ?? ''),
  ].join('|');
}

function dedupeRuleIds(ruleIds: string[]) {
  return Array.from(new Set(ruleIds));
}

function buildCrossGroupDeliveryLockKey(input: {
  destinationKey: string;
  source: string;
  normalizedText: string;
  senderExternalId?: string | null;
  senderName?: string | null;
}) {
  const senderIdentity = normalizeNotificationIdentity(input.senderExternalId || input.senderName || 'unknown_sender');

  return [
    input.destinationKey,
    input.source,
    senderIdentity,
    input.normalizedText,
  ].join('|');
}

function buildNotificationSenderWhere(input: {
  senderExternalId?: string | null;
  senderName?: string | null;
}): Prisma.InboundMessageWhereInput {
  if (input.senderExternalId) {
    return { senderExternalId: input.senderExternalId };
  }

  if (input.senderName) {
    return {
      senderName: {
        equals: input.senderName,
        mode: 'insensitive',
      },
    };
  }

  return {
    senderExternalId: null,
    senderName: null,
  };
}

function isDeliveryChannelConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2002'
    && Array.isArray(error.meta?.target)
    && error.meta.target.includes('matchLogId')
    && error.meta.target.includes('notificationChannelId')
  );
}

function isOutboxDedupeConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2002'
    && Array.isArray(error.meta?.target)
    && error.meta.target.includes('dedupeKey')
  );
}

export const notificationsRepository = {
  listChannels() {
    return db.notificationChannel.findMany({
      include: notificationChannelWithRulesArgs.include,
      orderBy: { updatedAt: 'desc' },
    });
  },
  findChannelById(id: string) {
    return db.notificationChannel.findUnique({
      where: { id },
      include: notificationChannelWithRulesArgs.include,
    });
  },
  createChannel(data: {
    type: 'TELEGRAM' | 'MESSENGER';
    name: string;
    isActive: boolean;
    config: Prisma.InputJsonValue;
    ruleIds: string[];
  }) {
    const ruleIds = dedupeRuleIds(data.ruleIds);

    return db.notificationChannel.create({
      data: {
        type: data.type,
        name: data.name,
        isActive: data.isActive,
        config: data.config,
        ...(ruleIds.length > 0
          ? {
              notificationChannelRules: {
                createMany: {
                  data: ruleIds.map((ruleId) => ({ ruleId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: notificationChannelWithRulesArgs.include,
    });
  },
  updateChannel(id: string, data: { name?: string; isActive?: boolean; config?: Prisma.InputJsonValue; ruleIds?: string[] }) {
    const ruleIds = data.ruleIds === undefined ? undefined : dedupeRuleIds(data.ruleIds);

    return db.notificationChannel.update({
      where: { id },
      data: {
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        ...(data.config === undefined ? {} : { config: data.config }),
        ...(ruleIds === undefined
          ? {}
          : {
              notificationChannelRules: {
                deleteMany: {},
                ...(ruleIds.length > 0
                  ? {
                      createMany: {
                        data: ruleIds.map((ruleId) => ({ ruleId })),
                        skipDuplicates: true,
                      },
                    }
                  : {}),
              },
            }),
      },
      include: notificationChannelWithRulesArgs.include,
    });
  },
  deleteChannel(id: string) {
    return db.notificationChannel.delete({ where: { id } });
  },
  createDeliveries(data: {
    matchLogId: string;
    payload: Prisma.InputJsonValue;
    matchedRuleIds: string[];
  }) {
    return db.$transaction(async (tx) => {
      const matchedRuleIds = new Set(data.matchedRuleIds);
      const currentMatchLog = await tx.matchLog.findUniqueOrThrow({
        where: { id: data.matchLogId },
        include: {
          inboundMessage: {
            select: {
              source: true,
              normalizedText: true,
              senderExternalId: true,
              senderName: true,
              messageTime: true,
            },
          },
        },
      });
      const duplicateWindowStart = new Date(
        currentMatchLog.inboundMessage.messageTime.getTime() - IMPLEMENTATION_DEFAULTS.notificationCrossGroupDedupeWindowMs,
      );
      const duplicateWindowEnd = new Date(
        currentMatchLog.inboundMessage.messageTime.getTime() + IMPLEMENTATION_DEFAULTS.notificationCrossGroupDedupeWindowMs,
      );
      const channels = await tx.notificationChannel.findMany({
        where: { isActive: true },
        include: {
          notificationChannelRules: {
            select: {
              ruleId: true,
            },
          },
        },
      });

      if (channels.length === 0) {
        return [];
      }

      const matchingChannels = channels.filter((channel) => {
        if (channel.notificationChannelRules.length === 0) {
          return true;
        }

        if (matchedRuleIds.size === 0) {
          return false;
        }

        return channel.notificationChannelRules.some((channelRule) => matchedRuleIds.has(channelRule.ruleId));
      });

      const dedupedChannels = matchingChannels.filter((channel, index, items) => {
        const currentKey = buildChannelDestinationKey(channel);
        return items.findIndex((candidate) => buildChannelDestinationKey(candidate) === currentKey) === index;
      });
      const destinationChannelIdsByKey = new Map<string, string[]>();

      for (const channel of matchingChannels) {
        const destinationKey = buildChannelDestinationKey(channel);
        const currentIds = destinationChannelIdsByKey.get(destinationKey) ?? [];
        currentIds.push(channel.id);
        destinationChannelIdsByKey.set(destinationKey, currentIds);
      }

      const deliveries = [];

      for (const channel of dedupedChannels) {
        const destinationKey = buildChannelDestinationKey(channel);
        const destinationChannelIds = destinationChannelIdsByKey.get(destinationKey) ?? [channel.id];
        const dedupeLockKey = buildCrossGroupDeliveryLockKey({
          destinationKey,
          source: currentMatchLog.inboundMessage.source,
          normalizedText: currentMatchLog.inboundMessage.normalizedText,
          senderExternalId: currentMatchLog.inboundMessage.senderExternalId,
          senderName: currentMatchLog.inboundMessage.senderName,
        });

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dedupeLockKey}))`;

        const existingDelivery = await tx.notificationDelivery.findFirst({
          where: {
            notificationChannelId: {
              in: destinationChannelIds,
            },
            status: {
              in: [
                NotificationDeliveryStatus.PENDING,
                NotificationDeliveryStatus.PROCESSING,
                NotificationDeliveryStatus.SENT,
                NotificationDeliveryStatus.RETRY_SCHEDULED,
              ],
            },
            matchLog: {
              inboundMessage: {
                source: currentMatchLog.inboundMessage.source,
                normalizedText: currentMatchLog.inboundMessage.normalizedText,
                messageTime: {
                  gte: duplicateWindowStart,
                  lte: duplicateWindowEnd,
                },
                ...buildNotificationSenderWhere(currentMatchLog.inboundMessage),
              },
            },
          },
          select: { id: true },
        });

        if (existingDelivery) {
          continue;
        }

        try {
          deliveries.push(
            await tx.notificationDelivery.create({
              data: {
                matchLogId: data.matchLogId,
                notificationChannelId: channel.id,
                payload: data.payload,
              },
            }),
          );
        } catch (error) {
          if (!isDeliveryChannelConflict(error)) {
            throw error;
          }
        }
      }

      return deliveries;
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
      orderBy: { createdAt: 'asc' },
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
  async createOutboxItems(items: Array<{
    notificationChannelId: string;
    payload: Prisma.InputJsonValue;
    dedupeKey: string;
    expiresAt: Date;
  }>) {
    const created = [];

    for (const item of items) {
      try {
        created.push(
          await db.notificationOutbox.create({
            data: item,
          }),
        );
      } catch (error) {
        if (!isOutboxDedupeConflict(error)) {
          throw error;
        }
      }
    }

    return created;
  },
  listOutboxItemsByIds(ids: string[]) {
    return db.notificationOutbox.findMany({
      where: {
        id: {
          in: ids,
        },
        status: {
          in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.RETRY_SCHEDULED],
        },
      },
      include: {
        notificationChannel: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },
  listDueOutboxItems(now: Date, take: number) {
    return db.notificationOutbox.findMany({
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
      },
      orderBy: { createdAt: 'asc' },
      take,
    });
  },
  markOutboxProcessing(id: string, attempts: number) {
    return db.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.PROCESSING,
        attempts,
      },
    });
  },
  markOutboxSent(id: string) {
    return db.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        lastError: null,
        nextRetryAt: null,
      },
    });
  },
  markOutboxRetry(id: string, lastError: string, nextRetryAt: Date) {
    return db.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.RETRY_SCHEDULED,
        lastError,
        nextRetryAt,
      },
    });
  },
  markOutboxFailed(id: string, lastError: string) {
    return db.notificationOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        lastError,
        nextRetryAt: null,
      },
    });
  },
  pruneExpiredOutboxItems(now = new Date()) {
    return db.notificationOutbox.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
        status: {
          in: [NotificationDeliveryStatus.SENT, NotificationDeliveryStatus.FAILED],
        },
      },
    });
  },
};


