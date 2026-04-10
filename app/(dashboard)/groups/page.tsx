import { listWatchers } from "@/src/modules/watchers/watchers.service";
import { listRules } from "@/src/modules/rules/rules.service";
import { listGroups } from "@/src/modules/groups/groups.service";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { JsonActionForm } from "@/src/components/forms/json-action-form";

export default async function GroupsPage() {
  const [groupsData, rules, watchers] = await Promise.all([
    listGroups({ page: 1, pageSize: 100 }),
    listRules({}),
    listWatchers(),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Nhóm</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Tạo nhóm theo dõi, bật hoặc tắt từng nhóm, gán watcher và gắn các luật include hoặc exclude cho đúng nguồn tin cần lọc.
        </p>
      </section>

      <section className="card grid gap-4 rounded-[1.6rem] p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h3 className="text-lg font-semibold">Tạo nhóm mới</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Canonical domain vẫn là group trong UI, API và schema, nhưng nhãn hiển thị đã được Việt hóa.</p>
        </div>
        <JsonActionForm
          endpoint="/api/groups"
          method="POST"
          successMessage="Tạo nhóm thành công"
          errorMessage="Không thể tạo nhóm"
          className="grid gap-3"
          booleanFields={["isEnabled"]}
          nullIfEmptyFields={["watcherId"]}
          resetOnSuccess
        >
          <input type="hidden" name="source" value="zalo" />
          <input className="field" name="name" placeholder="Cộng đồng PG PB SUP HCM" required />
          <input className="field" name="externalId" placeholder="g3551797143992062788" required />
          <select className="field" name="watcherId" defaultValue="">
            <option value="">Chưa gán watcher</option>
            {watchers.map((watcher) => (
              <option key={watcher.id} value={watcher.id}>
                {watcher.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="isEnabled" defaultChecked /> Bật nhóm
          </label>
          <button type="submit" className="btn btn-primary">Tạo nhóm</button>
        </JsonActionForm>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Nhóm</th>
                <th>Nguồn</th>
                <th>External ID</th>
                <th>Trạng thái</th>
                <th>Watcher</th>
                <th>Luật</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {groupsData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    Chưa có nhóm nào được cấu hình.
                  </td>
                </tr>
              ) : (
                groupsData.items.map((group) => {
                  const selectedRuleIds = new Set(group.groupRules.map((item) => item.ruleId));

                  return (
                    <tr key={group.id}>
                      <td data-label="Nhóm">
                        <JsonActionForm
                          endpoint={`/api/groups/${group.id}`}
                          method="PATCH"
                          successMessage="Cập nhật nhóm thành công"
                          errorMessage="Không thể cập nhật nhóm"
                          className="grid gap-2"
                          booleanFields={["isEnabled"]}
                          nullIfEmptyFields={["watcherId"]}
                        >
                          <input className="field" name="name" defaultValue={group.name} />
                          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                            <input type="checkbox" name="isEnabled" defaultChecked={group.isEnabled} /> Bật nhóm
                          </label>
                          <select className="field" name="watcherId" defaultValue={group.watcherId ?? ""}>
                            <option value="">Chưa gán watcher</option>
                            {watchers.map((watcher) => (
                              <option key={watcher.id} value={watcher.id}>
                                {watcher.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn btn-secondary">Lưu nhóm</button>
                        </JsonActionForm>
                      </td>
                      <td data-label="Nguồn">{group.source}</td>
                      <td data-label="External ID"><code>{group.externalId}</code></td>
                      <td data-label="Trạng thái"><StatusBadge value={group.isEnabled ? "enabled" : "disabled"} /></td>
                      <td data-label="Watcher">{group.watcher?.name ?? "Chưa gán"}</td>
                      <td data-label="Luật">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                              Đang gán trong database
                            </p>
                            {group.groupRules.length === 0 ? (
                              <p className="text-sm leading-6 text-[var(--color-muted)]">
                                Chưa có luật nào được lưu cho nhóm này.
                              </p>
                            ) : (
                              <div className="rule-chip-list">
                                {group.groupRules.map((item) => (
                                  <span key={item.ruleId} className="rule-chip">
                                    [{item.rule.type}] {item.rule.pattern}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <JsonActionForm
                            endpoint={`/api/groups/${group.id}/rules`}
                            method="POST"
                            successMessage="Lưu luật cho nhóm thành công"
                            errorMessage="Không thể lưu luật cho nhóm"
                            className="grid gap-3"
                            arrayFields={["ruleIds"]}
                          >
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                Chọn luật để gán
                              </p>
                              <div className="rule-checklist">
                                {rules.map((rule) => (
                                  <label key={rule.id} className="rule-checklist-item">
                                    <input
                                      type="checkbox"
                                      name="ruleIds"
                                      value={rule.id}
                                      defaultChecked={selectedRuleIds.has(rule.id)}
                                    />
                                    <span>
                                      [{rule.type}] {rule.pattern}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <button type="submit" className="btn btn-secondary">Lưu luật</button>
                          </JsonActionForm>
                        </div>
                      </td>
                      <td data-label="Thao tác">
                        <JsonActionForm
                          endpoint={`/api/groups/${group.id}`}
                          method="DELETE"
                          successMessage="Xóa nhóm thành công"
                          errorMessage="Không thể xóa nhóm"
                        >
                          <button type="submit" className="btn btn-secondary">Xóa</button>
                        </JsonActionForm>
                      </td>
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
