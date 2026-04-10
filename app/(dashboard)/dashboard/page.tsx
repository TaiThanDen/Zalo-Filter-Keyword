import Link from "next/link";
import { getDashboardStats } from "@/src/modules/logs/logs.service";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    { label: "Nhóm", value: stats.totalGroups, helper: `${stats.enabledGroups} nhóm đang bật` },
    { label: "Luật đang dùng", value: stats.activeRules, helper: "include + exclude" },
    { label: "Lượt khớp 24h", value: stats.matches24h, helper: "message khớp trong 24 giờ gần nhất" },
    { label: "Watcher online", value: stats.watchersOnline, helper: "dựa trên heartbeat" },
    { label: "Gửi lỗi", value: stats.failedDeliveries, helper: "notification_delivery đang lỗi" },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <span className="inline-flex rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Tổng quan
        </span>
        <h2 className="text-3xl font-semibold tracking-tight">Ảnh chụp vận hành</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          Màn hình này cho bạn biết nhanh số nhóm đang theo dõi, độ phủ của luật, lượt khớp gần đây, tình trạng watcher và lỗi gửi thông báo.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="card rounded-[1.6rem] p-5">
            <p className="text-sm font-semibold text-[var(--color-muted)]">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-3 text-sm text-[var(--color-muted)]">{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Link href="/groups" className="card rounded-[1.6rem] p-5 transition hover:-translate-y-0.5">
          <h3 className="text-lg font-semibold">Quản lý nhóm</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Tạo nhóm theo dõi, bật hoặc tắt nhóm, và gán watcher phụ trách từng nhóm.
          </p>
        </Link>
        <Link href="/rules" className="card rounded-[1.6rem] p-5 transition hover:-translate-y-0.5">
          <h3 className="text-lg font-semibold">Tinh chỉnh luật</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Cấu hình include hoặc exclude, kiểu so khớp, phân biệt hoa thường và ghi chú quản trị.
          </p>
        </Link>
        <Link href="/logs" className="card rounded-[1.6rem] p-5 transition hover:-translate-y-0.5">
          <h3 className="text-lg font-semibold">Xem nhật ký</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Xem inbound_message, quyết định match_log, payload gốc và trạng thái gửi thông báo.
          </p>
        </Link>
      </section>
    </div>
  );
}
