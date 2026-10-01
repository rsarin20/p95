"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

type P = { google: boolean; facebook: boolean; apple: boolean; demo: boolean };

export function SignInButtons({ providers, next }: { providers: P; next: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const go = (id: string, opts?: Record<string, string>) => {
    setBusy(id);
    signIn(id, { callbackUrl: next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding", ...opts });
  };
  const base = "flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3.5 text-[15px] font-semibold shadow-sm transition active:scale-[.99] disabled:opacity-60";
  return (
    <div className="space-y-3">
      {providers.apple && (
        <button className={`${base} bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black`} disabled={!!busy} onClick={() => go("apple")}>
          <AppleLogo /> {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
        </button>
      )}
      {providers.google && (
        <button className={`${base} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`} disabled={!!busy} onClick={() => go("google")}>
          <GoogleLogo /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
      )}
      {providers.facebook && (
        <button className={`${base} bg-[#1877F2] text-white hover:bg-[#166fe5]`} disabled={!!busy} onClick={() => go("facebook")}>
          <FacebookLogo /> {busy === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
        </button>
      )}
      {providers.demo && (
        <form
          className="mt-5 rounded-2xl border border-dashed p-4 text-left hairline"
          onSubmit={(e) => {
            e.preventDefault();
            go("demo", { name });
          }}
        >
          <div className="label">Demo sign-in (testing only)</div>
          <div className="flex gap-2">
            <input className="input !py-2.5" placeholder="Any name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-ghost shrink-0" disabled={!!busy || name.trim().length < 2}>
              Go
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const AppleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);
const FacebookLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
  </svg>
);
