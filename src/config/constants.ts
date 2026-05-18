export const APP_NAME = "Zalo Alert Admin";

export const PRODUCT_RULES = {
  ingestUnknownGroupPolicy: "STORE_AND_REJECT" as const,
  matchRequireIncludeHit: true,
  matchExcludeOverridesInclude: true,
  dedupeStrongKeyMode: "MESSAGE_EXTERNAL_ID_THEN_FINGERPRINT" as const,
};

export const IMPLEMENTATION_DEFAULTS = {
  textNormalizationForm: "NFKC" as const,
  dedupeFingerprintBucketMs: 60_000,
  duplicateWindowMs: 300_000,
  notificationCrossGroupDedupeWindowMs: 120_000,
  messageDedupeTtlMs: 24 * 60 * 60 * 1000,
  notificationOutboxTtlMs: 3 * 24 * 60 * 60 * 1000,
  sessionTtlMs: 1000 * 60 * 60 * 24 * 7,
  watcherStatusThresholdsMs: {
    online: 60_000,
    degraded: 120_000,
  },
  notificationRetryScheduleMs: [60_000, 300_000, 900_000],
  notificationMaxAttempts: 4,
  workerClaimBatchSize: 20,
};

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
};

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  groups: "/groups",
  rules: "/rules",
  channels: "/channels",
  logs: "/logs",
  watchers: "/watchers",
};

