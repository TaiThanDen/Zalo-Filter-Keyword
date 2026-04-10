import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherAuth } from "@/src/server/guards/watcher.guard";
import { watcherHeartbeatSchema } from "@/src/modules/watchers/watchers.schemas";
import { recordHeartbeat } from "@/src/modules/watchers/watchers.service";

export async function POST(request: Request) {
  try {
    const watcher = await requireWatcherAuth(request.headers.get("authorization"));
    const json = await request.json();
    const input = watcherHeartbeatSchema.parse(json);
    await recordHeartbeat(watcher.id, input, request.headers.get("x-forwarded-for"));
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
