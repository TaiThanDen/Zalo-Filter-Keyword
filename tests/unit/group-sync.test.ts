import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeDiscoveredGroups } from '@/src/modules/groups/groups.repository';

test('dedupeDiscoveredGroups keeps the latest unique source/external ID pair', () => {
  const result = dedupeDiscoveredGroups([
    { source: 'zalo', externalId: 'g1', name: 'Group 1' },
    { source: 'zalo', externalId: 'g1', name: 'Group 1 duplicate' },
    { source: 'zalo', externalId: 'g2', name: 'Group 2' },
  ]);

  assert.deepEqual(result, [
    { source: 'zalo', externalId: 'g1', name: 'Group 1 duplicate' },
    { source: 'zalo', externalId: 'g2', name: 'Group 2' },
  ]);
});
