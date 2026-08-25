import { z } from "zod";
import { MAX_WATCHER_SLEEP_WINDOWS, parseClockTime, WATCHER_SLEEP_TIMEZONE } from "@/src/modules/watchers/watcher-schedule";

const clockTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm in 24-hour format");

const sleepWindowSchema = z
  .object({
    sleepStart: clockTimeSchema,
    sleepEnd: clockTimeSchema,
  })
  .refine((value) => value.sleepStart !== value.sleepEnd, {
    message: "Sleep start and end must be different",
    path: ["sleepEnd"],
  })
  .transform((value) => ({
    startMinute: parseClockTime(value.sleepStart),
    endMinute: parseClockTime(value.sleepEnd),
  }));

export const updateWatcherSleepScheduleSchema = z
  .object({
    sleepEnabled: z.boolean(),
    sleepTimezone: z.literal(WATCHER_SLEEP_TIMEZONE),
    sleepWindows: z.array(sleepWindowSchema).min(1).max(MAX_WATCHER_SLEEP_WINDOWS).optional(),
    sleepStart: clockTimeSchema.optional(),
    sleepEnd: clockTimeSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.sleepWindows && (!value.sleepStart || !value.sleepEnd || value.sleepStart === value.sleepEnd)) {
      context.addIssue({ code: "custom", message: "At least one valid sleep window is required", path: ["sleepWindows"] });
    }
  })
  .transform((value) => {
    const windows = value.sleepWindows ?? [{
      startMinute: parseClockTime(value.sleepStart!),
      endMinute: parseClockTime(value.sleepEnd!),
    }];
    return {
      enabled: value.sleepEnabled,
      windows,
      startMinute: windows[0].startMinute,
      endMinute: windows[0].endMinute,
      timezone: value.sleepTimezone,
    };
  });

export const updateWatcherControlModeSchema = z.object({
  controlMode: z.enum(["scheduled", "paused", "running"]),
});
