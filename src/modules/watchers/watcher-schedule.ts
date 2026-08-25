export const WATCHER_SLEEP_TIMEZONE = "Asia/Ho_Chi_Minh";
export const MAX_WATCHER_SLEEP_WINDOWS = 8;

export type WatcherControlMode = "scheduled" | "paused" | "running";

export type WatcherSleepWindow = {
  startMinute: number;
  endMinute: number;
};

export type WatcherSleepSchedule = {
  enabled: boolean;
  windows: WatcherSleepWindow[];
  // Kept for compatibility with watchers deployed before multi-window support.
  startMinute: number;
  endMinute: number;
  timezone: string;
};

export type WatcherRuntimeControl = {
  controlMode: WatcherControlMode;
  sleepSchedule: WatcherSleepSchedule;
};

export const DEFAULT_WATCHER_SLEEP_SCHEDULE: WatcherSleepSchedule = {
  enabled: false,
  windows: [{ startMinute: 60, endMinute: 360 }],
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
  if (!schedule.enabled) {
    return false;
  }

  const minuteOfDay = getMinuteOfDay(date, schedule.timezone);

  return schedule.windows.some((window) => isMinuteWithinWindow(minuteOfDay, window));
}

function isMinuteWithinWindow(minuteOfDay: number, window: WatcherSleepWindow) {
  if (window.startMinute === window.endMinute) {
    return false;
  }

  if (window.startMinute < window.endMinute) {
    return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
  }

  return minuteOfDay >= window.startMinute || minuteOfDay < window.endMinute;
}

function isSleepWindow(value: unknown): value is WatcherSleepWindow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.startMinute) && Number.isInteger(candidate.endMinute)
    && Number(candidate.startMinute) >= 0 && Number(candidate.startMinute) < 1440
    && Number(candidate.endMinute) >= 0 && Number(candidate.endMinute) < 1440
    && candidate.startMinute !== candidate.endMinute;
}

function resolveSleepWindows(value: unknown, fallback: WatcherSleepWindow) {
  if (Array.isArray(value)) {
    const windows = value.filter(isSleepWindow).slice(0, MAX_WATCHER_SLEEP_WINDOWS);
    if (windows.length > 0) return windows;
  }
  return [fallback];
}

export function resolveWatcherSleepSchedule(
  config?: {
    sleepEnabled: boolean;
    sleepStartMinute: number;
    sleepEndMinute: number;
    sleepWindows?: unknown;
    sleepTimezone: string;
  } | null,
): WatcherSleepSchedule {
  if (!config) {
    return { ...DEFAULT_WATCHER_SLEEP_SCHEDULE };
  }

  const fallback = { startMinute: config.sleepStartMinute, endMinute: config.sleepEndMinute };
  const windows = resolveSleepWindows(config.sleepWindows, fallback);
  return {
    enabled: config.sleepEnabled,
    windows,
    startMinute: windows[0].startMinute,
    endMinute: windows[0].endMinute,
    timezone: config.sleepTimezone,
  };
}

export function resolveWatcherRuntimeControl(config?: {
  controlMode?: string;
  sleepEnabled: boolean;
  sleepStartMinute: number;
  sleepEndMinute: number;
  sleepWindows?: unknown;
  sleepTimezone: string;
} | null): WatcherRuntimeControl {
  const controlMode: WatcherControlMode =
    config?.controlMode === "paused" || config?.controlMode === "running" ? config.controlMode : "scheduled";
  return { controlMode, sleepSchedule: resolveWatcherSleepSchedule(config) };
}

export function resolveWatcherRuntimeState(control: WatcherRuntimeControl, date = new Date()) {
  if (control.controlMode === "paused") return { paused: true, reason: "manual" as const };
  if (control.controlMode === "running") return { paused: false, reason: "manual" as const };
  return {
    paused: isWithinWatcherSleepSchedule(control.sleepSchedule, date),
    reason: "schedule" as const,
  };
}
