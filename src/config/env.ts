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
  WATCHER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  WATCHER_CONFIG_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(600_000),
  WATCHER_RUNTIME_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_CONTROL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_INGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WATCHER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  WATCHER_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  WATCHER_BUFFER_FILE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  WATCHER_BUFFER_FILE_PATH: z.string().default("./fixtures/watcher-buffer.jsonl"),
  WATCHER_ZCA_CREDENTIALS_FILE: z.string().min(1).default("./data/zca-credentials.json"),
  WATCHER_ZCA_QR_FILE: z.string().min(1).default("./data/zca-login-qr.png"),
  WATCHER_ZCA_GROUP_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  WATCHER_ZCA_GROUP_INFO_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  WATCHER_ZCA_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  WATCHER_ZCA_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(300_000),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(IMPLEMENTATION_DEFAULTS.notificationMaxAttempts),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.WATCHER_ZCA_RECONNECT_MAX_DELAY_MS < value.WATCHER_ZCA_RECONNECT_BASE_DELAY_MS) {
    context.addIssue({
      code: "custom",
      path: ["WATCHER_ZCA_RECONNECT_MAX_DELAY_MS"],
      message: "ZCA reconnect max delay must be greater than or equal to the base delay",
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
