import { AppError } from "@/src/lib/errors";
import { resolvePagination } from "@/src/lib/pagination";
import { groupsRepository } from "@/src/modules/groups/groups.repository";

export async function listGroups(input: {
  enabled?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const pagination = resolvePagination(input.page, input.pageSize);
  const enabled = input.enabled === undefined ? undefined : input.enabled === "true";
  const [items, total] = await Promise.all([
    groupsRepository.list({
      search: input.search?.trim() || undefined,
      enabled,
      skip: pagination.skip,
      take: pagination.take,
    }),
    groupsRepository.count({
      search: input.search?.trim() || undefined,
      enabled,
    }),
  ]);

  return {
    items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    },
  };
}

export async function getGroupById(id: string) {
  const group = await groupsRepository.findById(id);

  if (!group) {
    throw new AppError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  return group;
}

export async function createGroup(input: {
  source: string;
  externalId: string;
  name: string;
  isEnabled: boolean;
  watcherId?: string | null;
}) {
  return groupsRepository.create({
    source: input.source,
    externalId: input.externalId,
    name: input.name,
    isEnabled: input.isEnabled,
    watcherId: input.watcherId ?? null,
  });
}

export async function updateGroup(
  id: string,
  input: { name?: string; isEnabled?: boolean; watcherId?: string | null },
) {
  await getGroupById(id);

  return groupsRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
    ...(input.watcherId !== undefined ? { watcherId: input.watcherId } : {}),
  });
}

export async function deleteGroup(id: string) {
  await getGroupById(id);
  await groupsRepository.delete(id);
}

export async function replaceGroupRules(groupId: string, ruleIds: string[]) {
  const group = await groupsRepository.replaceRules(groupId, ruleIds);

  if (!group) {
    throw new AppError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  return group;
}
