import { StatusBadge } from "@/src/components/ui/status-badge";
import { listWatchers } from "@/src/modules/watchers/watchers.service";
import { JsonActionForm } from "@/src/components/forms/json-action-form";
import { formatClockTime, WATCHER_SLEEP_TIMEZONE } from "@/src/modules/watchers/watcher-schedule";

export default async function WatchersPage() {
  const watchers = await listWatchers();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Watcher</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Theo dõi trạng thái runtime và cấu hình giờ nghỉ. Trong giờ nghỉ, watcher giữ phiên Zalo nhưng không đọc,
          không lưu và không gửi bù tin nhắn.
        </p>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Watcher</th>
                <th>Trạng thái</th>
                <th>Heartbeat</th>
                <th>Phiên bản</th>
                <th>Số nhóm</th>
                <th>Lịch nghỉ</th>
              </tr>
            </thead>
            <tbody>
              {watchers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-[var(--color-muted)]">Chưa có watcher nào được seed.</td>
                </tr>
              ) : (
                watchers.map((watcher) => (
                  <tr key={watcher.id}>
                    <td data-label="Watcher">
                      <div className="font-semibold">{watcher.name}</div>
                      <div className="mt-1 text-sm text-[var(--color-muted)]"><code>{watcher.id}</code></div>
                    </td>
                    <td data-label="Trạng thái"><StatusBadge value={watcher.status} /></td>
                    <td data-label="Heartbeat">
                      {watcher.lastHeartbeatAt
                        ? new Date(watcher.lastHeartbeatAt).toLocaleString("vi-VN", { timeZone: WATCHER_SLEEP_TIMEZONE })
                        : "Chưa có"}
                    </td>
                    <td data-label="Phiên bản">{watcher.lastVersion ?? "-"}</td>
                    <td data-label="Số nhóm">{watcher.groups.length}</td>
                    <td data-label="Lịch nghỉ">
                      <JsonActionForm
                        endpoint={`/api/watchers/${watcher.id}/schedule`}
                        method="PATCH"
                        successMessage="Đã cập nhật lịch nghỉ watcher"
                        errorMessage="Không thể cập nhật lịch nghỉ"
                        className="grid min-w-56 gap-2"
                        booleanFields={["sleepEnabled"]}
                      >
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
                          <input type="checkbox" name="sleepEnabled" defaultChecked={watcher.sleepSchedule.enabled} />
                          Bật lịch nghỉ
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                            Bắt đầu
                            <input className="field" type="time" name="sleepStart" defaultValue={formatClockTime(watcher.sleepSchedule.startMinute)} required />
                          </label>
                          <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                            Kết thúc
                            <input className="field" type="time" name="sleepEnd" defaultValue={formatClockTime(watcher.sleepSchedule.endMinute)} required />
                          </label>
                        </div>
                        <input type="hidden" name="sleepTimezone" value={WATCHER_SLEEP_TIMEZONE} />
                        <p className="text-xs leading-5 text-[var(--color-muted)]">Múi giờ: Hồ Chí Minh (UTC+7)</p>
                        <button type="submit" className="btn btn-secondary">Lưu lịch nghỉ</button>
                      </JsonActionForm>
                    </td>
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
