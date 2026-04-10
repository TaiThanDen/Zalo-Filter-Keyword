import { db } from "@/src/lib/db";

export const rulesRepository = {
  list(params: { type?: "INCLUDE" | "EXCLUDE"; active?: boolean; search?: string }) {
    return db.rule.findMany({
      where: {
        ...(params.type ? { type: params.type } : {}),
        ...(typeof params.active === "boolean" ? { isActive: params.active } : {}),
        ...(params.search
          ? {
              pattern: {
                contains: params.search,
                mode: "insensitive",
              },
            }
          : {}),
      },
      include: {
        groupRules: true,
      },
      orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
    });
  },
  findById(id: string) {
    return db.rule.findUnique({
      where: { id },
      include: {
        groupRules: true,
      },
    });
  },
  findManyByIds(ids: string[]) {
    return db.rule.findMany({ where: { id: { in: ids } } });
  },
  create(data: {
    type: "INCLUDE" | "EXCLUDE";
    pattern: string;
    matchType: "CONTAINS" | "WHOLE_WORD";
    caseSensitive: boolean;
    isActive: boolean;
    note?: string | null;
  }) {
    return db.rule.create({ data });
  },
  update(id: string, data: {
    pattern?: string;
    matchType?: "CONTAINS" | "WHOLE_WORD";
    caseSensitive?: boolean;
    isActive?: boolean;
    note?: string | null;
  }) {
    return db.rule.update({ where: { id }, data });
  },
  delete(id: string) {
    return db.rule.delete({ where: { id } });
  },
  listActiveForGroup(groupId: string) {
    return db.rule.findMany({
      where: {
        isActive: true,
        groupRules: {
          some: {
            groupId,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },
};
