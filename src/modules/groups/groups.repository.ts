import { Prisma } from '@prisma/client';
import { db } from '@/src/lib/db';

async function createGroupRuleMappings(tx: Prisma.TransactionClient, groupId: string) {
  const rules = await tx.rule.findMany({ select: { id: true } });

  if (rules.length === 0) {
    return;
  }

  await tx.groupRule.createMany({
    data: rules.map((rule) => ({ groupId, ruleId: rule.id })),
    skipDuplicates: true,
  });
}

function normalizeGroupName(name?: string | null) {
  const normalized = name?.trim();
  return normalized ? normalized : null;
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

async function findGroupWithRelations(tx: Prisma.TransactionClient, id: string) {
  return tx.group.findUniqueOrThrow({
    where: { id },
    include: {
      watcher: true,
      groupRules: {
        include: { rule: true },
      },
    },
  });
}

async function ensureDiscoveredGroupTx(
  tx: Prisma.TransactionClient,
  input: {
    source: string;
    externalId: string;
    name?: string | null;
    watcherId?: string | null;
  },
) {
  const normalizedName = normalizeGroupName(input.name) ?? input.externalId;
  const existing = await tx.group.findUnique({
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
      await tx.group.update({
        where: { id: existing.id },
        data: {
          ...(nextName ? { name: nextName } : {}),
          ...(shouldUpdateWatcherId ? { watcherId: nextWatcherId } : {}),
        },
      });
    }

    return {
      group: await findGroupWithRelations(tx, existing.id),
      created: false,
      updated: shouldUpdate,
    };
  }

  try {
    const group = await tx.group.create({
      data: {
        source: input.source,
        externalId: input.externalId,
        name: normalizedName,
        isEnabled: true,
        watcherId: input.watcherId ?? null,
      },
      include: { watcher: true },
    });

    await createGroupRuleMappings(tx, group.id);

    return {
      group: await findGroupWithRelations(tx, group.id),
      created: true,
      updated: false,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    const conflictedGroup = await tx.group.findUniqueOrThrow({
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
      await tx.group.update({
        where: { id: conflictedGroup.id },
        data: {
          ...(nextName ? { name: nextName } : {}),
          ...(shouldUpdateWatcherId ? { watcherId: nextWatcherId } : {}),
        },
      });
    }

    return {
      group: await findGroupWithRelations(tx, conflictedGroup.id),
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
      include: {
        watcher: true,
        groupRules: {
          include: {
            rule: true,
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
    return db.$transaction((tx) => ensureDiscoveredGroupTx(tx, data));
  },
  create(data: { source: string; externalId: string; name: string; isEnabled: boolean; watcherId?: string | null }) {
    return db.$transaction(async (tx) => {
      const group = await tx.group.create({
        data,
        include: { watcher: true },
      });

      await createGroupRuleMappings(tx, group.id);

      return tx.group.findUniqueOrThrow({
        where: { id: group.id },
        include: {
          watcher: true,
          groupRules: {
            include: { rule: true },
          },
        },
      });
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
    const uniqueGroups = groups.filter(
      (group, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.source === group.source && candidate.externalId === group.externalId,
        ) === index,
    );

    return db.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;

      for (const group of uniqueGroups) {
        const result = await ensureDiscoveredGroupTx(tx, {
          source: group.source,
          externalId: group.externalId,
          name: group.name,
          watcherId,
        });

        if (result.created) {
          created += 1;
        } else if (result.updated) {
          updated += 1;
        }
      }

      return {
        total: uniqueGroups.length,
        created,
        updated,
      };
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
