import { revalidatePath } from "next/cache";
import { listWatchers } from "@/src/modules/watchers/watchers.service";
import { listRules } from "@/src/modules/rules/rules.service";
import { createGroup, deleteGroup, listGroups, replaceGroupRules, updateGroup } from "@/src/modules/groups/groups.service";
import { StatusBadge } from "@/src/components/ui/status-badge";

function formDataToRuleIds(formData: FormData) {
  return formData
    .getAll("ruleIds")
    .map((value) => String(value))
    .filter(Boolean);
}

export default async function GroupsPage() {
  const [groupsData, rules, watchers] = await Promise.all([
    listGroups({ page: 1, pageSize: 100 }),
    listRules({}),
    listWatchers(),
  ]);

  async function createGroupAction(formData: FormData) {
    "use server";
    await createGroup({
      source: String(formData.get("source") || "zalo"),
      externalId: String(formData.get("externalId") || ""),
      name: String(formData.get("name") || ""),
      isEnabled: formData.get("isEnabled") === "on",
      watcherId: formData.get("watcherId") ? String(formData.get("watcherId")) : null,
    });
    revalidatePath("/groups");
    revalidatePath("/dashboard");
  }

  async function updateGroupAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    await updateGroup(id, {
      name: String(formData.get("name") || ""),
      isEnabled: formData.get("isEnabled") === "on",
      watcherId: formData.get("watcherId") ? String(formData.get("watcherId")) : null,
    });
    revalidatePath("/groups");
    revalidatePath("/dashboard");
  }

  async function deleteGroupAction(formData: FormData) {
    "use server";
    await deleteGroup(String(formData.get("id")));
    revalidatePath("/groups");
    revalidatePath("/dashboard");
  }

  async function replaceRulesAction(formData: FormData) {
    "use server";
    await replaceGroupRules(String(formData.get("groupId")), formDataToRuleIds(formData));
    revalidatePath("/groups");
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Groups</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Create monitored groups, toggle them on or off, assign watchers, and map include/exclude rules.
        </p>
      </section>

      <section className="card grid gap-4 rounded-[1.6rem] p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h3 className="text-lg font-semibold">Create group</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Canonical domain stays as group across UI, API, and schema.</p>
        </div>
        <form action={createGroupAction} className="grid gap-3">
          <input type="hidden" name="source" value="zalo" />
          <input className="field" name="name" placeholder="Sales Group" required />
          <input className="field" name="externalId" placeholder="123456" required />
          <select className="field" name="watcherId" defaultValue="">
            <option value="">Unassigned</option>
            {watchers.map((watcher) => (
              <option key={watcher.id} value={watcher.id}>
                {watcher.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="isEnabled" defaultChecked /> Enabled
          </label>
          <button type="submit" className="btn btn-primary">Create Group</button>
        </form>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Source</th>
                <th>External ID</th>
                <th>Enabled</th>
                <th>Watcher</th>
                <th>Rules</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupsData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    No groups configured yet.
                  </td>
                </tr>
              ) : (
                groupsData.items.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <form action={updateGroupAction} className="grid gap-2">
                        <input type="hidden" name="id" value={group.id} />
                        <input className="field" name="name" defaultValue={group.name} />
                        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                          <input type="checkbox" name="isEnabled" defaultChecked={group.isEnabled} /> Enabled
                        </label>
                        <select className="field" name="watcherId" defaultValue={group.watcherId ?? ""}>
                          <option value="">Unassigned</option>
                          {watchers.map((watcher) => (
                            <option key={watcher.id} value={watcher.id}>
                              {watcher.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secondary">Save Group</button>
                      </form>
                    </td>
                    <td>{group.source}</td>
                    <td><code>{group.externalId}</code></td>
                    <td><StatusBadge value={group.isEnabled ? "enabled" : "disabled"} /></td>
                    <td>{group.watcher?.name ?? "Unassigned"}</td>
                    <td>
                      <form action={replaceRulesAction} className="grid gap-2">
                        <input type="hidden" name="groupId" value={group.id} />
                        <select className="field min-h-40" name="ruleIds" multiple defaultValue={group.groupRules.map((item) => item.ruleId)}>
                          {rules.map((rule) => (
                            <option key={rule.id} value={rule.id}>
                              [{rule.type}] {rule.pattern}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secondary">Save Rules</button>
                      </form>
                    </td>
                    <td>
                      <form action={deleteGroupAction}>
                        <input type="hidden" name="id" value={group.id} />
                        <button type="submit" className="btn btn-secondary">Delete</button>
                      </form>
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
