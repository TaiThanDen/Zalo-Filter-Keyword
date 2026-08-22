import { db } from "@/src/lib/db";
import type { WatcherSleepSchedule } from "@/src/modules/watchers/watcher-schedule";

export async function updateWatcherSleepSchedule(watcherId: string, schedule: WatcherSleepSchedule) {
  return db.watcherRuntimeConfig.upsert({
    where: { watcherId },
    create: {
      watcherId,
      sleepEnabled: schedule.enabled,
      sleepStartMinute: schedule.startMinute,
      sleepEndMinute: schedule.endMinute,
      sleepTimezone: schedule.timezone,
    },
    update: {
      sleepEnabled: schedule.enabled,
      sleepStartMinute: schedule.startMinute,
      sleepEndMinute: schedule.endMinute,
      sleepTimezone: schedule.timezone,
    },
  });
}
