import Link from "next/link";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { getLogDetail, listLogs } from "@/src/modules/logs/logs.service";

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("vi-VN");
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

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
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Nhật ký</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
              Theo dõi inbound_message, quyết định match_log, luật đã khớp và trạng thái notification_delivery trong một giao diện dễ đọc hơn trên cả desktop lẫn mobile.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card rounded-[1.4rem] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Tổng log</div>
              <div className="mt-2 text-2xl font-semibold">{logs.pagination.total}</div>
            </div>
            <div className="card rounded-[1.4rem] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Đang xem</div>
              <div className="mt-2 text-2xl font-semibold">{logs.items.length}</div>
            </div>
            <div className="card rounded-[1.4rem] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Chi tiết</div>
              <div className="mt-2 text-sm font-medium text-[var(--color-muted)]">
                {detail ? `Đang mở ${detail.id.slice(0, 8)}` : "Chưa chọn log"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <form className="card grid gap-3 rounded-[1.8rem] p-5 md:grid-cols-[minmax(0,1fr)_15rem_auto] md:p-6">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">Tìm kiếm</span>
          <input className="field" name="search" defaultValue={params.search ?? ""} placeholder="Nội dung, người gửi hoặc tên nhóm" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">Quyết định</span>
          <select className="field" name="decision" defaultValue={params.decision ?? ""}>
            <option value="">Tất cả quyết định</option>
            <option value="MATCHED">Khớp</option>
            <option value="REJECTED_NO_INCLUDE">Không trúng include</option>
            <option value="REJECTED_BY_EXCLUDE">Bị exclude</option>
            <option value="REJECTED_GROUP_DISABLED">Nhóm đang tắt</option>
            <option value="REJECTED_DUPLICATE">Trùng lặp</option>
            <option value="REJECTED_UNKNOWN_GROUP">Nhóm chưa cấu hình</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-secondary md:min-w-32">Lọc</button>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-start">
        <section className="space-y-4">
          {logs.items.length === 0 ? (
            <section className="panel rounded-[1.8rem] p-10 text-center text-sm text-[var(--color-muted)]">
              Chưa có nhật ký nào.
            </section>
          ) : (
            logs.items.map((log) => {
              const isSelected = detail?.id === log.id;

              return (
                <article
                  key={log.id}
                  className={`panel rounded-[1.8rem] p-5 transition ${
                    isSelected
                      ? "border-[var(--color-accent)] shadow-[0_18px_38px_rgba(162,74,36,0.12)]"
                      : "hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(17,24,39,0.08)]"
                  }`}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={log.decision} />
                          <StatusBadge value={log.notificationStatus} />
                          <span className="status-pill" style={{ background: 'rgba(95, 78, 58, 0.08)', color: 'var(--color-muted)' }}>
                            {formatDateTime(log.messageTime)}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold leading-7">{log.groupName}</h3>
                          <p className="text-sm text-[var(--color-muted)]">Người gửi: {log.senderName}</p>
                        </div>
                      </div>

                      <Link
                        className={`btn ${isSelected ? "btn-primary" : "btn-secondary"} lg:min-w-32`}
                        href={`/logs?id=${log.id}${params.search ? `&search=${encodeURIComponent(params.search)}` : ""}${params.decision ? `&decision=${encodeURIComponent(params.decision)}` : ""}`}
                      >
                        {isSelected ? "Đang xem" : "Xem chi tiết"}
                      </Link>
                    </div>

                    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-accent-soft)_20%,white)] p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Nội dung tin nhắn</div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text)]">
                        {log.messageText}
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-white/75 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Lý do</div>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{log.reason ?? "-"}</p>
                      </div>
                      <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-white/75 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật include khớp</div>
                        <div className="mt-2 rule-chip-list">
                          {log.matchedIncludeRules.length > 0 ? (
                            log.matchedIncludeRules.map((rule) => <span key={`${log.id}-include-${rule}`} className="rule-chip">{rule}</span>)
                          ) : (
                            <span className="text-sm text-[var(--color-muted)]">Không có</span>
                          )}
                        </div>
                        {log.matchedExcludeRules.length > 0 ? (
                          <>
                            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật exclude khớp</div>
                            <div className="mt-2 rule-chip-list">
                              {log.matchedExcludeRules.map((rule) => <span key={`${log.id}-exclude-${rule}`} className="rule-chip">{rule}</span>)}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="card rounded-[1.8rem] p-5 sm:p-6 xl:sticky xl:top-6">
          <div className="flex flex-col gap-2 border-b border-[color:color-mix(in_srgb,var(--color-border)_72%,white)] pb-4">
            <h3 className="text-lg font-semibold">Chi tiết nhật ký</h3>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              {detail
                ? "Xem fingerprint, normalized text, payload gốc và trạng thái gửi thông báo của log đang chọn."
                : "Chọn một log để xem fingerprint, payload gốc và lịch sử gửi thông báo."}
            </p>
          </div>

          {!detail ? (
            <div className="py-8 text-sm leading-6 text-[var(--color-muted)]">
              Chưa có log nào được chọn.
            </div>
          ) : (
            <div className="mt-5 space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-white/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Quyết định</div>
                  <div className="mt-2"><StatusBadge value={detail.decision} /></div>
                </div>
                <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-white/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Notification</div>
                  <div className="mt-2">
                    <StatusBadge value={detail.notificationDeliveries.length > 0 ? detail.notificationDeliveries[0].status : "none"} />
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-accent-soft)_20%,white)] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Nhóm</div>
                    <div className="mt-2 font-medium text-[var(--color-text)]">{detail.inboundMessage.group?.name || detail.inboundMessage.groupName || detail.inboundMessage.groupExternalId}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Người gửi</div>
                    <div className="mt-2 font-medium text-[var(--color-text)]">{detail.inboundMessage.senderName || detail.inboundMessage.senderExternalId || "Unknown sender"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Thời gian message</div>
                    <div className="mt-2 font-medium text-[var(--color-text)]">{formatDateTime(detail.inboundMessage.messageTime)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Lý do</div>
                    <div className="mt-2 font-medium text-[var(--color-text)]">{detail.reason ?? "-"}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Normalized text</div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-stone-100 p-3 text-xs leading-6">{detail.inboundMessage.normalizedText}</pre>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Fingerprint</div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-stone-100 p-3 text-xs leading-6">{detail.inboundMessage.fingerprint}</pre>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật include đã khớp</div>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-2xl bg-stone-100 p-3 text-xs leading-6">{prettyJson(detail.matchedIncludeRules)}</pre>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Luật exclude đã khớp</div>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-2xl bg-stone-100 p-3 text-xs leading-6">{prettyJson(detail.matchedExcludeRules)}</pre>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Payload gốc</div>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-stone-100 p-3 text-xs leading-6">{prettyJson(detail.inboundMessage.rawPayload)}</pre>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Notification deliveries</div>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-stone-100 p-3 text-xs leading-6">{prettyJson(detail.notificationDeliveries)}</pre>
                </section>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
