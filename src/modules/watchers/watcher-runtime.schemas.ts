import { z } from "zod";
import { parseClockTime, WATCHER_SLEEP_TIMEZONE } from "@/src/modules/watchers/watcher-schedule";

const clockTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm in 24-hour format");

export const updateWatcherSleepScheduleSchema = z
  .object({
    sleepEnabled: z.boolean(),
    sleepStart: clockTimeSchema,
    sleepEnd: clockTimeSchema,
    sleepTimezone: z.literal(WATCHER_SLEEP_TIMEZONE),
  })
  .refine((value) => value.sleepStart !== value.sleepEnd, {
    message: "Sleep start and end must be different",
    path: ["sleepEnd"],
  })
  .transform((value) => ({
    enabled: value.sleepEnabled,
    startMinute: parseClockTime(value.sleepStart),
    endMinute: parseClockTime(value.sleepEnd),
    timezone: value.sleepTimezone,
  }));
