import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeDiscoveredGroups,
  parseStoredGroupCandidates,
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

test('mergeDiscoveredGroups keeps visible names and appends stored-only groups without duplicates', () => {
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
      },
      {
        animDataId: '12345',
        name: 'Direct chat',
        preview: 'Bob: ping',
        timeLabel: '10:21',
        unread: false,
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
