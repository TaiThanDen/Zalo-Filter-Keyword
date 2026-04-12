import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";

loadEnvConfig(process.cwd());

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
  WATCHER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_CONFIG_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WATCHER_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  WATCHER_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_BUFFER_FILE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_BUFFER_FILE_PATH: z.string().default("./fixtures/watcher-buffer.jsonl"),
  WATCHER_CDP_URL: z.string().url().default("http://127.0.0.1:9222"),
  WATCHER_ZALO_URL: z.string().url().default("https://chat.zalo.me/"),
  WATCHER_PLAYWRIGHT_STATE_FILE: z.string().default("./data/watcher-playwright-state.json"),
  WATCHER_PLAYWRIGHT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_PLAYWRIGHT_VISIBLE_ITEM_LIMIT: z.coerce.number().int().positive().default(40),
  WATCHER_PLAYWRIGHT_GROUP_DISCOVERY_LIMIT: z.coerce.number().int().positive().default(200),
  WATCHER_PLAYWRIGHT_EMIT_INITIAL_SNAPSHOT: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_PLAYWRIGHT_GROUPS_ONLY: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(IMPLEMENTATION_DEFAULTS.notificationMaxAttempts),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
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
