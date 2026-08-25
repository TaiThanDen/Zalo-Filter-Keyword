import { db } from "@/src/lib/db";
import type { Prisma } from "@prisma/client";
import type { WatcherControlMode, WatcherSleepSchedule } from "@/src/modules/watchers/watcher-schedule";

export async function updateWatcherSleepSchedule(watcherId: string, schedule: WatcherSleepSchedule) {
  return db.watcherRuntimeConfig.upsert({
    where: { watcherId },
    create: {
      watcherId,
      sleepEnabled: schedule.enabled,
      sleepStartMinute: schedule.startMinute,
      sleepEndMinute: schedule.endMinute,
      sleepWindows: schedule.windows as unknown as Prisma.InputJsonValue,
      sleepTimezone: schedule.timezone,
    },
    update: {
      sleepEnabled: schedule.enabled,
      sleepStartMinute: schedule.startMinute,
      sleepEndMinute: schedule.endMinute,
      sleepWindows: schedule.windows as unknown as Prisma.InputJsonValue,
      sleepTimezone: schedule.timezone,
    },
  });
}

export async function updateWatcherControlMode(watcherId: string, controlMode: WatcherControlMode) {
  return db.watcherRuntimeConfig.upsert({
    where: { watcherId },
    create: { watcherId, controlMode },
    update: { controlMode },
  });
}
