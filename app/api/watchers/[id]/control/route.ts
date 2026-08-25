import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { updateWatcherControlModeSchema } from "@/src/modules/watchers/watcher-runtime.schemas";
import { updateWatcherControlMode } from "@/src/modules/watchers/watcher-runtime.service";
import { resolveWatcherRuntimeControl } from "@/src/modules/watchers/watcher-schedule";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const input = updateWatcherControlModeSchema.parse(await request.json());
    const config = await updateWatcherControlMode(id, input.controlMode);
    return ok(resolveWatcherRuntimeControl(config));
  } catch (error) {
    return handleRouteError(error);
  }
}
