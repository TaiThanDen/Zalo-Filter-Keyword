import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherApiKey } from "@/src/server/guards/watcher.guard";
import { watcherHeartbeatSchema } from "@/src/modules/watchers/watchers.schemas";
import { recordAuthenticatedHeartbeat } from "@/src/modules/watchers/watchers.service";

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const apiKey = requireWatcherApiKey(request.headers.get("authorization"));
    const json = await request.json();
    const input = watcherHeartbeatSchema.parse(json);
    await recordAuthenticatedHeartbeat(apiKey, input, request.headers.get("x-forwarded-for"));
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
