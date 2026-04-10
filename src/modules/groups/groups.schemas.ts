import { z } from "zod";

export const listGroupsQuerySchema = z.object({
  enabled: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
});

export const createGroupSchema = z.object({
  source: z.string().min(1).default("zalo"),
  externalId: z.string().min(1),
  name: z.string().min(1),
  isEnabled: z.boolean().default(true),
  watcherId: z.string().min(1).nullable().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
  watcherId: z.string().min(1).nullable().optional(),
});

export const replaceGroupRulesSchema = z.object({
  ruleIds: z.array(z.string().min(1)),
});
