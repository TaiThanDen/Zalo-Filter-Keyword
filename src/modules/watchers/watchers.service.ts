import { ChannelType, Prisma, WatcherReportedStatus } from "@prisma/client";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { db } from "@/src/lib/db";
import { AppError } from "@/src/lib/errors";
import { ageInMilliseconds } from "@/src/lib/time";
import { sha256 } from "@/src/lib/crypto";
import { groupsRepository } from "@/src/modules/groups/groups.repository";
import {
  resolveWatcherRuntimeControl,
  resolveWatcherRuntimeState,
} from "@/src/modules/watchers/watcher-schedule";

export async function authenticateWatcherApiKey(apiKey: string) {
  const watcher = await db.watcher.findUnique({
    where: { apiKeyHash: sha256(apiKey) },
  });

  if (!watcher) {
    throw new AppError("UNAUTHORIZED", "Invalid watcher credentials", 401);
  }

  return watcher;
}

export function deriveWatcherStatus(lastHeartbeatAt: Date | null) {
  const age = ageInMilliseconds(lastHeartbeatAt);
  const onlineThresholdMs = Math.max(
    IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.online,
    env.WATCHER_HEARTBEAT_INTERVAL_MS * 1.5,
  );
  const degradedThresholdMs = Math.max(
    IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.degraded,
    env.WATCHER_HEARTBEAT_INTERVAL_MS * 3,
  );

  if (age <= onlineThresholdMs) {
    return "online";
  }

  if (age <= degradedThresholdMs) {
    return "degraded";
  }

  return "offline";
}

export async function listWatchers() {
  const watchers = await db.watcher.findMany({
    select: {
      id: true,
      name: true,
      reportedStatus: true,
      lastHeartbeatAt: true,
      lastSeenIp: true,
      lastVersion: true,
      createdAt: true,
      updatedAt: true,
      runtimeConfig: {
        select: {
          sleepEnabled: true,
          controlMode: true,
          sleepStartMinute: true,
          sleepEndMinute: true,
          sleepWindows: true,
          sleepTimezone: true,
        },
      },
      groups: {
        select: {
          id: true,
          name: true,
          externalId: true,
          source: true,
          isEnabled: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return watchers.map((watcher) => {
    const runtimeControl = resolveWatcherRuntimeControl(watcher.runtimeConfig);
    const runtimeState = resolveWatcherRuntimeState(runtimeControl);

    return {
      ...watcher,
      ...runtimeControl,
      status: runtimeState.paused
        ? runtimeState.reason === "manual" ? "paused" : "sleeping"
        : deriveWatcherStatus(watcher.lastHeartbeatAt),
    };
  });
}

export async function recordHeartbeat(
  watcherId: string,
  input: { version: string; status: "online" | "degraded" | "offline" },
  ipAddress?: string | null,
) {
  const reportedStatus =
    input.status === "online"
      ? WatcherReportedStatus.ONLINE
      : input.status === "degraded"
        ? WatcherReportedStatus.DEGRADED
        : WatcherReportedStatus.OFFLINE;

  return db.watcher.update({
    where: { id: watcherId },
    data: {
      lastHeartbeatAt: new Date(),
      lastVersion: input.version,
      lastSeenIp: ipAddress ?? null,
      reportedStatus,
    },
  });
}

export async function recordAuthenticatedHeartbeat(
  apiKey: string,
  input: { version: string; status: "online" | "degraded" | "offline" },
  ipAddress?: string | null,
) {
  const reportedStatus =
    input.status === "online"
      ? WatcherReportedStatus.ONLINE
      : input.status === "degraded"
        ? WatcherReportedStatus.DEGRADED
        : WatcherReportedStatus.OFFLINE;

  try {
    return await db.watcher.update({
      where: { apiKeyHash: sha256(apiKey) },
      data: {
        lastHeartbeatAt: new Date(),
        lastVersion: input.version,
        lastSeenIp: ipAddress ?? null,
        reportedStatus,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError("UNAUTHORIZED", "Invalid watcher credentials", 401);
    }

    throw error;
  }
}

export async function syncWatcherGroups(
  watcherId: string,
  groups: Array<{ source: string; externalId: string; name: string }>,
) {
  return groupsRepository.syncDiscoveredGroups(watcherId, groups);
}

export async function getWatcherConfig(watcherId: string) {
  const [watcher, groups, channels] = await Promise.all([
    db.watcher.findUnique({
      where: { id: watcherId },
      select: {
        id: true,
        name: true,
        runtimeConfig: {
          select: {
            sleepEnabled: true,
            controlMode: true,
            sleepStartMinute: true,
            sleepEndMinute: true,
            sleepWindows: true,
            sleepTimezone: true,
          },
        },
      },
    }),
    db.group.findMany({
      where: {
        isEnabled: true,
        OR: [{ watcherId }, { watcherId: null }],
      },
      select: {
        id: true,
        source: true,
        externalId: true,
        name: true,
        isEnabled: true,
        groupRules: {
          where: {
            rule: {
              isActive: true,
            },
          },
          select: {
            rule: {
              select: {
                id: true,
                type: true,
                pattern: true,
                matchType: true,
                caseSensitive: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.notificationChannel.findMany({
      where: { isActive: true, type: ChannelType.TELEGRAM },
      select: {
        id: true,
        type: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!watcher) {
    throw new AppError("WATCHER_NOT_FOUND", "Watcher not found", 404);
  }

  const rulesById = new Map<string, typeof groups[number]["groupRules"][number]["rule"]>();

  for (const group of groups) {
    for (const groupRule of group.groupRules) {
      rulesById.set(groupRule.rule.id, groupRule.rule);
    }
  }

  const rules = Array.from(rulesById.values());

  return {
    watcher: {
      id: watcher.id,
      name: watcher.name,
    },
    ...resolveWatcherRuntimeControl(watcher.runtimeConfig),
    groups: groups.map((group) => ({
      id: group.id,
      source: group.source,
      externalId: group.externalId,
      name: group.name,
      isEnabled: group.isEnabled,
    })),
    rules: rules.map((rule) => ({
      id: rule.id,
      type: rule.type,
      pattern: rule.pattern,
      matchType: rule.matchType,
      caseSensitive: rule.caseSensitive,
    })),
    channels: channels.map((channel) => ({
      id: channel.id,
      type: channel.type,
      isActive: channel.isActive,
    })),
  };
}

export async function getAuthenticatedWatcherRuntime(apiKey: string) {
  const watcher = await db.watcher.findUnique({
    where: { apiKeyHash: sha256(apiKey) },
    select: {
      runtimeConfig: {
        select: {
          controlMode: true,
          sleepEnabled: true,
          sleepStartMinute: true,
          sleepEndMinute: true,
          sleepWindows: true,
          sleepTimezone: true,
        },
      },
    },
  });

  if (!watcher) {
    throw new AppError("UNAUTHORIZED", "Invalid watcher credentials", 401);
  }

  return resolveWatcherRuntimeControl(watcher.runtimeConfig);
}
