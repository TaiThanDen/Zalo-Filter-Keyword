import { handleRouteError, ok, created } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { createNotificationChannelSchema } from "@/src/modules/notifications/notifications.schemas";
import {
  createNotificationChannel,
  listNotificationChannels,
} from "@/src/modules/notifications/notifications.service";

function normalizeChannelPayload(json: Record<string, unknown>) {
  if (json.config && typeof json.config === "object") {
    return json;
  }

  return {
    type: json.type ?? "TELEGRAM",
    name: json.name,
    isActive: json.isActive,
    ruleIds: json.ruleIds,
    config: {
      botToken: json.botToken,
      chatId: json.chatId,
      parseMode: json.parseMode,
    },
  };
}

export async function GET() {
  try {
    await requireAdminSession();
    return ok(await listNotificationChannels());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const json = (await request.json()) as Record<string, unknown>;
    const input = createNotificationChannelSchema.parse(normalizeChannelPayload(json));
    return created(await createNotificationChannel(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
