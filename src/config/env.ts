import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";

loadEnvConfig(process.cwd());

export function estimateWatcherMessageDeliveryDelayMs(input: {
  pollIntervalMs: number;
  ingestTimeoutMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}) {
  let retryDelayMs = 0;

  for (let attempt = 1; attempt < IMPLEMENTATION_DEFAULTS.watcherMessageMaxAttempts; attempt += 1) {
    retryDelayMs += Math.min(
      input.retryBaseDelayMs * 2 ** (attempt - 1),
      input.retryMaxDelayMs,
    );
  }

  return (
    input.pollIntervalMs +
    input.ingestTimeoutMs * IMPLEMENTATION_DEFAULTS.watcherMessageMaxAttempts +
    retryDelayMs +
    IMPLEMENTATION_DEFAULTS.watcherMessageProcessingBudgetMs
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/zalo_alert"),
  DIRECT_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/zalo_alert"),
  SESSION_COOKIE_NAME: z.string().min(1).default("zalo_alert_session"),
  SESSION_SECRET: z.string().min(16).default("change_me_long_random_string"),
  ADMIN_SEED_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_SEED_PASSWORD: z.string().min(8).default("change_me"),
  WATCHER_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  WATCHER_API_KEY: z.string().min(8).default("change_me"),
  WATCHER_NODE_NAME: z.string().min(1).default("watcher-main"),
  WATCHER_VERSION: z.string().min(1).default("0.1.0"),
  WATCHER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  WATCHER_CONFIG_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(600_000),
  WATCHER_RUNTIME_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_CONTROL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  WATCHER_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_BUFFER_FILE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_BUFFER_FILE_PATH: z.string().default("./fixtures/watcher-buffer.jsonl"),
  WATCHER_CDP_URL: z.string().url().default("http://127.0.0.1:9222"),
  WATCHER_ZALO_URL: z.string().url().default("https://chat.zalo.me/"),
  WATCHER_PLAYWRIGHT_STATE_FILE: z.string().default("./data/watcher-playwright-state.json"),
  WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(55_000),
  WATCHER_PLAYWRIGHT_B0_INSTRUMENTATION_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_POLL_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  WATCHER_PLAYWRIGHT_POLL_TRAILING_DEBOUNCE_MS: z.coerce.number().int().positive().default(350),
  WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS: z.coerce.number().int().positive().default(5_000),
  WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_PLAYWRIGHT_METRICS_LOG_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT: z.coerce.number().int().positive().default(15),
  WATCHER_PLAYWRIGHT_MAX_CONVERSATIONS_PER_POLL: z.coerce.number().int().positive().default(6),
  WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT: z.coerce.number().int().positive().default(200),
  WATCHER_PLAYWRIGHT_EMIT_INITIAL_SNAPSHOT: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_GROUPS_ONLY: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(IMPLEMENTATION_DEFAULTS.notificationMaxAttempts),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (
    value.WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED &&
    value.WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS < value.WATCHER_PLAYWRIGHT_POLL_MIN_INTERVAL_MS
  ) {
    context.addIssue({
      code: "custom",
      path: ["WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS"],
      message: "Watcher poll trailing max wait must be greater than or equal to the hard minimum interval",
    });
  }

  if (
    value.WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED &&
    value.WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS < value.WATCHER_PLAYWRIGHT_POLL_TRAILING_DEBOUNCE_MS
  ) {
    context.addIssue({
      code: "custom",
      path: ["WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS"],
      message: "Watcher poll trailing max wait must cover the trailing debounce window",
    });
  }

  if (
    value.WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED &&
    value.WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS > 10_000
  ) {
    context.addIssue({
      code: "custom",
      path: ["WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS"],
      message: "Watcher poll trailing max wait cannot exceed the 10000ms alert-latency gate",
    });
  }

  const estimatedDelayMs = estimateWatcherMessageDeliveryDelayMs({
    pollIntervalMs: value.WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS,
    ingestTimeoutMs: value.WATCHER_INGEST_TIMEOUT_MS,
    retryBaseDelayMs: value.WATCHER_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: value.WATCHER_RETRY_MAX_DELAY_MS,
  });

  if (estimatedDelayMs > IMPLEMENTATION_DEFAULTS.watcherMessageDeliverySloMs) {
    context.addIssue({
      code: "custom",
      path: ["WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS"],
      message: `Watcher delivery budget is ${estimatedDelayMs}ms, exceeding ${IMPLEMENTATION_DEFAULTS.watcherMessageDeliverySloMs}ms`,
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsed.data;

for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) {
    process.env[key] = String(value);
  }
}
