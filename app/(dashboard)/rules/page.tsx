import { revalidatePath } from "next/cache";
import { createRule, deleteRule, listRules, updateRule } from "@/src/modules/rules/rules.service";
import { StatusBadge } from "@/src/components/ui/status-badge";

export default async function RulesPage() {
  const rules = await listRules({});

  async function createRuleAction(formData: FormData) {
    "use server";
    await createRule({
      type: String(formData.get("type")) as "INCLUDE" | "EXCLUDE",
      pattern: String(formData.get("pattern") || ""),
      matchType: String(formData.get("matchType") || "CONTAINS") as "CONTAINS" | "WHOLE_WORD",
      caseSensitive: formData.get("caseSensitive") === "on",
      isActive: formData.get("isActive") === "on",
      note: formData.get("note") ? String(formData.get("note")) : null,
    });
    revalidatePath("/rules");
    revalidatePath("/dashboard");
  }

  async function updateRuleAction(formData: FormData) {
    "use server";
    await updateRule(String(formData.get("id")), {
      pattern: String(formData.get("pattern") || ""),
      matchType: String(formData.get("matchType") || "CONTAINS") as "CONTAINS" | "WHOLE_WORD",
      caseSensitive: formData.get("caseSensitive") === "on",
      isActive: formData.get("isActive") === "on",
      note: formData.get("note") ? String(formData.get("note")) : null,
    });
    revalidatePath("/rules");
    revalidatePath("/dashboard");
  }

  async function deleteRuleAction(formData: FormData) {
    "use server";
    await deleteRule(String(formData.get("id")));
    revalidatePath("/rules");
    revalidatePath("/dashboard");
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">Rules</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Tune include and exclude rules with `CONTAINS` or `WHOLE_WORD` matching, then map them to groups.
        </p>
      </section>

      <section className="card rounded-[1.6rem] p-6">
        <h3 className="text-lg font-semibold">Create rule</h3>
        <form action={createRuleAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select className="field" name="type" defaultValue="INCLUDE">
            <option value="INCLUDE">Include</option>
            <option value="EXCLUDE">Exclude</option>
          </select>
          <input className="field" name="pattern" placeholder="PB" required />
          <select className="field" name="matchType" defaultValue="CONTAINS">
            <option value="CONTAINS">Contains</option>
            <option value="WHOLE_WORD">Whole word</option>
          </select>
          <input className="field" name="note" placeholder="Optional note" />
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="caseSensitive" /> Case sensitive
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="isActive" defaultChecked /> Active
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" className="btn btn-primary">Create Rule</button>
          </div>
        </form>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Pattern</th>
                <th>Match Type</th>
                <th>Flags</th>
                <th>Note</th>
                <th>Mapped Groups</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    No rules configured yet.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td><StatusBadge value={rule.type} /></td>
                    <td>
                      <form action={updateRuleAction} className="grid gap-2">
                        <input type="hidden" name="id" value={rule.id} />
                        <input className="field" name="pattern" defaultValue={rule.pattern} />
                        <select className="field" name="matchType" defaultValue={rule.matchType}>
                          <option value="CONTAINS">Contains</option>
                          <option value="WHOLE_WORD">Whole word</option>
                        </select>
                        <input className="field" name="note" defaultValue={rule.note ?? ""} placeholder="Optional note" />
                        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                          <input type="checkbox" name="caseSensitive" defaultChecked={rule.caseSensitive} /> Case sensitive
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                          <input type="checkbox" name="isActive" defaultChecked={rule.isActive} /> Active
                        </label>
                        <button type="submit" className="btn btn-secondary">Save Rule</button>
                      </form>
                    </td>
                    <td>{rule.matchType}</td>
                    <td>{rule.caseSensitive ? "case-sensitive" : "case-insensitive"}</td>
                    <td>{rule.note ?? "-"}</td>
                    <td>{rule.groupRules.length}</td>
                    <td>
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
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
