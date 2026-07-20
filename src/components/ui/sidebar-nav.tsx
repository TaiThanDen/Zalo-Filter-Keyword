"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppIconName } from "./app-icon";
import { AppIcon } from "./app-icon";

export type SidebarItem = { href: string; label: string; icon: AppIconName };

export function SidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="page-nav" aria-label="Điều hướng quản trị">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className="page-nav-link" aria-current={active ? "page" : undefined} title={item.label}>
            <span className="page-nav-icon"><AppIcon name={item.icon} /></span>
            <span>{item.label}</span>
            <span className="page-nav-diamond" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
