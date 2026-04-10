import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ROUTES } from "@/src/config/constants";
import { getCurrentUser, logoutCurrentUser } from "@/src/modules/auth/auth.service";

const navigation = [
  { href: ROUTES.dashboard, label: "Dashboard" },
  { href: ROUTES.groups, label: "Groups" },
  { href: ROUTES.rules, label: "Rules" },
  { href: ROUTES.channels, label: "Channels" },
  { href: ROUTES.logs, label: "Logs" },
  { href: ROUTES.watchers, label: "Watchers" },
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
      <aside className="border-r border-[var(--color-border)] bg-[#fff6ea]/80 px-6 py-8 backdrop-blur-sm">
        <div className="mb-8 space-y-3">
          <div className="inline-flex rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Control Plane
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Zalo Alert</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              Monitor message events, evaluate rules, and track notification delivery.
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-accent-soft)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-[var(--color-muted)]">Signed in as</p>
            <p className="text-base font-semibold">{user.email}</p>
          </div>

          <form action={logoutAction}>
            <button type="submit" className="btn btn-secondary">
              Logout
            </button>
          </form>
        </header>

        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
