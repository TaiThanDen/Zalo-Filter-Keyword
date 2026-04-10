import { StatusBadge } from "@/src/components/ui/status-badge";
import { listWatchers } from "@/src/modules/watchers/watchers.service";

export default async function WatchersPage() {
  const watchers = await listWatchers();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Watchers</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Inspect watcher status, version, heartbeat freshness, and the groups assigned to each runtime.
        </p>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Watcher</th>
                <th>Status</th>
                <th>Heartbeat</th>
                <th>Version</th>
                <th>Groups</th>
              </tr>
            </thead>
            <tbody>
              {watchers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-[var(--color-muted)]">No watchers seeded yet.</td>
                </tr>
              ) : (
                watchers.map((watcher) => (
                  <tr key={watcher.id}>
                    <td>
                      <div className="font-semibold">{watcher.name}</div>
                      <div className="mt-1 text-sm text-[var(--color-muted)]"><code>{watcher.id}</code></div>
                    </td>
                    <td><StatusBadge value={watcher.status} /></td>
                    <td>{watcher.lastHeartbeatAt ? new Date(watcher.lastHeartbeatAt).toLocaleString() : "Never"}</td>
                    <td>{watcher.lastVersion ?? "-"}</td>
                    <td>{watcher.groups.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
