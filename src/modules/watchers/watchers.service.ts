import { ChannelType, WatcherReportedStatus } from "@prisma/client";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { db } from "@/src/lib/db";
import { AppError } from "@/src/lib/errors";
import { ageInMilliseconds } from "@/src/lib/time";
import { sha256 } from "@/src/lib/crypto";

export async function authenticateWatcherApiKey(apiKey: string) {
  const watcher = await db.watcher.findUnique({
    where: { apiKeyHash: sha256(apiKey) },
  });

  if (!watcher) {
    throw new AppError("UNAUTHORIZED", "Invalid watcher credentials", 401);
  }

  return watcher;
}

export function deriveWatcherStatus(lastHeartbeatAt: Date | null, reportedStatus?: WatcherReportedStatus) {
  const age = ageInMilliseconds(lastHeartbeatAt);

  if (age <= IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.online) {
    return "online";
  }

  if (age <= IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.degraded) {
    return "degraded";
  }

  if (reportedStatus === WatcherReportedStatus.ONLINE && age <= env.WATCHER_HEARTBEAT_INTERVAL_MS * 5) {
    return "degraded";
  }

  return "offline";
}

export async function listWatchers() {
  const watchers = await db.watcher.findMany({
    include: {
      groups: true,
    },
    orderBy: { name: "asc" },
  });

  return watchers.map((watcher) => ({
    ...watcher,
    status: deriveWatcherStatus(watcher.lastHeartbeatAt, watcher.reportedStatus),
  }));
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

export async function getWatcherConfig(watcherId: string) {
  const watcher = await db.watcher.findUnique({ where: { id: watcherId } });

  if (!watcher) {
    throw new AppError("WATCHER_NOT_FOUND", "Watcher not found", 404);
  }

  const groups = await db.group.findMany({
    where: {
      isEnabled: true,
      OR: [{ watcherId }, { watcherId: null }],
    },
    include: {
      groupRules: {
        include: { rule: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rules = groups
    .flatMap((group) => group.groupRules.map((groupRule) => groupRule.rule))
    .filter((rule) => rule.isActive)
    .reduce<typeof groups[number]["groupRules"][number]["rule"][]>((accumulator, rule) => {
      if (!accumulator.some((item) => item.id === rule.id)) {
        accumulator.push(rule);
      }
      return accumulator;
    }, []);

  const channels = await db.notificationChannel.findMany({
    where: { isActive: true, type: ChannelType.TELEGRAM },
    orderBy: { name: "asc" },
  });

  return {
    watcher: {
      id: watcher.id,
      name: watcher.name,
    },
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
