import { Prisma } from '@prisma/client';
import { db } from '@/src/lib/db';

type GroupPersistenceClient = Pick<typeof db, 'group' | 'groupRule' | 'rule'>;

async function createGroupRuleMappings(client: GroupPersistenceClient, groupId: string) {
  const rules = await client.rule.findMany({ select: { id: true } });

  if (rules.length === 0) {
    return;
  }

  await client.groupRule.createMany({
    data: rules.map((rule) => ({ groupId, ruleId: rule.id })),
    skipDuplicates: true,
  });
}

function normalizeGroupName(name?: string | null) {
  const normalized = name?.trim();
  return normalized ? normalized : null;
}

export function dedupeDiscoveredGroups(
  groups: Array<{ source: string; externalId: string; name: string }>,
) {
  return Array.from(
    new Map(groups.map((group) => [`${group.source}\u0000${group.externalId}`, group])).values(),
  );
}

function shouldUpdateDiscoveredGroupName(
  existing: { name: string; externalId: string },
  nextName?: string | null,
) {
  if (!nextName || existing.name === nextName) {
    return false;
  }

  // Preserve manual/admin names and only replace the fallback name that mirrors the external id.
  return existing.name.trim() === existing.externalId.trim();
}

async function findGroupWithRelations(client: GroupPersistenceClient, id: string) {
  return client.group.findUniqueOrThrow({
    where: { id },
    include: {
      watcher: true,
      groupRules: {
        include: { rule: true },
      },
    },
  });
}

async function ensureDiscoveredGroupRecord(
  client: GroupPersistenceClient,
  input: {
    source: string;
    externalId: string;
    name?: string | null;
    watcherId?: string | null;
  },
) {
  const normalizedName = normalizeGroupName(input.name) ?? input.externalId;
  const existing = await client.group.findUnique({
    where: {
      source_externalId: {
        source: input.source,
        externalId: input.externalId,
      },
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      watcherId: true,
    },
  });

  if (existing) {
    const nextWatcherId = existing.watcherId ?? input.watcherId ?? null;
    const nextName = shouldUpdateDiscoveredGroupName(existing, normalizedName) ? normalizedName : undefined;
    const shouldUpdateWatcherId = existing.watcherId !== nextWatcherId;
    const shouldUpdate = Boolean(nextName) || shouldUpdateWatcherId;

    if (shouldUpdate) {
      await client.group.update({
        where: { id: existing.id },
        data: {
          ...(nextName ? { name: nextName } : {}),
          ...(shouldUpdateWatcherId ? { watcherId: nextWatcherId } : {}),
        },
      });
    }

    return {
      group: await findGroupWithRelations(client, existing.id),
      created: false,
      updated: shouldUpdate,
    };
  }

  try {
    const group = await client.group.create({
      data: {
        source: input.source,
        externalId: input.externalId,
        name: normalizedName,
        isEnabled: true,
        watcherId: input.watcherId ?? null,
      },
      include: { watcher: true },
    });

    await createGroupRuleMappings(client, group.id);

    return {
      group: await findGroupWithRelations(client, group.id),
      created: true,
      updated: false,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    const conflictedGroup = await client.group.findUniqueOrThrow({
      where: {
        source_externalId: {
          source: input.source,
          externalId: input.externalId,
        },
      },
      select: {
        id: true,
        name: true,
        externalId: true,
        watcherId: true,
      },
    });

    const nextWatcherId = conflictedGroup.watcherId ?? input.watcherId ?? null;
    const nextName = shouldUpdateDiscoveredGroupName(conflictedGroup, normalizedName)
      ? normalizedName
      : undefined;
    const shouldUpdateWatcherId = conflictedGroup.watcherId !== nextWatcherId;
    const shouldUpdate = Boolean(nextName) || shouldUpdateWatcherId;

    if (shouldUpdate) {
      await client.group.update({
        where: { id: conflictedGroup.id },
        data: {
          ...(nextName ? { name: nextName } : {}),
          ...(shouldUpdateWatcherId ? { watcherId: nextWatcherId } : {}),
        },
      });
    }

    return {
      group: await findGroupWithRelations(client, conflictedGroup.id),
      created: false,
      updated: shouldUpdate,
    };
  }
}

export const groupsRepository = {
  list(params: { search?: string; enabled?: boolean; skip: number; take: number }) {
    return db.group.findMany({
      where: {
        ...(typeof params.enabled === 'boolean' ? { isEnabled: params.enabled } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: 'insensitive' } },
                { externalId: { contains: params.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        source: true,
        externalId: true,
        name: true,
        isEnabled: true,
        watcherId: true,
        createdAt: true,
        updatedAt: true,
        watcher: {
          select: {
            id: true,
            name: true,
          },
        },
        groupRules: {
          select: {
            ruleId: true,
            rule: {
              select: {
                id: true,
                type: true,
                pattern: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  },
  count(params: { search?: string; enabled?: boolean }) {
    return db.group.count({
      where: {
        ...(typeof params.enabled === 'boolean' ? { isEnabled: params.enabled } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: 'insensitive' } },
                { externalId: { contains: params.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    });
  },
  findById(id: string) {
    return db.group.findUnique({
      where: { id },
      include: {
        watcher: true,
        groupRules: {
          include: { rule: true },
        },
      },
    });
  },
  findBySourceExternalId(source: string, externalId: string) {
    return db.group.findUnique({
      where: {
        source_externalId: {
          source,
          externalId,
        },
      },
      include: {
        groupRules: {
          include: { rule: true },
        },
      },
    });
  },
  ensureDiscoveredGroup(data: {
    source: string;
    externalId: string;
    name?: string | null;
    watcherId?: string | null;
  }) {
    return ensureDiscoveredGroupRecord(db, data);
  },
  async create(data: { source: string; externalId: string; name: string; isEnabled: boolean; watcherId?: string | null }) {
    const group = await db.group.create({
      data,
      include: { watcher: true },
    });

    await createGroupRuleMappings(db, group.id);

    return db.group.findUniqueOrThrow({
      where: { id: group.id },
      include: {
        watcher: true,
        groupRules: {
          include: { rule: true },
        },
      },
    });
  },
  update(id: string, data: { name?: string; isEnabled?: boolean; watcherId?: string | null }) {
    return db.group.update({
      where: { id },
      data,
      include: { watcher: true },
    });
  },
  delete(id: string) {
    return db.group.delete({ where: { id } });
  },
  replaceRules(groupId: string, ruleIds: string[]) {
    return db.$transaction(async (tx) => {
      await tx.groupRule.deleteMany({ where: { groupId } });
      if (ruleIds.length > 0) {
        await tx.groupRule.createMany({
          data: ruleIds.map((ruleId) => ({ groupId, ruleId })),
          skipDuplicates: true,
        });
      }

      return tx.group.findUnique({
        where: { id: groupId },
        include: {
          groupRules: {
            include: { rule: true },
          },
          watcher: true,
        },
      });
    });
  },
  async syncDiscoveredGroups(
    watcherId: string,
    groups: Array<{ source: string; externalId: string; name: string }>,
  ) {
    const uniqueGroups = dedupeDiscoveredGroups(groups);
    if (uniqueGroups.length === 0) return { total: 0, created: 0, updated: 0 };

    return db.$transaction(async (tx) => {
      const keys = uniqueGroups.map(({ source, externalId }) => ({ source, externalId }));
      const existingGroups = await tx.group.findMany({
        where: { OR: keys },
        select: { id: true, source: true, externalId: true, name: true, watcherId: true },
      });
      const existingByKey = new Map(
        existingGroups.map((group) => [`${group.source}\u0000${group.externalId}`, group]),
      );
      const missingGroups = uniqueGroups.filter(
        (group) => !existingByKey.has(`${group.source}\u0000${group.externalId}`),
      );
      const updates = uniqueGroups.flatMap((group) => {
        const existing = existingByKey.get(`${group.source}\u0000${group.externalId}`);
        if (!existing) return [];

        const normalizedName = normalizeGroupName(group.name) ?? group.externalId;
        const nextName = shouldUpdateDiscoveredGroupName(existing, normalizedName)
          ? normalizedName
          : undefined;
        const nextWatcherId = existing.watcherId ?? watcherId;
        if (!nextName && existing.watcherId === nextWatcherId) return [];

        return [{ id: existing.id, name: nextName, watcherId: nextWatcherId }];
      });

      const created = missingGroups.length > 0
        ? await tx.group.createMany({
          data: missingGroups.map((group) => ({
            source: group.source,
            externalId: group.externalId,
            name: normalizeGroupName(group.name) ?? group.externalId,
            isEnabled: true,
            watcherId,
          })),
          skipDuplicates: true,
        })
        : { count: 0 };

      await Promise.all(updates.map((group) => tx.group.update({
        where: { id: group.id },
        data: {
          ...(group.name ? { name: group.name } : {}),
          watcherId: group.watcherId,
        },
      })));

      if (missingGroups.length > 0) {
        const [createdGroups, rules] = await Promise.all([
          tx.group.findMany({
            where: {
              OR: missingGroups.map(({ source, externalId }) => ({ source, externalId })),
            },
            select: { id: true },
          }),
          tx.rule.findMany({ select: { id: true } }),
        ]);

        if (createdGroups.length > 0 && rules.length > 0) {
          await tx.groupRule.createMany({
            data: createdGroups.flatMap((group) =>
              rules.map((rule) => ({ groupId: group.id, ruleId: rule.id })),
            ),
            skipDuplicates: true,
          });
        }
      }

      return { total: uniqueGroups.length, created: created.count, updated: updates.length };
    });
  },
  listForWatcher(watcherId: string) {
    return db.group.findMany({
      where: {
        isEnabled: true,
        OR: [{ watcherId }, { watcherId: null }],
      },
      orderBy: { name: 'asc' },
    });
  },
};
