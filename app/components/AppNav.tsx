"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/import", label: "Import CSV", icon: "📥" },
  { href: "/manage", label: "Manage", icon: "⚙️" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="topnav">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href}>
            {tab.label}
          </Link>
        ))}
      </nav>

      <nav className="bottom-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={pathname === tab.href ? "active" : undefined}
          >
            <span className="icon">{tab.icon}</span>
            <span className="label">{tab.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
