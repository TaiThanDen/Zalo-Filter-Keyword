import assert from "node:assert/strict";
import test from "node:test";
import {
  formatClockTime,
  getMinuteOfDay,
  isWithinWatcherSleepSchedule,
  parseClockTime,
  WATCHER_SLEEP_TIMEZONE,
  type WatcherSleepSchedule,
} from "@/src/modules/watchers/watcher-schedule";
import { createSourceAdapter } from "@/src/modules/watchers/source-adapters";

const dailySchedule: WatcherSleepSchedule = {
  enabled: true,
  startMinute: parseClockTime("01:00"),
  endMinute: parseClockTime("06:00"),
  timezone: WATCHER_SLEEP_TIMEZONE,
};

test("clock time helpers convert HH:mm without changing the day", () => {
  assert.equal(parseClockTime("01:00"), 60);
  assert.equal(parseClockTime("23:59"), 1439);
  assert.equal(formatClockTime(360), "06:00");
  assert.throws(() => parseClockTime("24:00"), /HH:mm/);
});

test("Vietnam schedule includes 01:00 and excludes 06:00", () => {
  assert.equal(getMinuteOfDay(new Date("2026-08-22T17:59:00.000Z"), WATCHER_SLEEP_TIMEZONE), 59);
  assert.equal(isWithinWatcherSleepSchedule(dailySchedule, new Date("2026-08-22T18:00:00.000Z")), true);
  assert.equal(isWithinWatcherSleepSchedule(dailySchedule, new Date("2026-08-22T22:59:00.000Z")), true);
  assert.equal(isWithinWatcherSleepSchedule(dailySchedule, new Date("2026-08-22T23:00:00.000Z")), false);
});

test("overnight schedule wraps across midnight", () => {
  const overnight: WatcherSleepSchedule = {
    enabled: true,
    startMinute: parseClockTime("23:00"),
    endMinute: parseClockTime("06:00"),
    timezone: WATCHER_SLEEP_TIMEZONE,
  };

  assert.equal(isWithinWatcherSleepSchedule(overnight, new Date("2026-08-22T16:30:00.000Z")), true);
  assert.equal(isWithinWatcherSleepSchedule(overnight, new Date("2026-08-22T20:00:00.000Z")), true);
  assert.equal(isWithinWatcherSleepSchedule(overnight, new Date("2026-08-22T23:00:00.000Z")), false);
});

test("paused adapter does not emit source events", async () => {
  const adapter = createSourceAdapter("mock");
  const events: unknown[] = [];
  await adapter.setPaused?.(true);
  await adapter.start(async (event) => {
    events.push(event);
  });
  assert.equal(events.length, 0);
});
