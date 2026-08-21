import { appendFile, readFile, unlink } from "node:fs/promises";
import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { logger } from "@/src/lib/logger";
import {
  createSourceAdapter,
  type DiscoveredSourceGroup,
  type SourceAdapter,
  type SourceMessageEvent,
  type SourceRule,
} from "@/src/modules/watchers/source-adapters";

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

async function sendHeartbeat() {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WATCHER_API_KEY}`,
    },
    body: JSON.stringify({
      version: env.WATCHER_VERSION,
      status: "online",
    }),
    signal: AbortSignal.timeout(env.WATCHER_CONTROL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Watcher heartbeat failed with status ${response.status}`);
  }
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

async function flushBuffer(sendMessage: (payload: SourceMessageEvent) => Promise<void>) {
  if (!env.WATCHER_BUFFER_FILE_ENABLED) {
    return;
  }

  try {
    const content = await readFile(env.WATCHER_BUFFER_FILE_PATH, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      await sendMessage(JSON.parse(line) as SourceMessageEvent);
    }

    await unlink(env.WATCHER_BUFFER_FILE_PATH);
  } catch {
    // Ignore missing buffer on boot.
  }
}

async function sendMessage(payload: SourceMessageEvent) {
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
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Watcher ingest failed with status ${response.status}`);
      }

      logger.info("watcher_message_sent", {
        messageExternalId: payload.messageExternalId,
        groupExternalId: payload.groupExternalId,
        attempt,
      });
      return;
    } catch (error) {
      lastError = error;

      if (attempt < IMPLEMENTATION_DEFAULTS.watcherMessageMaxAttempts) {
        const retryDelayMs = Math.min(
          env.WATCHER_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
          env.WATCHER_RETRY_MAX_DELAY_MS,
        );
        logger.warn("watcher_message_retry_scheduled", {
          messageExternalId: payload.messageExternalId,
          groupExternalId: payload.groupExternalId,
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

  await bufferPayload(payload);
  throw lastError;
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

function shouldSyncGroupsFromBrowser() {
  return !env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY && !env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED;
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

  logger.info("watcher_started", { mode });

  await sendHeartbeat();

  const config = await fetchConfig();
  const seedableGroups = toSeedableGroups(config);
  const seedableRules = toSeedableRules(config);
  await adapter.seedKnownGroups?.(seedableGroups);
  await adapter.seedRules?.(seedableRules);
  logger.info("watcher_config_loaded", config);
  logger.info("watcher_config_seeded", { groups: seedableGroups.length, rules: seedableRules.length });

  if (shouldSyncGroupsFromBrowser()) {
    await syncGroupsFromAdapter(adapter);
  }
  await flushBuffer(sendMessage);
  await adapter.start(sendMessage);
  if (shouldSyncGroupsFromBrowser()) {
    await syncGroupsFromAdapter(adapter);
  }

  scheduleRecurringTask("watcher_heartbeat", env.WATCHER_HEARTBEAT_INTERVAL_MS, sendHeartbeat);

  scheduleRecurringTask("watcher_config_refresh", env.WATCHER_CONFIG_SYNC_INTERVAL_MS, async () => {
    const refreshedConfig = await fetchConfig();
    await adapter.seedKnownGroups?.(toSeedableGroups(refreshedConfig));
    await adapter.seedRules?.(toSeedableRules(refreshedConfig));

    if (shouldSyncGroupsFromBrowser()) {
      await syncGroupsFromAdapter(adapter);
    }
  });
}

main().catch((error) => {
  logger.error("watcher_fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
