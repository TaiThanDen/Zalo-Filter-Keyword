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
        <h2 className="text-3xl font-semibold tracking-tight">Luật lọc</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Cấu hình các luật include và exclude với kiểu so khớp Contains hoặc Whole word, sau đó gắn luật vào từng nhóm cần theo dõi.
        </p>
      </section>

      <section className="card rounded-[1.6rem] p-6">
        <h3 className="text-lg font-semibold">Tạo luật mới</h3>
        <form action={createRuleAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 ">
          <select className="field" name="type" defaultValue="INCLUDE">
            <option value="INCLUDE">Bao gồm</option>
            <option value="EXCLUDE">Loại trừ</option>
          </select>
          <input className="field" name="pattern" placeholder="TUYỂN" required />
          <select className="field" name="matchType" defaultValue="CONTAINS">
            <option value="CONTAINS">Contains</option>
            <option value="WHOLE_WORD">Whole word</option>
          </select>
          <input className="field" name="note" placeholder="Ghi chú tùy chọn" />
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="caseSensitive" /> Phân biệt hoa thường
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" name="isActive" defaultChecked /> Kích hoạt
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" className="btn btn-primary">Tạo luật</button>
          </div>
        </form>
      </section>

      <section className="panel rounded-[1.6rem] p-4">
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Loại</th>
                <th>Mẫu so khớp</th>
                <th>Kiểu match</th>
                <th>Cờ</th>
                <th>Ghi chú</th>
                <th>Số nhóm gắn</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--color-muted)]">
                    Chưa có luật nào được cấu hình.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td data-label="Loại"><StatusBadge value={rule.type} /></td>
                    <td data-label="Mẫu so khớp">
                      <form action={updateRuleAction} className="grid gap-2 ">
                        <input type="hidden" name="id" value={rule.id} />
                        <input className="field" name="pattern" defaultValue={rule.pattern} />
                        <select className="field" name="matchType" defaultValue={rule.matchType}>
                          <option value="CONTAINS">Contains</option>
                          <option value="WHOLE_WORD">Whole word</option>
                        </select>
                        <input className="field" name="note" defaultValue={rule.note ?? ""} placeholder="Ghi chú tùy chọn" />
                        <label className="inline-flex items-center  gap-2 text-sm text-[var(--color-muted)]">
                          <input type="checkbox" name="caseSensitive" defaultChecked={rule.caseSensitive} /> Phân biệt hoa thường
                        </label>
                        <label className="inline-flex items-center gap-2  text-sm text-[var(--color-muted)]">
                          <input type="checkbox" name="isActive" defaultChecked={rule.isActive} /> Kích hoạt
                        </label>
                        <button type="submit" className="btn btn-secondary">Lưu luật</button>
                      </form>
                    </td>
                    <td data-label="Kiểu match">{rule.matchType === "CONTAINS" ? "Contains" : "Whole word"}</td>
                    <td data-label="Cờ">{rule.caseSensitive ? "Phân biệt hoa thường" : "Không phân biệt hoa thường"}</td>
                    <td data-label="Ghi chú">{rule.note ?? "-"}</td>
                    <td data-label="Số nhóm gắn">{rule.groupRules.length}</td>
                    <td data-label="Thao tác">
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button type="submit" className="btn btn-secondary">Xóa</button>
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
