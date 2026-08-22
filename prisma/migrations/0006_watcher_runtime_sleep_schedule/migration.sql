CREATE TABLE "WatcherRuntimeConfig" (
    "watcherId" TEXT NOT NULL,
    "sleepEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sleepStartMinute" INTEGER NOT NULL DEFAULT 60,
    "sleepEndMinute" INTEGER NOT NULL DEFAULT 360,
    "sleepTimezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatcherRuntimeConfig_pkey" PRIMARY KEY ("watcherId"),
    CONSTRAINT "WatcherRuntimeConfig_sleepStartMinute_check" CHECK ("sleepStartMinute" >= 0 AND "sleepStartMinute" < 1440),
    CONSTRAINT "WatcherRuntimeConfig_sleepEndMinute_check" CHECK ("sleepEndMinute" >= 0 AND "sleepEndMinute" < 1440)
);

ALTER TABLE "WatcherRuntimeConfig"
ADD CONSTRAINT "WatcherRuntimeConfig_watcherId_fkey"
FOREIGN KEY ("watcherId") REFERENCES "Watcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
