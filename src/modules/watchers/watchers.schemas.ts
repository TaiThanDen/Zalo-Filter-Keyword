import { z } from "zod";

export const watcherHeartbeatSchema = z.object({
  version: z.string().min(1),
  status: z.enum(["online", "degraded", "offline"]),
});
