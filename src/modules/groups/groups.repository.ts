import { db } from "@/src/lib/db";

export const groupsRepository = {
  list(params: { search?: string; enabled?: boolean; skip: number; take: number }) {
    return db.group.findMany({
      where: {
        ...(typeof params.enabled === "boolean" ? { isEnabled: params.enabled } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: "insensitive" } },
                { externalId: { contains: params.search, mode: "insensitive" } },
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
      orderBy: { updatedAt: "desc" },
      skip: params.skip,
      take: params.take,
    });
  },
  count(params: { search?: string; enabled?: boolean }) {
    return db.group.count({
      where: {
        ...(typeof params.enabled === "boolean" ? { isEnabled: params.enabled } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: "insensitive" } },
                { externalId: { contains: params.search, mode: "insensitive" } },
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
  create(data: { source: string; externalId: string; name: string; isEnabled: boolean; watcherId?: string | null }) {
    return db.group.create({
      data,
      include: { watcher: true },
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
  listForWatcher(watcherId: string) {
    return db.group.findMany({
      where: {
        isEnabled: true,
        OR: [{ watcherId }, { watcherId: null }],
      },
      orderBy: { name: "asc" },
    });
  },
};
