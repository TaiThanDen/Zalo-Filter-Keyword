export const WATCHER_SLEEP_TIMEZONE = "Asia/Ho_Chi_Minh";

export type WatcherSleepSchedule = {
  enabled: boolean;
  startMinute: number;
  endMinute: number;
  timezone: string;
};

export const DEFAULT_WATCHER_SLEEP_SCHEDULE: WatcherSleepSchedule = {
  enabled: false,
  startMinute: 60,
  endMinute: 360,
  timezone: WATCHER_SLEEP_TIMEZONE,
};

const clockTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseClockTime(value: string) {
  if (!clockTimePattern.test(value)) {
    throw new Error("Time must use HH:mm in 24-hour format");
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatClockTime(minuteOfDay: number) {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) {
    throw new Error("Minute of day must be between 0 and 1439");
  }

  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getMinuteOfDay(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}

export function isWithinWatcherSleepSchedule(schedule: WatcherSleepSchedule, date = new Date()) {
  if (!schedule.enabled || schedule.startMinute === schedule.endMinute) {
    return false;
  }

  const minuteOfDay = getMinuteOfDay(date, schedule.timezone);

  if (schedule.startMinute < schedule.endMinute) {
    return minuteOfDay >= schedule.startMinute && minuteOfDay < schedule.endMinute;
  }

  return minuteOfDay >= schedule.startMinute || minuteOfDay < schedule.endMinute;
}

export function resolveWatcherSleepSchedule(
  config?: {
    sleepEnabled: boolean;
    sleepStartMinute: number;
    sleepEndMinute: number;
    sleepTimezone: string;
  } | null,
): WatcherSleepSchedule {
  if (!config) {
    return { ...DEFAULT_WATCHER_SLEEP_SCHEDULE };
  }

  return {
    enabled: config.sleepEnabled,
    startMinute: config.sleepStartMinute,
    endMinute: config.sleepEndMinute,
    timezone: config.sleepTimezone,
  };
}
