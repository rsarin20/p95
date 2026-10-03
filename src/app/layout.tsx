import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Leaves } from "@/components/Leaves";
import { BottomNav } from "@/components/BottomNav";
import { TimezoneSync } from "@/components/TimezoneSync";
import { getCurrentUser } from "@/lib/session";
import { CHALLENGE } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${CHALLENGE.name} — walk the whole month`, template: `%s · ${CHALLENGE.name}` },
  description: "Track your steps and workouts all October. Climb the global leaderboard and win with your team.",
  applicationName: CHALLENGE.name,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: `${CHALLENGE.name} 🍂`,
    description: "31 days. Every step counts. Join a team and climb the global leaderboard.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  const signedIn = Boolean(user?.onboarded);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans">
        <Leaves />
        <Header user={user && user.onboarded ? { name: user.display_name ?? "", avatar: user.avatar } : null} />
        <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-8 pt-4 sm:px-6 sm:pb-10">{children}</main>
        <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-28 text-center text-xs sm:px-6 sm:pb-10">
          <nav className="muted flex justify-center gap-4">
            <a href="/scoring" className="hover:underline">Scoring</a>
            <a href="/privacy" className="hover:underline">Privacy</a>
            <a href="/terms" className="hover:underline">Terms</a>
            <a href="/data-deletion" className="hover:underline">Delete data</a>
          </nav>
        </footer>
        {signedIn && <BottomNav />}
        {user && <TimezoneSync current={user.timezone} />}
      </body>
    </html>
  );
}
