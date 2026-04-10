import Link from "next/link";
import { getDashboardStats } from "@/src/modules/logs/logs.service";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    { label: "Groups", value: stats.totalGroups, helper: `${stats.enabledGroups} enabled` },
    { label: "Active Rules", value: stats.activeRules, helper: "include + exclude" },
    { label: "Matches (24h)", value: stats.matches24h, helper: "recent matched inbound_message" },
    { label: "Watchers Online", value: stats.watchersOnline, helper: "heartbeat-based" },
    { label: "Failed Deliveries", value: stats.failedDeliveries, helper: "notification_delivery backlog" },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <span className="inline-flex rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Dashboard
        </span>
        <h2 className="text-3xl font-semibold tracking-tight">Operational snapshot</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
          This dashboard gives a quick read on groups, rule coverage, recent matched traffic, watcher health, and delivery failures.
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
          <h3 className="text-lg font-semibold">Manage groups</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Create monitored groups, toggle them on or off, and assign watcher ownership.
          </p>
        </Link>
        <Link href="/rules" className="card rounded-[1.6rem] p-5 transition hover:-translate-y-0.5">
          <h3 className="text-lg font-semibold">Tune rules</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Adjust include and exclude rules, match type, case sensitivity, and group mapping.
          </p>
        </Link>
        <Link href="/logs" className="card rounded-[1.6rem] p-5 transition hover:-translate-y-0.5">
          <h3 className="text-lg font-semibold">Inspect logs</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Drill into inbound_message, match_log decisions, raw payloads, and delivery outcomes.
          </p>
        </Link>
      </section>
    </div>
  );
}
