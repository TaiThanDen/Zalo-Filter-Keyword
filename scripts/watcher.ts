import { appendFile, readFile, unlink } from "node:fs/promises";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { logger } from "@/src/lib/logger";
import {
  DEFAULT_WATCHER_SLEEP_SCHEDULE,
  resolveWatcherRuntimeState,
  type WatcherRuntimeControl,
  type WatcherSleepWindow,
} from "@/src/modules/watchers/watcher-schedule";
import {
  createSourceAdapter,
  type DiscoveredSourceGroup,
  type SourceAdapter,
  type SourceMessageEvent,
  type SourceRule,
} from "@/src/modules/watchers/source-adapters";

const WATCHER_MESSAGE_BATCH_SIZE = 3;

async function retryStartupOperation<T>(name: string, operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn("watcher_startup_operation_failed", {
        name,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }
  throw lastError;
}

async function fetchConfig() {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/config`, {
    headers: {
      Authorization: `Bearer ${env.WATCHER_API_KEY}`,
    },
    signal: AbortSignal.timeout(env.WATCHER_CONTROL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Watcher config fetch failed with status ${response.status}`);
  }

  return response.json();
}

function toSeedableGroups(config: unknown): DiscoveredSourceGroup[] {
  if (!config || typeof config !== "object" || !Array.isArray((config as { groups?: unknown[] }).groups)) {
    return [];
  }

  return (config as { groups: Array<{ source?: unknown; externalId?: unknown; name?: unknown }> }).groups
    .filter((group) => group.source === "zalo" && typeof group.externalId === "string" && typeof group.name === "string")
    .map((group) => ({
      source: "zalo" as const,
      externalId: group.externalId as string,
      name: group.name as string,
    }));
}

function toSeedableRules(config: unknown): SourceRule[] {
  if (!config || typeof config !== "object" || !Array.isArray((config as { rules?: unknown[] }).rules)) {
    return [];
  }

  return (config as { rules: Array<Record<string, unknown>> }).rules
    .filter((rule) => typeof rule.id === "string" && typeof rule.pattern === "string")
    .map((rule) => ({
      id: rule.id as string,
      type: rule.type === "EXCLUDE" ? "EXCLUDE" : "INCLUDE",
      pattern: rule.pattern as string,
      matchType: rule.matchType === "WHOLE_WORD" ? "WHOLE_WORD" : "CONTAINS",
      caseSensitive: rule.caseSensitive === true,
    }));
}

async function sendHeartbeat(status: "online" | "offline" = "online") {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WATCHER_API_KEY}`,
    },
    body: JSON.stringify({
      version: env.WATCHER_VERSION,
      status,
    }),
    signal: AbortSignal.timeout(env.WATCHER_CONTROL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Watcher heartbeat failed with status ${response.status}`);
  }
}

async function fetchRuntimeControl() {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/runtime`, {
    headers: { Authorization: `Bearer ${env.WATCHER_API_KEY}` },
    signal: AbortSignal.timeout(env.WATCHER_CONTROL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Watcher runtime fetch failed with status ${response.status}`);
  return response.json();
}

function toRuntimeControl(config: unknown): WatcherRuntimeControl {
  if (!config || typeof config !== "object") {
    return { controlMode: "scheduled", sleepSchedule: { ...DEFAULT_WATCHER_SLEEP_SCHEDULE } };
  }

  const input = config as { controlMode?: unknown; sleepSchedule?: unknown };
  const schedule = input.sleepSchedule;

  if (!schedule || typeof schedule !== "object") {
    return { controlMode: "scheduled", sleepSchedule: { ...DEFAULT_WATCHER_SLEEP_SCHEDULE } };
  }

  const candidate = schedule as Record<string, unknown>;

  if (
    typeof candidate.enabled !== "boolean" ||
    !Number.isInteger(candidate.startMinute) ||
    !Number.isInteger(candidate.endMinute) ||
    typeof candidate.timezone !== "string"
  ) {
    return { controlMode: "scheduled", sleepSchedule: { ...DEFAULT_WATCHER_SLEEP_SCHEDULE } };
  }

  const validWindows = Array.isArray(candidate.windows)
    ? candidate.windows.filter((value): value is WatcherSleepWindow => {
      if (!value || typeof value !== "object") return false;
      const window = value as Record<string, unknown>;
      return Number.isInteger(window.startMinute) && Number.isInteger(window.endMinute)
        && Number(window.startMinute) >= 0 && Number(window.startMinute) < 1440
        && Number(window.endMinute) >= 0 && Number(window.endMinute) < 1440
        && window.startMinute !== window.endMinute;
    })
    : [];
  const controlMode = input.controlMode === "paused" || input.controlMode === "running" ? input.controlMode : "scheduled";

  return {
    controlMode,
    sleepSchedule: {
      enabled: candidate.enabled,
      windows: validWindows.length > 0 ? validWindows : [{
        startMinute: candidate.startMinute as number,
        endMinute: candidate.endMinute as number,
      }],
      startMinute: candidate.startMinute as number,
      endMinute: candidate.endMinute as number,
      timezone: candidate.timezone,
    },
  };
}

async function syncGroups(groups: DiscoveredSourceGroup[]) {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/groups/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WATCHER_API_KEY}`,
    },
    body: JSON.stringify({ groups }),
    signal: AbortSignal.timeout(env.WATCHER_CONTROL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Watcher group sync failed with status ${response.status}`);
  }

  return response.json() as Promise<{ total: number; created: number; updated: number }>;
}

async function bufferPayload(payload: SourceMessageEvent) {
  if (!env.WATCHER_BUFFER_FILE_ENABLED) {
    return;
  }

  await appendFile(env.WATCHER_BUFFER_FILE_PATH, `${JSON.stringify(payload)}\n`, "utf8");
}

async function flushBuffer(sendMessages: (payloads: SourceMessageEvent[]) => Promise<void>) {
  if (!env.WATCHER_BUFFER_FILE_ENABLED) {
    return;
  }

  try {
    const content = await readFile(env.WATCHER_BUFFER_FILE_PATH, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    const payloads = lines.map((line) => JSON.parse(line) as SourceMessageEvent);

    for (let index = 0; index < payloads.length; index += WATCHER_MESSAGE_BATCH_SIZE) {
      await sendMessages(payloads.slice(index, index + WATCHER_MESSAGE_BATCH_SIZE));
    }

    await unlink(env.WATCHER_BUFFER_FILE_PATH);
  } catch {
    // Ignore missing buffer on boot.
  }
}

async function deliverMessages(payloads: SourceMessageEvent[]) {
  if (payloads.length === 0) {
    return;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= IMPLEMENTATION_DEFAULTS.watcherMessageMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.WATCHER_INGEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.WATCHER_API_KEY}`,
        },
        body: JSON.stringify({ messages: payloads }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Watcher ingest failed with status ${response.status}`);
      }

      for (const payload of payloads) {
        logger.info("watcher_message_sent", {
          messageExternalId: payload.messageExternalId,
          groupExternalId: payload.groupExternalId,
          attempt,
          batchSize: payloads.length,
        });
      }
      return;
    } catch (error) {
      lastError = error;

      if (attempt < IMPLEMENTATION_DEFAULTS.watcherMessageMaxAttempts) {
        const retryDelayMs = Math.min(
          env.WATCHER_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
          env.WATCHER_RETRY_MAX_DELAY_MS,
        );
        logger.warn("watcher_message_retry_scheduled", {
          messageExternalId: payloads[0]?.messageExternalId,
          groupExternalId: payloads[0]?.groupExternalId,
          batchSize: payloads.length,
          attempt,
          retryDelayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function createMessageDispatcher() {
  const queue: SourceMessageEvent[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  let flushChain = Promise.resolve();

  const flush = () => {
    const run = async () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      while (queue.length > 0) {
        const batch = queue.splice(0, WATCHER_MESSAGE_BATCH_SIZE);

        try {
          await deliverMessages(batch);
        } catch (error) {
          await Promise.all(batch.map((payload) => bufferPayload(payload)));
          logger.error("watcher_message_batch_failed", {
            batchSize: batch.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };

    flushChain = flushChain.then(run, run);
    return flushChain;
  };

  const enqueue = async (payload: SourceMessageEvent) => {
    queue.push(payload);

    if (queue.length >= WATCHER_MESSAGE_BATCH_SIZE) {
      void flush();
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        void flush();
      }, 1_000);
    }
  };

  return { enqueue, flush };
}

function scheduleRecurringTask(
  eventName: string,
  intervalMs: number,
  task: () => Promise<void>,
) {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      logger.warn(`${eventName}_failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTimeout(() => {
        void run();
      }, intervalMs);
    }
  };

  setTimeout(() => {
    void run();
  }, intervalMs);
}

async function syncGroupsFromAdapter(adapter: SourceAdapter) {
  const groups = await adapter.listGroups();

  if (groups.length === 0) {
    logger.info("watcher_group_sync_skipped", { reason: "no_groups_detected" });
    return;
  }

  const result = await syncGroups(groups);
  logger.info("watcher_group_sync_completed", result);
}

async function main() {
  const mode = process.argv.includes("--mode=mock") ? "mock" : "adapter";
  const adapter = createSourceAdapter(mode);
  const messageDispatcher = createMessageDispatcher();
  let runtimeControl: WatcherRuntimeControl = {
    controlMode: "scheduled",
    sleepSchedule: { ...DEFAULT_WATCHER_SLEEP_SCHEDULE },
  };
  let sleeping = false;
  let sleepTransition = Promise.resolve();

  logger.info("watcher_started", { mode });

  const config = await retryStartupOperation("config", fetchConfig);
  runtimeControl = toRuntimeControl(config);
  sleeping = resolveWatcherRuntimeState(runtimeControl).paused;
  const seedableGroups = toSeedableGroups(config);
  const seedableRules = toSeedableRules(config);
  await adapter.seedKnownGroups?.(seedableGroups);
  await adapter.seedRules?.(seedableRules);
  await adapter.setPaused?.(sleeping);
  logger.info("watcher_config_loaded", {
    groups: seedableGroups.length,
    rules: seedableRules.length,
  });
  logger.info("watcher_sleep_schedule_loaded", {
    ...runtimeControl,
    sleeping,
  });

  await sendHeartbeat(sleeping ? "offline" : "online");

  const handleSourceEvent = async (payload: SourceMessageEvent) => {
    if (sleeping) {
      return;
    }

    await messageDispatcher.enqueue(payload);
  };

  adapter.setConnectionStatusHandler?.(async (online) => {
    await sendHeartbeat(!sleeping && online ? "online" : "offline");
  });

  if (!sleeping) {
    await flushBuffer(deliverMessages);
  }
  await adapter.start(handleSourceEvent);
  if (!sleeping) {
    void syncGroupsFromAdapter(adapter).catch((error) => {
      logger.warn("watcher_initial_group_sync_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const reconcileSleepState = (reason: string) => {
    const runTransition = async () => {
      const runtimeState = resolveWatcherRuntimeState(runtimeControl);
      const shouldSleep = runtimeState.paused;

      if (shouldSleep === sleeping) {
        return;
      }

      if (shouldSleep) {
        sleeping = true;
        await adapter.setPaused?.(true);
        await messageDispatcher.flush();
        await sendHeartbeat("offline");
        logger.info("watcher_sleep_started", { reason, pauseReason: runtimeState.reason, ...runtimeControl });
        return;
      }

      await adapter.setPaused?.(false);
      sleeping = false;
      await flushBuffer(deliverMessages);
      await sendHeartbeat("online");
      logger.info("watcher_sleep_ended", { reason, resumeReason: runtimeState.reason, ...runtimeControl });
    };

    sleepTransition = sleepTransition.then(runTransition, runTransition);
    return sleepTransition;
  };

  scheduleRecurringTask("watcher_sleep_reconcile", 15_000, () => reconcileSleepState("clock"));

  scheduleRecurringTask("watcher_runtime_refresh", env.WATCHER_RUNTIME_SYNC_INTERVAL_MS, async () => {
    runtimeControl = toRuntimeControl(await fetchRuntimeControl());
    await reconcileSleepState("runtime_refresh");
  });

  scheduleRecurringTask("watcher_heartbeat", env.WATCHER_HEARTBEAT_INTERVAL_MS, async () => {
    if (!sleeping) {
      await sendHeartbeat(adapter.isHealthy?.() === false ? "offline" : "online");
    }
  });

  scheduleRecurringTask("watcher_group_sync", env.WATCHER_ZCA_GROUP_SYNC_INTERVAL_MS, async () => {
    if (!sleeping && adapter.isHealthy?.() !== false) {
      await syncGroupsFromAdapter(adapter);
    }
  });

  scheduleRecurringTask("watcher_config_refresh", env.WATCHER_CONFIG_SYNC_INTERVAL_MS, async () => {
    const refreshedConfig = await fetchConfig();
    runtimeControl = toRuntimeControl(refreshedConfig);
    await reconcileSleepState("config_refresh");
    await adapter.seedKnownGroups?.(toSeedableGroups(refreshedConfig));
    await adapter.seedRules?.(toSeedableRules(refreshedConfig));
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("watcher_shutdown_started", { signal });

    try {
      await adapter.stop();
      await messageDispatcher.flush();
      await sendHeartbeat("offline");
    } catch (error) {
      logger.warn("watcher_shutdown_failed", {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  logger.error("watcher_fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
