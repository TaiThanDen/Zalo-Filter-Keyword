import { handleRouteError, ok } from '@/src/lib/http';
import { requireAdminSession } from '@/src/server/guards/auth.guard';
import { updateNotificationChannelSchema } from '@/src/modules/notifications/notifications.schemas';
import {
  deleteNotificationChannel,
  getNotificationChannelById,
  updateNotificationChannel,
} from '@/src/modules/notifications/notifications.service';

function normalizeChannelPayload(json: Record<string, unknown>) {
  if (json.config && typeof json.config === 'object') {
    return json;
  }

  const hasFlatConfigFields = ['botToken', 'chatId', 'parseMode'].some((key) => key in json);

  return {
    name: json.name,
    isActive: json.isActive,
    ...(hasFlatConfigFields
      ? {
          config: {
            botToken: json.botToken,
            chatId: json.chatId,
            parseMode: json.parseMode,
          },
        }
      : {}),
  };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    return ok(await getNotificationChannelById(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const json = (await request.json()) as Record<string, unknown>;
    const input = updateNotificationChannelSchema.parse(normalizeChannelPayload(json));
    return ok(await updateNotificationChannel(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    await deleteNotificationChannel(id);
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
