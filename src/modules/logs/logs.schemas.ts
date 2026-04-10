import { z } from "zod";

export const listLogsQuerySchema = z.object({
  groupId: z.string().optional(),
  decision: z
    .enum([
      "MATCHED",
      "REJECTED_NO_INCLUDE",
      "REJECTED_BY_EXCLUDE",
      "REJECTED_GROUP_DISABLED",
      "REJECTED_DUPLICATE",
      "REJECTED_UNKNOWN_GROUP",
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
});
