import { z } from "zod";

export const ingestMessageSchema = z.object({
  source: z.string().min(1).default("zalo"),
  groupExternalId: z.string().min(1),
  groupName: z.string().trim().optional(),
  messageExternalId: z.string().trim().optional(),
  senderExternalId: z.string().trim().optional(),
  senderName: z.string().trim().optional(),
  messageText: z.string(),
  messageTime: z.string().datetime(),
  rawPayload: z.unknown().optional(),
});
