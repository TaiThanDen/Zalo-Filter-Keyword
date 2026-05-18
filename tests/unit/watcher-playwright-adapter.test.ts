import assert from 'node:assert/strict';
import test from 'node:test';
import {
  choosePreferredZaloPage,
  isFreshSnapshotActivityTime,
  mergeDiscoveredGroups,
  normalizeConversationCategoryLabel,
  parseStoredGroupCandidates,
  pickBestMessageTextCandidate,
  sortConversationCategoriesForScan,
  type StoredGroupCandidate,
} from '@/src/modules/watchers/source-adapters';

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
