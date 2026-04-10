import { z } from "zod";

export const listRulesQuerySchema = z.object({
  type: z.enum(["INCLUDE", "EXCLUDE"]).optional(),
  active: z.enum(["true", "false"]).optional(),
  search: z.string().trim().optional(),
});

export const createRuleSchema = z.object({
  type: z.enum(["INCLUDE", "EXCLUDE"]),
  pattern: z.string().min(1),
  matchType: z.enum(["CONTAINS", "WHOLE_WORD"]).default("CONTAINS"),
  caseSensitive: z.boolean().default(false),
  isActive: z.boolean().default(true),
  note: z.string().trim().nullable().optional(),
});

export const updateRuleSchema = z.object({
  pattern: z.string().min(1).optional(),
  matchType: z.enum(["CONTAINS", "WHOLE_WORD"]).optional(),
  caseSensitive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().nullable().optional(),
});
