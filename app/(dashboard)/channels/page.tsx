import { listNotificationChannels } from "@/src/modules/notifications/notifications.service";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { JsonActionForm } from "@/src/components/forms/json-action-form";

export default async function ChannelsPage() {
  const channels = await listNotificationChannels();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Kênh thông báo</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Cấu hình các notification_channel Telegram được worker dùng để gửi notification_delivery từ hàng đợi trong database.
        </p>
      </section>

      <section className="card rounded-[1.6rem] p-6">
        <h3 className="text-lg font-semibold">Tạo kênh Telegram</h3>
        <JsonActionForm
          endpoint="/api/channels"
          method="POST"
          successMessage="Tạo kênh thông báo thành công"
          errorMessage="Không thể tạo kênh thông báo"
          className="mt-4 grid gap-3 md:grid-cols-2"
          booleanFields={["isActive"]}
          resetOnSuccess
        >
          <input className="field" name="name" placeholder="Telegram cảnh báo chính" required />
          <input className="field" name="botToken" placeholder="Bot token" required />
          <input className="field" name="chatId" placeholder="Chat ID" required />
          <select className="field" name="parseMode" defaultValue="HTML">
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)] md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked /> Kích hoạt kênh
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn btn-primary">Tạo kênh</button>
          </div>
        </JsonActionForm>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th>Cấu hình</th>
                <th>Cập nhật lúc</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    Chưa có kênh nào được cấu hình.
                  </td>
                </tr>
              ) : (
                channels.map((channel) => {
                  const config = channel.config as {
                    botToken?: string;
                    chatId?: string;
                    parseMode?: string;
                  };

                  return (
                    <tr key={channel.id}>
                      <td data-label="Tên">
                        <JsonActionForm
                          endpoint={`/api/channels/${channel.id}`}
                          method="PATCH"
                          successMessage="Cập nhật kênh thông báo thành công"
                          errorMessage="Không thể cập nhật kênh thông báo"
                          className="grid gap-2"
                          booleanFields={["isActive"]}
                        >
                          <input className="field" name="name" defaultValue={channel.name} />
                          <input className="field" name="botToken" defaultValue={config.botToken ?? ""} />
                          <input className="field" name="chatId" defaultValue={config.chatId ?? ""} />
                          <select className="field" name="parseMode" defaultValue={config.parseMode ?? "HTML"}>
                            <option value="HTML">HTML</option>
                            <option value="MarkdownV2">MarkdownV2</option>
                          </select>
                          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                            <input type="checkbox" name="isActive" defaultChecked={channel.isActive} /> Kích hoạt
                          </label>
                          <button type="submit" className="btn btn-secondary">Lưu kênh</button>
                        </JsonActionForm>
                      </td>
                      <td data-label="Loại">{channel.type}</td>
                      <td data-label="Trạng thái"><StatusBadge value={channel.isActive ? "active" : "inactive"} /></td>
                      <td data-label="Cấu hình">
                        <div className="space-y-1 text-sm text-[var(--color-muted)]">
                          <div>Bot: {config.botToken ? "đã cấu hình" : "chưa có"}</div>
                          <div>Chat: {config.chatId ?? "-"}</div>
                          <div>Parse mode: {config.parseMode ?? "HTML"}</div>
                        </div>
                      </td>
                      <td data-label="Cập nhật lúc">{new Date(channel.updatedAt).toLocaleString("vi-VN")}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
