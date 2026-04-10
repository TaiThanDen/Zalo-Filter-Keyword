import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ROUTES } from "@/src/config/constants";
import { getCurrentUser, logoutCurrentUser } from "@/src/modules/auth/auth.service";

const navigation = [
  { href: ROUTES.dashboard, label: "Tổng quan" },
  { href: ROUTES.groups, label: "Nhóm" },
  { href: ROUTES.rules, label: "Luật" },
  { href: ROUTES.channels, label: "Kênh báo tin" },
  { href: ROUTES.logs, label: "Nhật ký" },
  { href: ROUTES.watchers, label: "Watcher" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  async function logoutAction() {
    "use server";
    await logoutCurrentUser();
    revalidatePath("/login");
    redirect("/login");
  }

  return (
    <div className="page-shell">
      <aside className="page-sidebar border-r border-[var(--color-border)] bg-[#fff6ea]/85 px-5 py-6 backdrop-blur-sm md:px-6 md:py-8">
        <div className="mb-6 space-y-3 md:mb-8">
          <div className="inline-flex rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Bảng điều khiển
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Quản trị cảnh báo Zalo</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              Quản lý nhóm theo dõi, luật lọc, kênh gửi thông báo, nhật ký và trạng thái watcher trong một nơi.
            </p>
          </div>
        </div>

        <nav className="page-nav">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="page-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="page-header border-b border-[var(--color-border)] px-5 py-4 md:px-6 md:py-5">
          <div>
            <p className="text-sm font-semibold text-[var(--color-muted)]">Đăng nhập với tài khoản</p>
            <p className="text-base font-semibold break-all">{user.email}</p>
          </div>

          <form action={logoutAction}>
            <button type="submit" className="btn btn-secondary">
              Đăng xuất
            </button>
          </form>
        </header>

        <main className="px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
