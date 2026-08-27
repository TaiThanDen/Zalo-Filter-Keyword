import assert from 'node:assert/strict';
import test from 'node:test';
import { WatcherPollCoordinator } from '@/src/modules/watchers/poll-coordinator';

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

test('mutation burst is coalesced, bounded by trailing max wait, and never overlaps polls', async () => {
  const runStarts: number[] = [];
  let activeRuns = 0;
  let maximumConcurrentRuns = 0;
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 40,
    trailingDebounceMs: 25,
    trailingMaxWaitMs: 120,
    run: async () => {
      runStarts.push(Date.now());
      activeRuns += 1;
      maximumConcurrentRuns = Math.max(maximumConcurrentRuns, activeRuns);
      await sleep(20);
      activeRuns -= 1;
    },
  });

  const burstStartedAtMs = Date.now();
  for (let index = 0; index < 80; index += 1) {
    coordinator.request('mutation', 25);
    await sleep(2);
  }
  const burstDurationMs = Date.now() - burstStartedAtMs;
  await sleep(250);

  const metrics = coordinator.getMetrics();
  coordinator.cancel();
  assert.equal(metrics.mutationRequests, 80);
  const maximumExpectedRuns = Math.ceil(burstDurationMs / 120) + 2;
  assert.ok(metrics.runsCompleted >= 2, `expected max-wait to flush a long burst, got ${metrics.runsCompleted}`);
  assert.ok(
    metrics.runsCompleted <= maximumExpectedRuns,
    `expected burst coalescing, got ${metrics.runsCompleted} polls over ${burstDurationMs}ms`,
  );
  assert.ok(metrics.runsCompleted < metrics.mutationRequests / 4, 'poll reduction was below 75%');
  assert.equal(maximumConcurrentRuns, 1);
  assert.equal(metrics.runsFailed, 0);
  assert.ok(metrics.coalescedRequests >= 70);
  for (let index = 1; index < runStarts.length; index += 1) {
    assert.ok(runStarts[index] - runStarts[index - 1] >= 35, 'hard minimum interval was not respected');
  }
});

test('mutation burst preserves matching alerts once, rejects non-matches, and stays below 10s latency', async () => {
  type FixtureMessage = {
    id: string;
    text: string;
    observedAtMs: number;
  };

  const visibleMessages: FixtureMessage[] = [];
  const processedIds = new Set<string>();
  const alertTimes = new Map<string, number[]>();
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 50,
    trailingDebounceMs: 30,
    trailingMaxWaitMs: 180,
    run: async () => {
      for (const message of visibleMessages) {
        if (processedIds.has(message.id)) {
          continue;
        }
        processedIds.add(message.id);
        if (/\bPB\b/i.test(message.text) && !/spam/i.test(message.text)) {
          const times = alertTimes.get(message.id) ?? [];
          times.push(Date.now());
          alertTimes.set(message.id, times);
        }
      }
      await sleep(8);
    },
  });

  const fixtures = new Map<number, FixtureMessage[]>([
    [5, [{ id: 'match-1', text: 'Cần PB hỗ trợ ca sáng', observedAtMs: 0 }]],
    [25, [{ id: 'non-match', text: 'Trao đổi lịch làm việc', observedAtMs: 0 }]],
    [55, [{ id: 'excluded', text: 'PB spam không cảnh báo', observedAtMs: 0 }]],
    [80, [{ id: 'match-2', text: 'Tuyển PB cuối tuần', observedAtMs: 0 }]],
    [110, [{ id: 'match-3', text: 'PB cần xác nhận gấp', observedAtMs: 0 }]],
    [125, [{ id: 'match-2', text: 'Tuyển PB cuối tuần', observedAtMs: 0 }]],
  ]);

  for (let index = 0; index < 140; index += 1) {
    for (const fixture of fixtures.get(index) ?? []) {
      visibleMessages.push({ ...fixture, observedAtMs: Date.now() });
    }
    coordinator.request('mutation', 30);
    await sleep(2);
  }
  await sleep(350);

  coordinator.cancel();
  assert.deepEqual(Array.from(alertTimes.keys()).sort(), ['match-1', 'match-2', 'match-3']);
  assert.equal(alertTimes.get('match-1')?.length, 1);
  assert.equal(alertTimes.get('match-2')?.length, 1);
  assert.equal(alertTimes.get('match-3')?.length, 1);
  assert.equal(alertTimes.has('non-match'), false);
  assert.equal(alertTimes.has('excluded'), false);

  for (const [messageId, alertAtValues] of alertTimes) {
    const firstObservedAt = visibleMessages.find((message) => message.id === messageId)?.observedAtMs;
    assert.ok(firstObservedAt);
    assert.ok(alertAtValues[0] - firstObservedAt < 10_000, `${messageId} exceeded the 10s latency gate`);
  }
});

test('requests received during a poll are retained for one trailing run', async () => {
  let runs = 0;
  const holder: { coordinator?: WatcherPollCoordinator } = {};
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 30,
    trailingDebounceMs: 20,
    trailingMaxWaitMs: 80,
    run: async () => {
      runs += 1;
      if (runs === 1) {
        holder.coordinator?.request('mutation', 20);
        holder.coordinator?.request('mutation', 20);
      }
      await sleep(10);
    },
  });
  holder.coordinator = coordinator;

  coordinator.request('mutation', 20);
  await sleep(160);
  const metrics = coordinator.getMetrics();
  coordinator.cancel();

  assert.equal(runs, 2);
  assert.equal(metrics.inFlightCoalescedRequests, 2);
  assert.equal(metrics.runsCompleted, 2);
});

test('a later safety request cannot postpone an earlier mutation poll', async () => {
  let runs = 0;
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 20,
    trailingDebounceMs: 20,
    trailingMaxWaitMs: 100,
    run: async () => {
      runs += 1;
    },
  });

  coordinator.request('mutation', 20);
  coordinator.request('safety', 5_000);
  await sleep(80);
  coordinator.cancel();

  assert.equal(runs, 1);
});

test('safety poll runs without any mutation request', async () => {
  let runs = 0;
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 20,
    trailingDebounceMs: 20,
    trailingMaxWaitMs: 100,
    run: async () => {
      runs += 1;
    },
  });

  coordinator.request('safety', 25);
  await sleep(80);
  const metrics = coordinator.getMetrics();
  coordinator.cancel();

  assert.equal(runs, 1);
  assert.equal(metrics.safetyRequests, 1);
  assert.equal(metrics.mutationRequests, 0);
  assert.equal(metrics.runsCompleted, 1);
});
