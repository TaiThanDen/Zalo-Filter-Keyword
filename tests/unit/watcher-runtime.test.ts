import assert from "node:assert/strict";
import test from "node:test";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { env } from "@/src/config/env";
import { deriveWatcherStatus } from "@/src/modules/watchers/watchers.service";
import { requireWatcherApiKey } from "@/src/server/guards/watcher.guard";

test("watcher ZCA reconnect defaults use a bounded exponential backoff", () => {
  assert.ok(env.WATCHER_ZCA_RECONNECT_BASE_DELAY_MS > 0);
  assert.ok(env.WATCHER_ZCA_RECONNECT_MAX_DELAY_MS >= env.WATCHER_ZCA_RECONNECT_BASE_DELAY_MS);
});

test("watcher status tolerates the five-minute heartbeat interval", () => {
  const onlineThresholdMs = Math.max(
    IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.online,
    env.WATCHER_HEARTBEAT_INTERVAL_MS * 1.5,
  );
  const degradedThresholdMs = Math.max(
    IMPLEMENTATION_DEFAULTS.watcherStatusThresholdsMs.degraded,
    env.WATCHER_HEARTBEAT_INTERVAL_MS * 3,
  );

  assert.equal(deriveWatcherStatus(new Date(Date.now() - onlineThresholdMs + 5_000)), "online");
  assert.equal(deriveWatcherStatus(new Date(Date.now() - onlineThresholdMs - 5_000)), "degraded");
  assert.equal(deriveWatcherStatus(new Date(Date.now() - degradedThresholdMs - 5_000)), "offline");
});

test("watcher bearer parsing does not require a database round trip", () => {
  assert.equal(requireWatcherApiKey("Bearer test-watcher-key"), "test-watcher-key");
  assert.throws(() => requireWatcherApiKey(null), /bearer token is required/i);
  assert.throws(() => requireWatcherApiKey("Bearer   "), /bearer token is required/i);
});
