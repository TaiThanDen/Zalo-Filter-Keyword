import { listNotificationChannels } from '@/src/modules/notifications/notifications.service';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { JsonActionForm } from '@/src/components/forms/json-action-form';

function maskToken(token?: string) {
  if (!token) {
    return 'chưa có';
  }

  if (token.length <= 12) {
    return token;
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export default async function ChannelsPage() {
  const channels = await listNotificationChannels();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Kênh thông báo</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Cấu hình kênh Telegram để worker gửi cảnh báo. Bạn có thể tạo mới, chỉnh sửa hoặc xóa từng kênh ngay trên trang này.
        </p>
      </section>

      <section className="card rounded-[1.8rem] p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Tạo kênh Telegram</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
              Kênh mới sẽ xuất hiện ngay trong danh sách và có thể bật hoặc tắt bất kỳ lúc nào.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm text-[var(--color-muted)]">
            <div>Loại hỗ trợ: Telegram</div>
            <div>Trạng thái mặc định: đang bật</div>
          </div>
        </div>

        <JsonActionForm
          endpoint="/api/channels"
          method="POST"
          successMessage="Tạo kênh thông báo thành công"
          errorMessage="Không thể tạo kênh thông báo"
          className="grid gap-3 lg:grid-cols-2"
          booleanFields={["isActive"]}
          resetOnSuccess
        >
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-muted)]">Tên kênh</span>
            <input className="field" name="name" placeholder="Telegram cảnh báo chính" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-muted)]">Bot token</span>
            <input className="field" name="botToken" placeholder="Bot token" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-muted)]">Chat ID</span>
            <input className="field" name="chatId" placeholder="Chat ID" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-muted)]">Parse mode</span>
            <select className="field" name="parseMode" defaultValue="HTML">
              <option value="HTML">HTML</option>
              <option value="MarkdownV2">MarkdownV2</option>
            </select>
          </label>
          <label className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/75 px-4 text-sm font-medium text-[var(--color-muted)] lg:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked /> Kích hoạt kênh ngay sau khi tạo
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="btn btn-primary">Tạo kênh</button>
          </div>
        </JsonActionForm>
      </section>

      <section className="space-y-4">
        {channels.length === 0 ? (
          <section className="panel rounded-[1.8rem] p-10 text-center text-sm text-[var(--color-muted)]">
            Chưa có kênh nào được cấu hình.
          </section>
        ) : (
          channels.map((channel) => {
            const config = channel.config as {
              botToken?: string;
              chatId?: string;
              parseMode?: string;
            };

            return (
              <section key={channel.id} className="panel rounded-[1.8rem] p-5 sm:p-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{channel.name}</h3>
                          <StatusBadge value={channel.isActive ? 'active' : 'inactive'} />
                          <span className="status-pill" style={{ background: 'rgba(95, 78, 58, 0.08)', color: 'var(--color-muted)' }}>
                            {channel.type}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-muted)]">
                          Cập nhật: {new Date(channel.updatedAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>

                    <JsonActionForm
                      endpoint={`/api/channels/${channel.id}`}
                      method="PATCH"
                      successMessage="Cập nhật kênh thông báo thành công"
                      errorMessage="Không thể cập nhật kênh thông báo"
                      className="grid gap-3 lg:grid-cols-2"
                      booleanFields={["isActive"]}
                    >
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-[var(--color-muted)]">Tên kênh</span>
                        <input className="field" name="name" defaultValue={channel.name} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-[var(--color-muted)]">Bot token</span>
                        <input className="field" name="botToken" defaultValue={config.botToken ?? ''} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-[var(--color-muted)]">Chat ID</span>
                        <input className="field" name="chatId" defaultValue={config.chatId ?? ''} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-[var(--color-muted)]">Parse mode</span>
                        <select className="field" name="parseMode" defaultValue={config.parseMode ?? 'HTML'}>
                          <option value="HTML">HTML</option>
                          <option value="MarkdownV2">MarkdownV2</option>
                        </select>
                      </label>
                      <label className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/75 px-4 text-sm font-medium text-[var(--color-muted)] lg:col-span-2">
                        <input type="checkbox" name="isActive" defaultChecked={channel.isActive} /> Kích hoạt kênh này
                      </label>
                      <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          Chỉnh sửa token, chat ID hoặc trạng thái rồi lưu để worker dùng ngay ở lượt gửi tiếp theo.
                        </p>
                        <button type="submit" className="btn btn-secondary sm:min-w-36">Lưu kênh</button>
                      </div>
                    </JsonActionForm>
                  </div>

                  <div className="flex h-full flex-col justify-between gap-4 rounded-[1.5rem] border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-accent-soft)_22%,white)] p-4 sm:p-5">
                    <div className="space-y-3 text-sm text-[var(--color-muted)]">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em]">Bot token</div>
                        <div className="mt-1 break-all font-medium text-[var(--color-text)]">{maskToken(config.botToken)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em]">Chat ID</div>
                        <div className="mt-1 break-all font-medium text-[var(--color-text)]">{config.chatId ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em]">Parse mode</div>
                        <div className="mt-1 font-medium text-[var(--color-text)]">{config.parseMode ?? 'HTML'}</div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[1.4rem] border border-[color:color-mix(in_srgb,var(--color-danger)_16%,white)] bg-white/80 p-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-danger)]">Xóa kênh thông báo</div>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                          Xóa khỏi danh sách gửi. Các lần gửi mới sẽ không dùng kênh này nữa.
                        </p>
                      </div>
                      <JsonActionForm
                        endpoint={`/api/channels/${channel.id}`}
                        method="DELETE"
                        successMessage="Xóa kênh thông báo thành công"
                        errorMessage="Không thể xóa kênh thông báo"
                        confirmMessage={`Xóa kênh \"${channel.name}\"? Thao tác này không thể hoàn tác.`}
                        className="w-full"
                      >
                        <button type="submit" className="btn btn-danger w-full">Xóa kênh</button>
                      </JsonActionForm>
                    </div>
                  </div>
                </div>
              </section>
            );
          })
        )}
      </section>
    </div>
  );
}
