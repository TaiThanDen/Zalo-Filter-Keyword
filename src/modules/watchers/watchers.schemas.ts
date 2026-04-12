import { z } from "zod";

export const watcherHeartbeatSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["online", "degraded", "offline"]),
});

export const watcherGroupSyncItemSchema = z.object({
  source: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
});

export const watcherGroupSyncSchema = z.object({
  groups: z.array(watcherGroupSyncItemSchema).max(500),
});
