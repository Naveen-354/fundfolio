"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Overview", icon: "◫" },
  { href: "/admin/fund-houses", label: "Fund houses", icon: "▦" },
  { href: "/admin/schemes", label: "Schemes", icon: "◇" },
  { href: "/admin/issues", label: "Problem reports", icon: "◉" },
  { href: "/admin/typography", label: "Typography", icon: "Aa" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {items.map(({ href, label, icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} className={`admin-nav-link${active ? " active" : ""}`} href={href} aria-current={active ? "page" : undefined}><span className="nav-line-icon">{icon}</span>{label}</Link>;
      })}
    </nav>
  );
}

export function AdminTopbar() {
  const pathname = usePathname();
  const current = pathname.startsWith("/admin/fund-houses")
    ? "Fund houses"
    : pathname.startsWith("/admin/schemes") ? "Schemes"
      : pathname.startsWith("/admin/issues") ? "Problem reports"
        : pathname.startsWith("/admin/typography") ? "Typography" : "Overview";
  return <div className="admin-topbar"><span>Workspace / <strong>{current}</strong></span><Link href="/">View public site ↗</Link></div>;
}
