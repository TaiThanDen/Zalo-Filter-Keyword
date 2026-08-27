import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WatcherPollCoordinator } from '@/src/modules/watchers/poll-coordinator';

type ScenarioName = 'legacy' | 'coalesced_ttl';

type FixtureMessage = {
  id: string;
  text: string;
  observedAtMs: number;
};

function readArgument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
}

function runSyntheticScan(seed: number, iterations: number) {
  let value = Buffer.from(`watcher-benchmark-${seed}`);
  for (let index = 0; index < iterations; index += 1) {
    value = createHash('sha256').update(value).update(String(index)).digest();
  }
  return value[0];
}

async function runScenario(name: ScenarioName, durationMs: number) {
  const startedAtMs = Date.now();
  const startedCpu = process.cpuUsage();
  const rssSamplesMiB: number[] = [];
  const visibleMessages: FixtureMessage[] = [];
  const processedIds = new Set<string>();
  const alertTimes = new Map<string, number[]>();
  let mutationSignals = 0;
  let pollRuns = 0;
  let fullLocalStorageScans = 0;
  let stableMetadataScans = 0;
  let targetedTimestampReadBatches = 0;
  let targetedTimestampKeys = 0;
  let localStorageCacheExpiresAtMs = 0;
  let activeRuns = 0;
  let maximumConcurrentRuns = 0;
  let legacyTimer: ReturnType<typeof setTimeout> | null = null;

  const runPoll = async () => {
    pollRuns += 1;
    activeRuns += 1;
    maximumConcurrentRuns = Math.max(maximumConcurrentRuns, activeRuns);
    runSyntheticScan(pollRuns, 280);

    const now = Date.now();
    if (name === 'legacy') {
      fullLocalStorageScans += 1;
      runSyntheticScan(pollRuns + 10_000, 140);
    } else {
      targetedTimestampReadBatches += 1;
      targetedTimestampKeys += 15;
      runSyntheticScan(pollRuns + 20_000, 24);
    }
    if (name === 'coalesced_ttl' && now >= localStorageCacheExpiresAtMs) {
      stableMetadataScans += 1;
      runSyntheticScan(pollRuns + 30_000, 116);
      localStorageCacheExpiresAtMs = now + 30_000;
    }

    for (const message of visibleMessages) {
      if (processedIds.has(message.id)) {
        continue;
      }
      processedIds.add(message.id);
      if (/\bPB\b/i.test(message.text) && !/spam/i.test(message.text)) {
        const values = alertTimes.get(message.id) ?? [];
        values.push(Date.now());
        alertTimes.set(message.id, values);
      }
    }
    activeRuns -= 1;
  };

  const coordinator = name === 'coalesced_ttl'
    ? new WatcherPollCoordinator({
        minimumIntervalMs: 1_000,
        trailingDebounceMs: 350,
        trailingMaxWaitMs: 5_000,
        run: runPoll,
      })
    : null;

  const memorySampler = setInterval(() => {
    rssSamplesMiB.push(process.memoryUsage().rss / 1024 / 1024);
  }, 250);

  const signalIntervalMs = 380;
  while (Date.now() - startedAtMs < durationMs) {
    mutationSignals += 1;
    if (mutationSignals % 17 === 0) {
      visibleMessages.push({
        id: `match-${mutationSignals}`,
        text: `Cần PB hỗ trợ tín hiệu ${mutationSignals}`,
        observedAtMs: Date.now(),
      });
    }
    if (mutationSignals % 23 === 0) {
      visibleMessages.push({
        id: `non-match-${mutationSignals}`,
        text: `Trao đổi lịch tín hiệu ${mutationSignals}`,
        observedAtMs: Date.now(),
      });
    }
    if (mutationSignals % 41 === 0) {
      visibleMessages.push({
        id: `excluded-${mutationSignals}`,
        text: `PB spam tín hiệu ${mutationSignals}`,
        observedAtMs: Date.now(),
      });
    }
    if (mutationSignals % 53 === 0) {
      const duplicate = visibleMessages.find((message) => message.id.startsWith('match-'));
      if (duplicate) {
        visibleMessages.push({ ...duplicate, observedAtMs: Date.now() });
      }
    }

    if (coordinator) {
      coordinator.request('mutation', 350);
    } else {
      if (legacyTimer) {
        clearTimeout(legacyTimer);
      }
      legacyTimer = setTimeout(() => {
        legacyTimer = null;
        void runPoll();
      }, 350);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, signalIntervalMs));
  }

  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
  clearInterval(memorySampler);
  coordinator?.cancel();
  if (legacyTimer) {
    clearTimeout(legacyTimer);
  }

  const endedAtMs = Date.now();
  const elapsedMs = endedAtMs - startedAtMs;
  const cpu = process.cpuUsage(startedCpu);
  const cpuMs = (cpu.user + cpu.system) / 1_000;
  const expectedMatchIds = new Set(
    visibleMessages.filter((message) => /\bPB\b/i.test(message.text) && !/spam/i.test(message.text)).map((message) => message.id),
  );
  const alertLatenciesMs = Array.from(alertTimes, ([id, times]) => {
    const observedAtMs = visibleMessages.find((message) => message.id === id)?.observedAtMs ?? endedAtMs;
    return times[0] - observedAtMs;
  });
  const duplicateAlerts = Array.from(alertTimes.values()).reduce((total, values) => total + Math.max(0, values.length - 1), 0);

  return {
    name,
    elapsedMs,
    mutationSignals,
    pollRuns,
    pollRatePerMinute: Number(((pollRuns * 60_000) / elapsedMs).toFixed(2)),
    pollReductionVsSignalsPercent: Number(((1 - pollRuns / mutationSignals) * 100).toFixed(2)),
    fullLocalStorageScans,
    stableMetadataScans,
    targetedTimestampReadBatches,
    targetedTimestampKeys,
    cpuMs: Number(cpuMs.toFixed(2)),
    cpuAverageOneCorePercent: Number(((cpuMs / elapsedMs) * 100).toFixed(2)),
    rssMiB: {
      p50: Number(percentile(rssSamplesMiB, 0.5).toFixed(2)),
      p95: Number(percentile(rssSamplesMiB, 0.95).toFixed(2)),
      max: Number(Math.max(...rssSamplesMiB).toFixed(2)),
    },
    expectedAlerts: expectedMatchIds.size,
    emittedAlerts: alertTimes.size,
    missedAlerts: Math.max(0, expectedMatchIds.size - alertTimes.size),
    duplicateAlerts,
    alertLatencyMs: {
      p50: percentile(alertLatenciesMs, 0.5),
      p95: percentile(alertLatenciesMs, 0.95),
      max: Math.max(...alertLatenciesMs, 0),
    },
    maximumConcurrentRuns,
    restartDelta: 0,
    coordinator: coordinator?.getMetrics() ?? null,
  };
}

async function main() {
  const durationSeconds = Number(readArgument('duration-seconds', '60'));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 10 || durationSeconds > 300) {
    throw new Error('duration-seconds must be between 10 and 300');
  }

  const outputPath = resolve(readArgument('output', `output/benchmark-watcher-poll-${Date.now()}.json`));
  const legacy = await runScenario('legacy', durationSeconds * 1_000);
  const coalesced = await runScenario('coalesced_ttl', durationSeconds * 1_000);
  const result = {
    generatedAt: new Date().toISOString(),
    benchmarkType: 'synthetic_local_scheduler_and_storage_scan',
    durationSecondsPerScenario: durationSeconds,
    workload: {
      mutationSignalIntervalMs: 380,
      legacyDebounceMs: 350,
      optimizedMinimumIntervalMs: 1_000,
      optimizedTrailingDebounceMs: 350,
      optimizedTrailingMaxWaitMs: 5_000,
      optimizedLocalStorageTtlMs: 30_000,
    },
    scenarios: [legacy, coalesced],
    comparison: {
      pollRunReductionPercent: Number(((1 - coalesced.pollRuns / legacy.pollRuns) * 100).toFixed(2)),
      fullLocalStorageScanReductionPercent: Number(
        ((1 - coalesced.fullLocalStorageScans / legacy.fullLocalStorageScans) * 100).toFixed(2),
      ),
      stableMetadataScanReductionPercent: Number(
        ((1 - coalesced.stableMetadataScans / legacy.fullLocalStorageScans) * 100).toFixed(2),
      ),
      targetedTimestampReadBatchesAdded: coalesced.targetedTimestampReadBatches,
      cpuTimeReductionPercent: Number(((1 - coalesced.cpuMs / legacy.cpuMs) * 100).toFixed(2)),
      rssP95DeltaMiB: Number((coalesced.rssMiB.p95 - legacy.rssMiB.p95).toFixed(2)),
    },
    limitations: [
      'Synthetic local benchmark; it does not measure Chromium renderer CPU or a live Zalo account.',
      'Alert fixtures validate only this benchmark harness and do not replace the PlaywrightConversationListAdapter.poll regression test.',
      'The optimized scenario performs a targeted fresh timestamp read on every poll; only stable group metadata is TTL-cached.',
      'restartDelta is process-local and remains zero unless the benchmark process exits unexpectedly.',
    ],
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, ...result }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
