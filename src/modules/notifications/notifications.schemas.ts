import { z } from "zod";

const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
  parseMode: z.enum(["HTML", "MarkdownV2"]).optional(),
});

export const createNotificationChannelSchema = z.object({
  type: z.enum(["TELEGRAM", "MESSENGER"]),
  name: z.string().min(1),
  isActive: z.boolean().default(true),
  config: telegramConfigSchema,
});

export const updateNotificationChannelSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  config: telegramConfigSchema.optional(),
});
