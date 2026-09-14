# Watcher B0/B1 local implementation

Scope: local-only implementation on branch `codex/b0-b1-zalo`, based on production commit `7f0a7e268f76a03fd798c44e47933c0b4dc77345`.

No production deployment, PM2 restart, Chromium flag/profile change, cgroup, SIGSTOP, live Zoom run, or production Zalo burst was performed.

## Feature flags

All behavior-changing flags default to `false`, so an artifact built from this branch retains the pre-B1 scheduling and Local Storage behavior until explicitly enabled.

| Variable | Default | Purpose |
|---|---:|---|
| `WATCHER_PLAYWRIGHT_B0_INSTRUMENTATION_ENABLED` | `false` | Emit rate-limited `watcher_playwright_poll_metrics` structured logs without message/group payloads. |
| `WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED` | `false` | Route mutation-triggered polls through the single-flight coordinator. |
| `WATCHER_PLAYWRIGHT_POLL_MIN_INTERVAL_MS` | `1000` | Hard minimum spacing between coalesced poll starts. |
| `WATCHER_PLAYWRIGHT_POLL_TRAILING_DEBOUNCE_MS` | `350` | Quiet window after the most recent mutation signal. |
| `WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS` | `5000` | Maximum wait from the first pending mutation; validation rejects values above 10 seconds. |
| `WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED` | `false` | Cache only stable parsed group membership/archive metadata per Playwright page. |
| `WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS` | `30000` | TTL for stable group metadata; realtime receive timestamps are never served from this cache. |
| `WATCHER_PLAYWRIGHT_METRICS_LOG_INTERVAL_MS` | `60000` | Minimum interval between cumulative metric logs. |

Recommended local B1 combination:

```dotenv
WATCHER_PLAYWRIGHT_B0_INSTRUMENTATION_ENABLED=true
WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED=true
WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED=true
WATCHER_PLAYWRIGHT_POLL_MIN_INTERVAL_MS=1000
WATCHER_PLAYWRIGHT_POLL_TRAILING_DEBOUNCE_MS=350
WATCHER_PLAYWRIGHT_POLL_TRAILING_MAX_WAIT_MS=5000
WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS=30000
WATCHER_PLAYWRIGHT_METRICS_LOG_INTERVAL_MS=60000
```

## Runtime behavior

- With coalescing disabled, `scheduleNextPoll` keeps the original clear-and-replace timer path.
- With coalescing enabled, mutation requests are trailing-debounced, capped by max wait, and spaced by the hard minimum interval.
- At most one coordinated poll is in flight. Requests received during a poll are retained for a trailing run.
- The safety poll remains scheduled independently and cannot postpone an earlier mutation poll.
- Local Storage cache is bound to the exact Playwright `Page`; browser reset and adapter stop clear it.
- With the cache flag disabled, every realtime poll preserves the legacy full Local Storage scan, timestamps, stored-group ordering, and scheduling path.
- With the cache flag enabled, cached candidates have `lastReceiveTs: null`. Every realtime poll performs a fresh, targeted read of `0_<conversationId>_lastReceiveTs` for the visible snapshots before computing signatures.
- `listGroups()` may reuse the stable metadata cache, but volatile timestamps are neither cached nor used from a cached candidate.
- Instrumentation reports counts, durations, rates, cache hit/miss/scan counts, targeted timestamp reads, and coordinator counters. It does not log message text, group IDs, rules, cookies, or storage values.

## Tests

The added tests cover:

- sustained mutation burst coalescing and hard minimum interval;
- no overlapping poll runs;
- requests arriving during an in-flight poll;
- a safety-only poll when there is no mutation;
- pause/cancel while a coordinated poll is in flight, including dropping its queued trailing run;
- matching/non-matching/excluded fixtures;
- zero missed and duplicate alerts in the burst harness;
- alert latency below 10 seconds;
- page-bound TTL cache hit, expiry, forced refresh, and volatile timestamp removal;
- cache-disabled parity for full scans, preserved timestamps, stored-group ordering, and absence of targeted reads;
- direct `PlaywrightConversationListAdapter.poll()` regression: two polls inside one TTL with the same preview and increasing fresh `lastReceiveTs` both emit an event.

Existing ingestion/delivery tests continue to verify persistent dedupe and notification behavior.

## Reproducible benchmark

Command:

```powershell
npm.cmd run benchmark:watcher-poll -- --duration-seconds=60 --output=output/b0-b1-benchmark-60s.json
```

This benchmark is synthetic and local. It compares the legacy timer plus per-poll full Local Storage scan against coalescing, targeted fresh timestamp reads, and a 30-second stable-metadata TTL under the same deterministic mutation/message workload. It does not claim live Chromium or production CPU performance. Its alert fixtures validate only the benchmark harness; they do not replace the direct adapter integration regression above.

| Metric | Legacy | Coalesced + TTL | Delta |
|---|---:|---:|---:|
| Duration | 61.785 s | 61.533 s | comparable |
| Mutation signals | 156 | 155 | one timing-boundary signal difference |
| Poll runs | 156 | 53 | `-66.03%` |
| Poll rate | 151.49/min | 51.68/min | `-65.88%` |
| Full Local Storage scans | 156 | 0 | `-100%` |
| Stable metadata scans | 156 | 3 | `-98.08%` |
| Targeted timestamp read batches/keys | 0/0 | 53/795 | fresh on every optimized poll |
| Process CPU time | 500 ms | 110 ms | `-78.00%` |
| Average one-core CPU | 0.81% | 0.18% | `-0.63 pp` |
| RSS p95 | 68.41 MiB | 62.07 MiB | `-6.34 MiB` |
| Expected/emitted alerts | 9/9 | 9/9 | no loss |
| Duplicate alerts | 0 | 0 | unchanged |
| Alert latency p95 | 360 ms | 1136 ms | `+776 ms`, still `<10 s` |
| Alert latency max | 360 ms | 1136 ms | still `<10 s` |
| Maximum concurrent polls | 1 | 1 | single-flight preserved |
| Restart delta | 0 | 0 | unchanged |

Raw result: `output/b0-b1-benchmark-60s.json`.

## Instant rollback

No source rollback is required to disable B1 behavior. Set or remove these environment values and restart only the local watcher process being tested:

```dotenv
WATCHER_PLAYWRIGHT_B0_INSTRUMENTATION_ENABLED=false
WATCHER_PLAYWRIGHT_POLL_COALESCING_ENABLED=false
WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED=false
```

With those flags false, numeric tuning values are inert and the original clear-and-replace timer plus per-poll full Local Storage scan is used. The scan preserves `lastReceiveTs` and legacy stored-group ordering, and targeted timestamp reads are not used. For a code-level rollback, discard/revert the B0/B1 branch or return to commit `7f0a7e2`; never modify the dirty `main` working tree to do so.
