import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { updateNotificationChannelSchema } from "@/src/modules/notifications/notifications.schemas";
import { getNotificationChannelById, updateNotificationChannel } from "@/src/modules/notifications/notifications.service";

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
    const json = await request.json();
    const input = updateNotificationChannelSchema.parse(json);
    return ok(await updateNotificationChannel(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
