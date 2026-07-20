import Link from "next/link";
import { getDashboardStats } from "@/src/modules/logs/logs.service";
import { AppIcon, type AppIconName } from "@/src/components/ui/app-icon";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const cards = [
    { label: "Nhóm", value: stats.totalGroups, helper: `${stats.enabledGroups} nhóm đang bật`, icon: "groups" as AppIconName, tone: "purple" },
    { label: "Luật đang dùng", value: stats.activeRules, helper: "include + exclude", icon: "rules" as AppIconName, tone: "lime" },
    { label: "Alert 24h", value: stats.matches24h, helper: "outbox mới + match log cũ", icon: "channels" as AppIconName, tone: "pink" },
    { label: "Watcher online", value: stats.watchersOnline, helper: "dựa trên heartbeat", icon: "watcher" as AppIconName, tone: "lavender" },
    { label: "Gửi lỗi", value: stats.failedDeliveries, helper: "outbox hoặc delivery đang lỗi", icon: "alert" as AppIconName, tone: "lime" },
  ];
  const actions = [
    { href: "/groups", title: "Quản lý nhóm", copy: "Tạo nhóm theo dõi, bật hoặc tắt nhóm, và gán watcher phụ trách từng nhóm.", icon: "groups" as AppIconName, tone: "purple" },
    { href: "/rules", title: "Tinh chỉnh luật", copy: "Cấu hình include hoặc exclude, kiểu so khớp, phân biệt hoa thường và ghi chú quản trị.", icon: "rules" as AppIconName, tone: "lime" },
    { href: "/logs", title: "Xem nhật ký", copy: "Xem dữ liệu lịch sử từ inbound_message, match_log và trạng thái gửi thông báo.", icon: "logs" as AppIconName, tone: "pink" },
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="page-kicker">✦ Tổng quan</span>
          <h2>Ảnh chụp vận hành</h2>
          <p>Màn hình này cho bạn biết nhanh số nhóm đang theo dõi, độ phủ của luật, alert gần đây, tình trạng watcher và lỗi gửi thông báo.</p>
        </div>
        <div className="hero-signal" aria-hidden="true">
          <div className="signal-ring"><span /></div><div className="signal-message">•••</div><i>+</i>
        </div>
      </section>

      <section className="metric-grid" aria-label="Chỉ số vận hành">
        {cards.map((card) => (
          <article key={card.label} className={`metric-card tone-${card.tone}`}>
            <div className="metric-icon"><AppIcon name={card.icon} /></div>
            <div><p className="metric-label">{card.label}</p><p className="metric-value">{card.value}</p><p className="metric-helper">{card.helper}</p></div>
            <span className="metric-dots" aria-hidden="true">•••</span>
          </article>
        ))}
      </section>

      <section className="quick-action-grid">
        {actions.map((action) => (
          <Link href={action.href} className={`quick-action tone-${action.tone}`} key={action.href}>
            <span className="quick-action-icon"><AppIcon name={action.icon} /></span>
            <div><h3>{action.title}</h3><p>{action.copy}</p></div>
            <span className="quick-action-arrow"><AppIcon name="arrow" /></span>
          </Link>
        ))}
      </section>
    </div>
  );
}
