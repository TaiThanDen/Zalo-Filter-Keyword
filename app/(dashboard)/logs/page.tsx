import Link from "next/link";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { getLogDetail, listLogs } from "@/src/modules/logs/logs.service";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; search?: string; decision?: string; page?: string }>;
}) {
  const params = await searchParams;
  const logs = await listLogs({
    page: params.page ? Number(params.page) : 1,
    pageSize: 50,
    search: params.search,
    decision: params.decision as
      | "MATCHED"
      | "REJECTED_NO_INCLUDE"
      | "REJECTED_BY_EXCLUDE"
      | "REJECTED_GROUP_DISABLED"
      | "REJECTED_DUPLICATE"
      | "REJECTED_UNKNOWN_GROUP"
      | undefined,
  });
  const detail = params.id ? await getLogDetail(params.id) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="space-y-4">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight">Logs</h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
            Review inbound_message records, match_log decisions, normalized text, reason, and notification_delivery state.
          </p>
        </div>

        <form className="card grid gap-3 rounded-[1.6rem] p-5 md:grid-cols-[1fr_auto_auto]">
          <input className="field" name="search" defaultValue={params.search ?? ""} placeholder="Search message or sender" />
          <select className="field" name="decision" defaultValue={params.decision ?? ""}>
            <option value="">All decisions</option>
            <option value="MATCHED">MATCHED</option>
            <option value="REJECTED_NO_INCLUDE">REJECTED_NO_INCLUDE</option>
            <option value="REJECTED_BY_EXCLUDE">REJECTED_BY_EXCLUDE</option>
            <option value="REJECTED_GROUP_DISABLED">REJECTED_GROUP_DISABLED</option>
            <option value="REJECTED_DUPLICATE">REJECTED_DUPLICATE</option>
            <option value="REJECTED_UNKNOWN_GROUP">REJECTED_UNKNOWN_GROUP</option>
          </select>
          <button type="submit" className="btn btn-secondary">Filter</button>
        </form>

        <section className="panel rounded-[1.6rem] p-4">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Group</th>
                  <th>Sender</th>
                  <th>Decision</th>
                  <th>Deliveries</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-[var(--color-muted)]">No logs yet.</td>
                  </tr>
                ) : (
                  logs.items.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.messageTime).toLocaleString()}</td>
                      <td>
                        <div className="space-y-1">
                          <div className="font-semibold">{log.groupName}</div>
                          <div className="text-sm text-[var(--color-muted)] line-clamp-2">{log.messageText}</div>
                        </div>
                      </td>
                      <td>{log.senderName}</td>
                      <td><StatusBadge value={log.decision} /></td>
                      <td><StatusBadge value={log.notificationStatus} /></td>
                      <td>
                        <Link className="btn btn-secondary" href={`/logs?id=${log.id}`}>View</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside className="card rounded-[1.6rem] p-6">
        <h3 className="text-lg font-semibold">Log detail</h3>
        {!detail ? (
          <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">Select a log to inspect raw payload, fingerprint, matched rules, and delivery attempts.</p>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Decision</div>
              <div className="mt-1"><StatusBadge value={detail.decision} /></div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Reason</div>
              <div className="mt-1">{detail.reason ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Normalized Text</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{detail.inboundMessage.normalizedText}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Fingerprint</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{detail.inboundMessage.fingerprint}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Matched Include</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.matchedIncludeRules, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Matched Exclude</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.matchedExcludeRules, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Raw Payload</div>
              <pre className="mt-1 max-h-64 overflow-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.inboundMessage.rawPayload, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Notification Deliveries</div>
              <pre className="mt-1 max-h-64 overflow-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.notificationDeliveries, null, 2)}</pre>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
