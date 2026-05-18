import { Prisma } from "@prisma/client";
import { resolvePagination } from "@/src/lib/pagination";
import { db } from "@/src/lib/db";
import { AppError } from "@/src/lib/errors";
import { summarizeNotificationStatus } from "@/src/modules/notifications/notifications.service";

export async function listLogs(input: {
  groupId?: string;
  decision?:
    | "MATCHED"
    | "REJECTED_NO_INCLUDE"
    | "REJECTED_BY_EXCLUDE"
    | "REJECTED_GROUP_DISABLED"
    | "REJECTED_DUPLICATE"
    | "REJECTED_UNKNOWN_GROUP";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const pagination = resolvePagination(input.page, input.pageSize);
  const filters: Prisma.MatchLogWhereInput[] = [];

  if (input.groupId) {
    filters.push({
      inboundMessage: {
        is: {
          groupId: input.groupId,
        },
      },
    });
  }

  if (input.decision) {
    filters.push({ decision: input.decision });
  }

  if (input.search) {
    filters.push({
      inboundMessage: {
        is: {
          OR: [
            { messageText: { contains: input.search, mode: "insensitive" } },
            { senderName: { contains: input.search, mode: "insensitive" } },
            { groupName: { contains: input.search, mode: "insensitive" } },
          ],
        },
      },
    });
  }

  if (input.from || input.to) {
    filters.push({
      processedAt: {
        ...(input.from ? { gte: new Date(input.from) } : {}),
        ...(input.to ? { lte: new Date(input.to) } : {}),
      },
    });
  }

  const where: Prisma.MatchLogWhereInput = filters.length > 0 ? { AND: filters } : {};

  const [items, total] = await Promise.all([
    db.matchLog.findMany({
      where,
      include: {
        inboundMessage: {
          include: {
            group: true,
          },
        },
        notificationDeliveries: true,
      },
      orderBy: { processedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    db.matchLog.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      messageId: item.inboundMessageId,
      groupName:
        item.inboundMessage.group?.name ||
        item.inboundMessage.groupName ||
        item.inboundMessage.groupExternalId,
      senderName: item.inboundMessage.senderName || item.inboundMessage.senderExternalId || "Unknown sender",
      messageText: item.inboundMessage.messageText,
      decision: item.decision,
      reason: item.reason,
      matchedIncludeRules:
        (item.matchedIncludeRules as Array<{ pattern: string }> | null)?.map((rule) => rule.pattern) ?? [],
      matchedExcludeRules:
        (item.matchedExcludeRules as Array<{ pattern: string }> | null)?.map((rule) => rule.pattern) ?? [],
      messageTime: item.inboundMessage.messageTime.toISOString(),
      notificationStatus: summarizeNotificationStatus(
        item.notificationDeliveries.map((delivery) => delivery.status),
      ),
    })),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    },
  };
}

export async function getLogDetail(id: string) {
  const log = await db.matchLog.findUnique({
    where: { id },
    include: {
      inboundMessage: {
        include: {
          group: true,
          watcher: true,
        },
      },
      notificationDeliveries: {
        include: {
          notificationChannel: true,
        },
      },
    },
  });

  if (!log) {
    throw new AppError("LOG_NOT_FOUND", "Log not found", 404);
  }

  return log;
}

export async function getDashboardStats() {
  const [
    totalGroups,
    enabledGroups,
    activeRules,
    legacyMatches24h,
    outboxAlerts24h,
    legacyFailedDeliveries,
    outboxFailedDeliveries,
    watchers,
  ] = await Promise.all([
    db.group.count(),
    db.group.count({ where: { isEnabled: true } }),
    db.rule.count({ where: { isActive: true } }),
    db.matchLog.count({
      where: {
        decision: "MATCHED",
        processedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.notificationOutbox.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.notificationDelivery.count({ where: { status: "FAILED" } }),
    db.notificationOutbox.count({ where: { status: "FAILED" } }),
    db.watcher.findMany(),
  ]);

  return {
    totalGroups,
    enabledGroups,
    activeRules,
    matches24h: legacyMatches24h + outboxAlerts24h,
    failedDeliveries: legacyFailedDeliveries + outboxFailedDeliveries,
    watchersOnline: watchers.filter(
      (watcher) => watcher.lastHeartbeatAt && Date.now() - watcher.lastHeartbeatAt.getTime() <= 60_000,
    ).length,
  };
}
