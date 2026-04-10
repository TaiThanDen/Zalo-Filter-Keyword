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
          <h2 className="text-3xl font-semibold tracking-tight">Nhật ký</h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
            Xem inbound_message, quyết định match_log, normalized text, lý do loại hoặc khớp, và trạng thái notification_delivery.
          </p>
        </div>

        <form className="card grid gap-3 rounded-[1.6rem] p-5 md:grid-cols-[1fr_auto_auto]">
          <input className="field" name="search" defaultValue={params.search ?? ""} placeholder="Tìm theo nội dung, người gửi hoặc nhóm" />
          <select className="field" name="decision" defaultValue={params.decision ?? ""}>
            <option value="">Tất cả quyết định</option>
            <option value="MATCHED">Khớp</option>
            <option value="REJECTED_NO_INCLUDE">Không trúng include</option>
            <option value="REJECTED_BY_EXCLUDE">Bị exclude</option>
            <option value="REJECTED_GROUP_DISABLED">Nhóm đang tắt</option>
            <option value="REJECTED_DUPLICATE">Trùng lặp</option>
            <option value="REJECTED_UNKNOWN_GROUP">Nhóm chưa cấu hình</option>
          </select>
          <button type="submit" className="btn btn-secondary">Lọc</button>
        </form>

        <section className="panel rounded-[1.6rem] p-4">
          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Nhóm</th>
                  <th>Người gửi</th>
                  <th>Quyết định</th>
                  <th>Gửi thông báo</th>
                  <th>Mở</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-[var(--color-muted)]">Chưa có nhật ký nào.</td>
                  </tr>
                ) : (
                  logs.items.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Thời gian">{new Date(log.messageTime).toLocaleString("vi-VN")}</td>
                      <td data-label="Nhóm">
                        <div className="space-y-1">
                          <div className="font-semibold">{log.groupName}</div>
                          <div className="text-sm text-[var(--color-muted)] line-clamp-2">{log.messageText}</div>
                        </div>
                      </td>
                      <td data-label="Người gửi">{log.senderName}</td>
                      <td data-label="Quyết định"><StatusBadge value={log.decision} /></td>
                      <td data-label="Gửi thông báo"><StatusBadge value={log.notificationStatus} /></td>
                      <td data-label="Mở chi tiết">
                        <Link className="btn btn-secondary" href={`/logs?id=${log.id}`}>Xem</Link>
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
        <h3 className="text-lg font-semibold">Chi tiết nhật ký</h3>
        {!detail ? (
          <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">Chọn một log để xem payload gốc, fingerprint, luật đã khớp và lịch sử gửi thông báo.</p>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Quyết định</div>
              <div className="mt-1"><StatusBadge value={detail.decision} /></div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Lý do</div>
              <div className="mt-1">{detail.reason ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Normalized text</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{detail.inboundMessage.normalizedText}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Fingerprint</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{detail.inboundMessage.fingerprint}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật include đã khớp</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.matchedIncludeRules, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật exclude đã khớp</div>
              <pre className="mt-1 overflow-x-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.matchedExcludeRules, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Payload gốc</div>
              <pre className="mt-1 max-h-64 overflow-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.inboundMessage.rawPayload, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Notification deliveries</div>
              <pre className="mt-1 max-h-64 overflow-auto rounded-2xl bg-stone-100 p-3">{JSON.stringify(detail.notificationDeliveries, null, 2)}</pre>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
