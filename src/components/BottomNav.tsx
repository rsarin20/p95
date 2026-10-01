import { NavLinks } from "./NavLinks";

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md hairline sm:hidden"
      style={{ background: "color-mix(in srgb, var(--card) 90%, transparent)" }}
    >
      <NavLinks variant="bottom" />
    </nav>
  );
}
