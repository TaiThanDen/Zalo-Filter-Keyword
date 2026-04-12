import { listNotificationChannels } from '@/src/modules/notifications/notifications.service';
import { listRules } from '@/src/modules/rules/rules.service';
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

function RuleSelector(props: {
  rules: Array<{
    id: string;
    pattern: string;
    isActive: boolean;
    note: string | null;
  }>;
  selectedRuleIds?: string[];
  description: string;
}) {
  const selectedRuleIds = new Set(props.selectedRuleIds ?? []);

  return (
    <div className="space-y-3 lg:col-span-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-[var(--color-muted)]">Rule muốn nhận</div>
        <p className="text-sm leading-6 text-[var(--color-muted)]">{props.description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {props.rules.map((rule) => (
          <label
            key={rule.id}
            className="flex min-h-16 items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-white/75 px-4 py-3 text-sm"
          >
            <input type="checkbox" name="ruleIds" value={rule.id} defaultChecked={selectedRuleIds.has(rule.id)} className="mt-1" />
            <span className="space-y-1">
              <span className="flex flex-wrap items-center gap-2 font-medium text-[var(--color-text)]">
                <span>{rule.pattern}</span>
                <span className="status-pill" style={{ background: rule.isActive ? 'rgba(84, 133, 117, 0.12)' : 'rgba(95, 78, 58, 0.08)', color: 'var(--color-muted)' }}>
                  {rule.isActive ? 'đang bật' : 'đang tắt'}
                </span>
              </span>
              <span className="block text-xs leading-5 text-[var(--color-muted)]">
                {rule.note?.trim() || 'Không chọn gì nghĩa là kênh này sẽ nhận tất cả rule.'}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default async function ChannelsPage() {
  const [channels, rules] = await Promise.all([
    listNotificationChannels(),
    listRules({ type: 'INCLUDE' }),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Kênh thông báo</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Cấu hình kênh Telegram để worker gửi cảnh báo. Mỗi kênh có thể chọn riêng các rule muốn nhận, còn nếu để trống thì mặc định nhận tất cả rule đang match.
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
            <div>Nếu không chọn rule nào: nhận tất cả</div>
          </div>
        </div>

        <JsonActionForm
          endpoint="/api/channels"
          method="POST"
          successMessage="Tạo kênh thông báo thành công"
          errorMessage="Không thể tạo kênh thông báo"
          className="grid gap-3 lg:grid-cols-2"
          booleanFields={["isActive"]}
          arrayFields={["ruleIds"]}
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
          <RuleSelector
            rules={rules}
            description="Chọn các rule mà kênh này muốn nhận. Nếu để trống, kênh sẽ nhận mọi alert match rule."
          />
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
            const assignedRules = channel.notificationChannelRules.map((channelRule) => channelRule.rule);
            const assignedRuleIds = assignedRules.map((rule) => rule.id);

            return (
              <section key={channel.id} className="panel rounded-[1.8rem] p-5 sm:p-6">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
                      arrayFields={["ruleIds"]}
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
                      <RuleSelector
                        rules={rules}
                        selectedRuleIds={assignedRuleIds}
                        description="Bỏ chọn hết nếu muốn kênh này nhận tất cả alert. Chỉ các rule match mới được gửi đến kênh đã chọn."
                      />
                      <label className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/75 px-4 text-sm font-medium text-[var(--color-muted)] lg:col-span-2">
                        <input type="checkbox" name="isActive" defaultChecked={channel.isActive} /> Kích hoạt kênh này
                      </label>
                      <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          Chỉnh sửa token, chat ID, trạng thái hoặc danh sách rule rồi lưu để worker dùng ngay ở lượt gửi tiếp theo.
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
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em]">Rule đang nhận</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignedRules.length === 0 ? (
                            <span className="status-pill" style={{ background: 'rgba(84, 133, 117, 0.12)', color: 'var(--color-text)' }}>
                              Tất cả rule
                            </span>
                          ) : (
                            assignedRules.map((rule) => (
                              <span key={rule.id} className="status-pill" style={{ background: 'rgba(95, 78, 58, 0.08)', color: 'var(--color-text)' }}>
                                {rule.pattern}
                              </span>
                            ))
                          )}
                        </div>
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
