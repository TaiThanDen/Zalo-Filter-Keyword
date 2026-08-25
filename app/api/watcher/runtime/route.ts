import { handleRouteError, ok } from "@/src/lib/http";
import { getAuthenticatedWatcherRuntime } from "@/src/modules/watchers/watchers.service";
import { requireWatcherApiKey } from "@/src/server/guards/watcher.guard";

export const maxDuration = 10;

export async function GET(request: Request) {
  try {
    const apiKey = requireWatcherApiKey(request.headers.get("authorization"));
    return ok(await getAuthenticatedWatcherRuntime(apiKey));
  } catch (error) {
    return handleRouteError(error);
  }
}
