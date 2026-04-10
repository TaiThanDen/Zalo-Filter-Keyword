import { AppError } from "@/src/lib/errors";
import { rulesRepository } from "@/src/modules/rules/rules.repository";

export async function listRules(input: {
  type?: "INCLUDE" | "EXCLUDE";
  active?: string;
  search?: string;
}) {
  const active = input.active === undefined ? undefined : input.active === "true";
  return rulesRepository.list({
    type: input.type,
    active,
    search: input.search?.trim() || undefined,
  });
}

export async function getRuleById(id: string) {
  const rule = await rulesRepository.findById(id);

  if (!rule) {
    throw new AppError("RULE_NOT_FOUND", "Rule not found", 404);
  }

  return rule;
}

export async function createRule(input: {
  type: "INCLUDE" | "EXCLUDE";
  pattern: string;
  matchType: "CONTAINS" | "WHOLE_WORD";
  caseSensitive: boolean;
  isActive: boolean;
  note?: string | null;
}) {
  return rulesRepository.create({
    ...input,
    note: input.note ?? null,
  });
}

export async function updateRule(
  id: string,
  input: {
    pattern?: string;
    matchType?: "CONTAINS" | "WHOLE_WORD";
    caseSensitive?: boolean;
    isActive?: boolean;
    note?: string | null;
  },
) {
  await getRuleById(id);
  return rulesRepository.update(id, input);
}

export async function deleteRule(id: string) {
  await getRuleById(id);
  await rulesRepository.delete(id);
}
