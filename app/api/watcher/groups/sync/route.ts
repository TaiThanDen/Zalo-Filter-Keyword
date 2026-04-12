import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherAuth } from "@/src/server/guards/watcher.guard";
import { watcherGroupSyncSchema } from "@/src/modules/watchers/watchers.schemas";
import { syncWatcherGroups } from "@/src/modules/watchers/watchers.service";

export async function POST(request: Request) {
  try {
    const watcher = await requireWatcherAuth(request.headers.get("authorization"));
    const json = await request.json();
    const input = watcherGroupSyncSchema.parse(json);
    return ok(await syncWatcherGroups(watcher.id, input.groups));
  } catch (error) {
    return handleRouteError(error);
  }
}
