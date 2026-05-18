import { handleRouteError, ok } from "@/src/lib/http";
import { listWatchers } from "@/src/modules/watchers/watchers.service";
import { requireAdminSession } from "@/src/server/guards/auth.guard";

export async function GET() {
  try {
    await requireAdminSession();
    const watchers = await listWatchers();
    return ok(
      watchers.map((watcher) => ({
        id: watcher.id,
        name: watcher.name,
        status: watcher.status,
        reportedStatus: watcher.reportedStatus,
        lastHeartbeatAt: watcher.lastHeartbeatAt,
        lastSeenIp: watcher.lastSeenIp,
        lastVersion: watcher.lastVersion,
        groups: watcher.groups.map((group) => ({
          id: group.id,
          name: group.name,
          externalId: group.externalId,
          source: group.source,
          isEnabled: group.isEnabled,
        })),
      })),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
