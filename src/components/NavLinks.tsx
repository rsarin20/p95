"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/dashboard", label: "Today", icon: "☀️" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/teams", label: "Teams", icon: "🛡️" },
  { href: "/connect", label: "Connect", icon: "🔗" },
];

export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");
  if (variant === "top")
    return (
      <div className="seg">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-4">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
            active(n.href) ? "text-pumpkin-600 dark:text-pumpkin-400" : "muted"
          }`}
        >
          <span className={`text-xl transition ${active(n.href) ? "scale-110" : "grayscale-[.4]"}`}>{n.icon}</span>
          {n.label}
        </Link>
      ))}
    </div>
  );
}
