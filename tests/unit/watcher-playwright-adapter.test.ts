import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlaywrightConversationListAdapter,
  choosePreferredZaloPage,
  isFreshSnapshotActivityTime,
  mergeDiscoveredGroups,
  normalizeConversationCategoryLabel,
  parseStoredGroupCandidates,
  pickBestMessageTextCandidate,
  sortConversationCategoriesForScan,
  type SourceMessageEvent,
  type StoredGroupCandidate,
} from '@/src/modules/watchers/source-adapters';
import { env } from '@/src/config/env';
import { WatcherPollCoordinator } from '@/src/modules/watchers/poll-coordinator';
import type { Page } from 'playwright-core';

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

test('parseStoredGroupCandidates collects group ids from localStorage and archived chat metadata', () => {
  const groups = parseStoredGroupCandidates([
    ['0_g100_lastReceiveTs', '1776000000000'],
    ['0_g200_lastReceiveTs', '1775000000000'],
    ['0_123456_lastReceiveTs', '1774000000000'],
    ['693747670158442926__archived_chat', JSON.stringify([{ id: 'g300', type: 1 }, { id: 'g200', type: 1 }])],
    ['noise_key', 'noise'],
  ]);

  assert.deepEqual(groups, [
    {
      externalId: 'g100',
      lastReceiveTs: 1776000000000,
      isArchived: false,
    },
    {
      externalId: 'g200',
      lastReceiveTs: 1775000000000,
      isArchived: true,
    },
    {
      externalId: 'g300',
      lastReceiveTs: null,
      isArchived: true,
    },
  ]);
});

test('mergeDiscoveredGroups keeps visible names and still syncs stored-only groups with fallback ids', () => {
  const storedGroups: StoredGroupCandidate[] = [
    {
      externalId: 'g100',
      lastReceiveTs: 1776000000000,
      isArchived: false,
    },
    {
      externalId: 'g200',
      lastReceiveTs: 1775000000000,
      isArchived: false,
    },
  ];

  const groups = mergeDiscoveredGroups({
    visibleSnapshots: [
      {
        animDataId: 'g100',
        name: 'PG PB Team H',
        preview: 'Alice: hello',
        timeLabel: '10:20',
        unread: false,
        visibleIndex: 0,
      },
      {
        animDataId: '12345',
        name: 'Direct chat',
        preview: 'Bob: ping',
        timeLabel: '10:21',
        unread: false,
        visibleIndex: 1,
      },
    ],
    storedGroups,
    limit: 10,
    groupsOnly: true,
  });

  assert.deepEqual(groups, [
    {
      source: 'zalo',
      externalId: 'g100',
      name: 'PG PB Team H',
    },
    {
      source: 'zalo',
      externalId: 'g200',
      name: 'g200',
    },
  ]);
});

test('mergeDiscoveredGroups prefers cached real names for stored-only groups when available', () => {
  const groups = mergeDiscoveredGroups({
    visibleSnapshots: [],
    storedGroups: [
      {
        externalId: 'g200',
        lastReceiveTs: 1775000000000,
        isArchived: false,
      },
    ],
    knownGroupNames: {
      g200: 'Viec lam PG - Gia Khach',
    },
    limit: 10,
    groupsOnly: true,
  });

  assert.deepEqual(groups, [
    {
      source: 'zalo',
      externalId: 'g200',
      name: 'Viec lam PG - Gia Khach',
    },
  ]);
});

test('choosePreferredZaloPage prefers active tabs with visible conversations', () => {
  const preferred = choosePreferredZaloPage([
    {
      page: 'blocked-tab',
      index: 0,
      url: 'https://chat.zalo.me/',
      title: 'Zalo',
      rowCount: 0,
      hasComposer: false,
      activationPrompt: true,
    },
    {
      page: 'active-tab',
      index: 1,
      url: 'https://chat.zalo.me/',
      title: 'Zalo',
      rowCount: 14,
      hasComposer: true,
      activationPrompt: false,
    },
  ]);

  assert.equal(preferred?.page, 'active-tab');
});

test('choosePreferredZaloPage prefers composer when row counts tie', () => {
  const preferred = choosePreferredZaloPage([
    {
      page: 'list-only',
      index: 0,
      url: 'https://chat.zalo.me/',
      title: 'Zalo',
      rowCount: 0,
      hasComposer: false,
      activationPrompt: false,
    },
    {
      page: 'composer-ready',
      index: 1,
      url: 'https://chat.zalo.me/',
      title: 'Zalo',
      rowCount: 0,
      hasComposer: true,
      activationPrompt: false,
    },
  ]);

  assert.equal(preferred?.page, 'composer-ready');
});


test('normalizeConversationCategoryLabel recognizes Vietnamese and English labels', () => {
  assert.equal(normalizeConversationCategoryLabel('\u01afu ti\u00ean'), 'priority');
  assert.equal(normalizeConversationCategoryLabel('Kh\u00e1c'), 'other');
  assert.equal(normalizeConversationCategoryLabel('Priority'), 'priority');
  assert.equal(normalizeConversationCategoryLabel('Other'), 'other');
  assert.equal(normalizeConversationCategoryLabel('  Uu tien  '), 'priority');
  assert.equal(normalizeConversationCategoryLabel('unknown'), null);
});

test('sortConversationCategoriesForScan prioritizes tab Kh\u00e1c and removes duplicates', () => {
  assert.deepEqual(sortConversationCategoriesForScan(['priority', 'other', 'priority']), ['other', 'priority']);
});

test('pickBestMessageTextCandidate prefers full multiline content over truncated preview', () => {
  const selected = pickBestMessageTextCandidate([
    'Minh Tâm: 📢📢 Tuyển dụng ✨ Vị...',
    '📢📢 Tuyển dụng PG\nLương: 350k/ngày\nLiên hệ: 0909',
  ]);

  assert.equal(selected, '📢📢 Tuyển dụng PG\nLương: 350k/ngày\nLiên hệ: 0909');
});

test('pickBestMessageTextCandidate ignores reaction-like placeholders when a real message exists', () => {
  const selected = pickBestMessageTextCandidate([
    '/-strong\n/-heart\n:>\n:o\n:-((\n:-h',
    'Chị cần tuyển PG làm cuối tuần\nCa: 9h-17h\nLương: 400k',
  ]);

  assert.equal(selected, 'Chị cần tuyển PG làm cuối tuần\nCa: 9h-17h\nLương: 400k');
});

test('isFreshSnapshotActivityTime rejects stale clock labels that are too old for realtime alerts', () => {
  const now = Date.parse('2026-04-26T07:48:00.000Z');

  assert.equal(
    isFreshSnapshotActivityTime(
      {
        timeLabel: '14:30',
        lastReceiveTs: null,
      },
      now,
    ),
    false,
  );

  assert.equal(
    isFreshSnapshotActivityTime(
      {
        timeLabel: '14:43',
        lastReceiveTs: null,
      },
      now,
    ),
    true,
  );
});

test('isFreshSnapshotActivityTime prefers lastReceiveTs when available', () => {
  const now = Date.parse('2026-04-26T07:48:00.000Z');

  assert.equal(
    isFreshSnapshotActivityTime(
      {
        timeLabel: '14:30',
        lastReceiveTs: now - 2 * 60_000,
      },
      now,
    ),
    true,
  );
});

test('Local Storage cache keeps stable group data but discards volatile receive timestamps', { concurrency: false }, async (t) => {
  const originalEnabled = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED;
  const originalTtlMs = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = true;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS = 25;
  t.after(() => {
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = originalEnabled;
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS = originalTtlMs;
  });

  let scans = 0;
  const page = {
    evaluate: async () => {
      scans += 1;
      return [['0_g100_lastReceiveTs', String(1776000000000 + scans)]];
    },
  } as unknown as Page;
  const adapter = new PlaywrightConversationListAdapter() as unknown as {
    readStoredGroupCandidates: (page: Page, options?: { forceRefresh?: boolean }) => Promise<StoredGroupCandidate[]>;
    resetBrowserState: (reason: string) => Promise<void>;
  };

  const first = await adapter.readStoredGroupCandidates(page);
  const cached = await adapter.readStoredGroupCandidates(page);
  assert.equal(scans, 1);
  assert.deepEqual(cached, first);
  assert.equal(first[0]?.lastReceiveTs, null);

  await sleep(35);
  const expired = await adapter.readStoredGroupCandidates(page);
  assert.equal(scans, 2);
  assert.deepEqual(expired, first);

  await adapter.readStoredGroupCandidates(page, { forceRefresh: true });
  assert.equal(scans, 3);

  await adapter.resetBrowserState('test_cache_invalidation');
  await adapter.readStoredGroupCandidates(page);
  assert.equal(scans, 4);
});

test('cache-disabled Local Storage reads preserve legacy timestamps, ordering, and full scans', { concurrency: false }, async (t) => {
  const originalEnabled = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = false;
  t.after(() => {
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = originalEnabled;
  });

  let fullScans = 0;
  const page = {
    evaluate: async (_callback: unknown, argument?: unknown) => {
      assert.equal(argument, undefined, 'legacy full scan must not receive targeted conversation ids');
      fullScans += 1;
      return [
        ['0_g-old_lastReceiveTs', '1775000000000'],
        ['0_g-new_lastReceiveTs', '1776000000000'],
        ['legacy-user__archived_chat', JSON.stringify([{ id: 'g-none', type: 1 }])],
      ];
    },
  } as unknown as Page;
  const adapter = new PlaywrightConversationListAdapter() as unknown as {
    readStoredGroupCandidates: (page: Page) => Promise<StoredGroupCandidate[]>;
  };

  const first = await adapter.readStoredGroupCandidates(page);
  const second = await adapter.readStoredGroupCandidates(page);

  assert.equal(fullScans, 2, 'cache-disabled reads must perform the legacy full scan every time');
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((candidate) => [candidate.externalId, candidate.lastReceiveTs]),
    [
      ['g-new', 1776000000000],
      ['g-old', 1775000000000],
      ['g-none', null],
    ],
  );
});

test('cache-disabled poll keeps the legacy full-scan path and never uses targeted reads', { concurrency: false }, async (t) => {
  const originalCacheEnabled = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED;
  const originalFastPreviewOnly = env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY;
  const originalPrefilterEnabled = env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = false;
  env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY = false;
  env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED = true;
  t.after(() => {
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = originalCacheEnabled;
    env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY = originalFastPreviewOnly;
    env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED = originalPrefilterEnabled;
  });

  const now = Date.now();
  let currentLastReceiveTs = now - 1_000;
  let fullScans = 0;
  let targetedReads = 0;
  let messageReadIndex = 0;
  const snapshot = {
    animDataId: 'g100',
    name: 'Nhóm legacy',
    preview: 'Alice: Nội dung preview giống nhau...',
    timeLabel: '22:00',
    unread: true,
    visibleIndex: 0,
  };
  const page = {
    evaluate: async (_callback: unknown, argument?: unknown) => {
      if (Array.isArray(argument)) {
        targetedReads += 1;
        return [['g100', currentLastReceiveTs]];
      }
      fullScans += 1;
      return [['0_g100_lastReceiveTs', String(currentLastReceiveTs)]];
    },
  } as unknown as Page;
  const adapter = new PlaywrightConversationListAdapter() as unknown as {
    poll: (onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) => Promise<void>;
    ensurePage: () => Promise<Page>;
    removeMutationObserver: (page: Page) => Promise<void>;
    collectTopSnapshots: () => Promise<Array<typeof snapshot>>;
    readLatestConversationMessage: () => Promise<{ messageText: string; senderName: string }>;
    switchToPreferredSidebarCategory: () => Promise<void>;
    persistState: () => Promise<void>;
  };
  adapter.ensurePage = async () => page;
  adapter.removeMutationObserver = async () => {};
  adapter.collectTopSnapshots = async () => [snapshot];
  adapter.readLatestConversationMessage = async () => ({
    messageText: messageReadIndex++ === 0 ? 'Nội dung đầy đủ lần một' : 'Nội dung đầy đủ lần hai',
    senderName: 'Alice',
  });
  adapter.switchToPreferredSidebarCategory = async () => {};
  adapter.persistState = async () => {};

  const events: SourceMessageEvent[] = [];
  await adapter.poll(async (event) => {
    events.push(event);
  }, false);
  currentLastReceiveTs = now;
  await adapter.poll(async (event) => {
    events.push(event);
  }, false);

  assert.equal(fullScans, 2, 'each legacy poll must perform a full Local Storage scan');
  assert.equal(targetedReads, 0, 'targeted timestamp reads belong only to the optimized path');
  assert.equal(events.length, 2);
  assert.equal((events[0].rawPayload as { lastReceiveTs: number }).lastReceiveTs, now - 1_000);
  assert.equal((events[1].rawPayload as { lastReceiveTs: number }).lastReceiveTs, now);
});

test('adapter poll emits again inside cache TTL when preview is unchanged but fresh lastReceiveTs increases', { concurrency: false }, async (t) => {
  const originalCacheEnabled = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED;
  const originalCacheTtlMs = env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS;
  const originalFastPreviewOnly = env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY;
  const originalPrefilterEnabled = env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = true;
  env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS = 30_000;
  env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY = false;
  env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED = true;
  t.after(() => {
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_ENABLED = originalCacheEnabled;
    env.WATCHER_PLAYWRIGHT_LOCAL_STORAGE_CACHE_TTL_MS = originalCacheTtlMs;
    env.WATCHER_PLAYWRIGHT_FAST_PREVIEW_ONLY = originalFastPreviewOnly;
    env.WATCHER_PLAYWRIGHT_RULE_PREFILTER_ENABLED = originalPrefilterEnabled;
  });

  const now = Date.now();
  let currentLastReceiveTs = now - 1_000;
  let stableStorageScans = 0;
  let timestampReads = 0;
  let messageReadIndex = 0;
  const snapshot = {
    animDataId: 'g100',
    name: 'Nhóm kiểm thử',
    preview: 'Alice: Nội dung preview giống nhau...',
    timeLabel: '22:00',
    unread: true,
    visibleIndex: 0,
  };
  const page = {
    evaluate: async (_callback: unknown, argument?: unknown) => {
      if (Array.isArray(argument)) {
        timestampReads += 1;
        return [['g100', currentLastReceiveTs]];
      }
      stableStorageScans += 1;
      return [['0_g100_lastReceiveTs', String(currentLastReceiveTs)]];
    },
  } as unknown as Page;
  const adapter = new PlaywrightConversationListAdapter() as unknown as {
    poll: (onEvent: (event: SourceMessageEvent) => Promise<void>, isInitial: boolean) => Promise<void>;
    readStoredGroupCandidates: (page: Page) => Promise<StoredGroupCandidate[]>;
    ensurePage: () => Promise<Page>;
    removeMutationObserver: (page: Page) => Promise<void>;
    collectTopSnapshots: () => Promise<Array<typeof snapshot>>;
    readLatestConversationMessage: () => Promise<{ messageText: string; senderName: string }>;
    switchToPreferredSidebarCategory: () => Promise<void>;
    persistState: () => Promise<void>;
  };
  adapter.ensurePage = async () => page;
  adapter.removeMutationObserver = async () => {};
  adapter.collectTopSnapshots = async () => [snapshot];
  adapter.readLatestConversationMessage = async () => ({
    messageText: messageReadIndex++ === 0 ? 'Nội dung đầy đủ lần một' : 'Nội dung đầy đủ lần hai',
    senderName: 'Alice',
  });
  adapter.switchToPreferredSidebarCategory = async () => {};
  adapter.persistState = async () => {};

  const events: SourceMessageEvent[] = [];
  const onEvent = async (event: SourceMessageEvent) => {
    events.push(event);
  };

  await adapter.readStoredGroupCandidates(page);
  await adapter.poll(onEvent, false);
  currentLastReceiveTs = now;
  await adapter.readStoredGroupCandidates(page);
  await adapter.poll(onEvent, false);

  assert.equal(stableStorageScans, 1, 'stable group cache should remain inside its TTL');
  assert.equal(timestampReads, 2, 'realtime timestamps must be read fresh for every poll');
  assert.equal(events.length, 2);
  assert.notEqual(events[0].messageExternalId, events[1].messageExternalId);
  assert.equal((events[0].rawPayload as { lastReceiveTs: number }).lastReceiveTs, now - 1_000);
  assert.equal((events[1].rawPayload as { lastReceiveTs: number }).lastReceiveTs, now);
});

test('pausing the adapter cancels an in-flight coordinator and drops its trailing request', { concurrency: false }, async () => {
  let releaseRun: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRun = resolve;
  });
  let runs = 0;
  const coordinator = new WatcherPollCoordinator({
    minimumIntervalMs: 20,
    trailingDebounceMs: 20,
    trailingMaxWaitMs: 100,
    run: async () => {
      runs += 1;
      markStarted?.();
      await release;
    },
  });
  const adapter = new PlaywrightConversationListAdapter() as unknown as {
    setPaused: (paused: boolean) => Promise<void>;
    pollCoordinator: WatcherPollCoordinator | null;
    loadedPersistedState: boolean;
    persistState: () => Promise<void>;
  };
  adapter.pollCoordinator = coordinator;
  adapter.loadedPersistedState = true;
  adapter.persistState = async () => {};

  coordinator.request('mutation', 20);
  await started;
  coordinator.request('mutation', 20);
  await adapter.setPaused(true);
  releaseRun?.();
  await sleep(80);

  assert.equal(runs, 1);
  assert.equal(adapter.pollCoordinator, null);
  assert.equal(coordinator.getMetrics().runsCompleted, 1);
});
