import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherAuth } from "@/src/server/guards/watcher.guard";
import { getWatcherConfig } from "@/src/modules/watchers/watchers.service";

export async function GET(request: Request) {
  try {
    const watcher = await requireWatcherAuth(request.headers.get("authorization"));
    return ok(await getWatcherConfig(watcher.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
