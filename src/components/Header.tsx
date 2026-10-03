import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { CHALLENGE } from "@/lib/config";

export function Header({ user }: { user: { name: string; avatar: string } | null }) {
  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur-md hairline" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}>
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-pumpkin-400 to-maple-500 text-lg shadow-sm">
            🍂
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">{CHALLENGE.name}</span>
        </Link>
        {user && (
          <nav className="ml-4 hidden sm:block">
            <NavLinks variant="top" />
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!user && (
            <Link href="/leaderboard" className="btn-ghost hidden !px-4 !py-2 sm:inline-flex">
              Leaderboard
            </Link>
          )}
          {user ? (
            <Link href="/profile" className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 hairline" style={{ background: "var(--card)" }}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-pumpkin-100 text-lg dark:bg-night-line">{user.avatar}</span>
              <span className="max-w-[9rem] truncate text-sm font-semibold">{user.name}</span>
            </Link>
          ) : (
            <Link href="/signin" className="btn-primary !py-2">
              Join now
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
