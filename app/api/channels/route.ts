import { handleRouteError, ok, created } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { createNotificationChannelSchema } from "@/src/modules/notifications/notifications.schemas";
import { createNotificationChannel, listNotificationChannels } from "@/src/modules/notifications/notifications.service";

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
    const json = await request.json();
    const input = createNotificationChannelSchema.parse(json);
    return created(await createNotificationChannel(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
