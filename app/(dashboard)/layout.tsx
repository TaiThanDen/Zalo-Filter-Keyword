import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ROUTES } from "@/src/config/constants";
import { getCurrentUser, logoutCurrentUser } from "@/src/modules/auth/auth.service";
import { AppIcon } from "@/src/components/ui/app-icon";
import { SidebarNav, type SidebarItem } from "@/src/components/ui/sidebar-nav";

const navigation: SidebarItem[] = [
  { href: ROUTES.dashboard, label: "Tổng quan", icon: "dashboard" },
  { href: ROUTES.groups, label: "Nhóm", icon: "groups" },
  { href: ROUTES.rules, label: "Luật", icon: "rules" },
  { href: ROUTES.channels, label: "Kênh báo tin", icon: "channels" },
  { href: ROUTES.logs, label: "Nhật ký", icon: "logs" },
  { href: ROUTES.watchers, label: "Watcher", icon: "watcher" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  async function logoutAction() {
    "use server";
    await logoutCurrentUser();
    revalidatePath("/login");
    redirect("/login");
  }

  return (
    <div className="page-shell">
      <aside className="page-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true"><span>Z</span></div>
          <div className="brand-copy"><strong>Zalo</strong><span>Tools</span><small>Alert studio</small></div>
        </div>
        <SidebarNav items={navigation} />
        <div className="sidebar-account">
          <div className="sidebar-avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <span>Đăng nhập với tài khoản</span>
          <strong>{user.email}</strong>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-pink sidebar-logout"><AppIcon name="logout" /> Đăng xuất</button>
          </form>
        </div>
        <div className="sidebar-shapes" aria-hidden="true"><i /><i /><i /><i /></div>
      </aside>

      <div className="page-workspace">
        <header className="page-header">
          <div className="account-summary">
            <span className="account-icon"><AppIcon name="dashboard" /></span>
            <div><p>Không gian vận hành</p><strong>{user.email}</strong></div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-secondary header-logout"><AppIcon name="logout" /> Đăng xuất</button>
          </form>
        </header>
        <main className="page-main">{children}</main>
      </div>
    </div>
  );
}
