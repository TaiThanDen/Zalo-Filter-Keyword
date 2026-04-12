import assert from 'node:assert/strict';
import test from 'node:test';
import { groupsRepository } from '@/src/modules/groups/groups.repository';

function stubMethod<T extends object, K extends keyof T>(obj: T, key: K, value: unknown) {
  const original = obj[key];
  obj[key] = value as T[K];
  return () => {
    obj[key] = original;
  };
}

test('syncDiscoveredGroups deduplicates input and processes each group through ensureDiscoveredGroup', async (t) => {
  const restore: Array<() => void> = [];
  t.after(() => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
  });

  const seen: Array<{ source: string; externalId: string; name: string; watcherId: string }> = [];

  restore.push(
    stubMethod(groupsRepository, 'ensureDiscoveredGroup', async (input: { source: string; externalId: string; name: string; watcherId: string }) => {
      seen.push(input);

      return {
        group: { id: input.externalId },
        created: input.externalId === 'g1',
        updated: input.externalId === 'g2',
      };
    }),
  );

  const result = await groupsRepository.syncDiscoveredGroups('watcher-1', [
    { source: 'zalo', externalId: 'g1', name: 'Group 1' },
    { source: 'zalo', externalId: 'g1', name: 'Group 1 duplicate' },
    { source: 'zalo', externalId: 'g2', name: 'Group 2' },
  ]);

  assert.deepEqual(seen, [
    { source: 'zalo', externalId: 'g1', name: 'Group 1', watcherId: 'watcher-1' },
    { source: 'zalo', externalId: 'g2', name: 'Group 2', watcherId: 'watcher-1' },
  ]);
  assert.deepEqual(result, {
    total: 2,
    created: 1,
    updated: 1,
  });
});
