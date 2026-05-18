import { appendFile, readFile, unlink } from "node:fs/promises";
import { env } from "@/src/config/env";
import { logger } from "@/src/lib/logger";
import {
  createSourceAdapter,
  type DiscoveredSourceGroup,
  type SourceMessageEvent,
} from "@/src/modules/watchers/source-adapters";

async function fetchConfig() {
  const response = await fetch(`${env.WATCHER_API_BASE_URL}/api/watcher/config`, {
    headers: {
      Authorization: `Bearer ${env.WATCHER_API_KEY}`,
    },
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
    });
  } catch (error) {
    await bufferPayload(payload);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncGroupsFromAdapter(adapter: ReturnType<typeof createSourceAdapter>) {
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
  await adapter.seedKnownGroups?.(seedableGroups);
  logger.info("watcher_config_loaded", config);
  logger.info("watcher_config_seeded", { groups: seedableGroups.length });

  await syncGroupsFromAdapter(adapter);
  await flushBuffer(sendMessage);
  await adapter.start(sendMessage);
  await syncGroupsFromAdapter(adapter);

  setInterval(() => {
    sendHeartbeat().catch((error) => {
      logger.warn("watcher_heartbeat_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, env.WATCHER_HEARTBEAT_INTERVAL_MS);

  setInterval(() => {
    fetchConfig()
      .then((config) => adapter.seedKnownGroups?.(toSeedableGroups(config)))
      .catch((error) => {
      logger.warn("watcher_config_refresh_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      });

    syncGroupsFromAdapter(adapter).catch((error) => {
      logger.warn("watcher_group_sync_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, env.WATCHER_CONFIG_SYNC_INTERVAL_MS);
}

main().catch((error) => {
  logger.error("watcher_fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
