import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { updateWatcherSleepScheduleSchema } from "@/src/modules/watchers/watcher-runtime.schemas";
import { updateWatcherSleepSchedule } from "@/src/modules/watchers/watcher-runtime.service";
import { resolveWatcherSleepSchedule } from "@/src/modules/watchers/watcher-schedule";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const input = updateWatcherSleepScheduleSchema.parse(await request.json());
    const config = await updateWatcherSleepSchedule(id, input);
    return ok(resolveWatcherSleepSchedule(config));
  } catch (error) {
    return handleRouteError(error);
  }
}
