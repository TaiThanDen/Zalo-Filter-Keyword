ALTER TABLE "WatcherRuntimeConfig"
ADD COLUMN "controlMode" TEXT NOT NULL DEFAULT 'scheduled',
ADD COLUMN "sleepWindows" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "WatcherRuntimeConfig"
SET "sleepWindows" = jsonb_build_array(
  jsonb_build_object(
    'startMinute', "sleepStartMinute",
    'endMinute', "sleepEndMinute"
  )
);

ALTER TABLE "WatcherRuntimeConfig"
ADD CONSTRAINT "WatcherRuntimeConfig_controlMode_check"
CHECK ("controlMode" IN ('scheduled', 'paused', 'running')),
ADD CONSTRAINT "WatcherRuntimeConfig_sleepWindows_array_check"
CHECK (jsonb_typeof("sleepWindows") = 'array');
