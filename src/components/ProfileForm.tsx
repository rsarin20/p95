"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfile, type ActionState } from "@/app/actions";
import { AVATARS } from "@/lib/validate";
import { flag } from "@/lib/countries";

type Props = {
  providerName: string | null;
  initial: { mode: "real" | "nickname"; displayName: string | null; avatar: string; country: string | null };
  countries: { code: string; name: string }[];
  submitLabel: string;
  next?: string | null;
};

export function ProfileForm({ providerName, initial, countries, submitLabel, next }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProfile, null);
  const hasReal = Boolean(providerName && providerName.trim().length >= 2);
  const [mode, setMode] = useState<"real" | "nickname">(hasReal ? initial.mode : "nickname");
  const [realName, setRealName] = useState(
    initial.mode === "real" && initial.displayName ? initial.displayName : providerName ?? "",
  );
  const [nickname, setNickname] = useState(initial.mode === "nickname" ? initial.displayName ?? "" : "");
  const [avatar, setAvatar] = useState(initial.avatar);
  const [country, setCountry] = useState(initial.country ?? "");
  const [tz, setTz] = useState("");

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!initial.country) {
      // Best guess from the browser locale, e.g. "en-GB" → GB.
      const region = new Intl.Locale(navigator.language).maximize().region;
      if (region && countries.some((c) => c.code === region)) setCountry(region);
    }
  }, [initial.country, countries]);

  const preview = (mode === "real" ? realName : nickname).trim() || "Your name";

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="name_mode" value={mode} />
      <input type="hidden" name="avatar" value={avatar} />
      <input type="hidden" name="timezone" value={tz} />
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <div className="label">How should you appear on the leaderboard?</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice active={mode === "real"} onClick={() => setMode("real")} title="My name" sub={hasReal ? "From your account — you can tidy it up" : "Type your name"} />
          <Choice active={mode === "nickname"} onClick={() => setMode("nickname")} title="A nickname" sub="Stay incognito, e.g. “Sir Steps-a-Lot”" />
        </div>
        <div className="mt-3">
          {mode === "real" ? (
            <input className="input" name="real_name" value={realName} onChange={(e) => setRealName(e.target.value)} maxLength={24} placeholder="Your name" autoComplete="name" />
          ) : (
            <input className="input" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} placeholder="Pick a nickname" autoFocus />
          )}
        </div>
      </div>

      <div>
        <div className="label">Pick an avatar</div>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              className={`grid h-11 w-11 place-items-center rounded-2xl border text-xl transition hairline ${
                avatar === a ? "scale-110 border-pumpkin-500 bg-pumpkin-100 ring-2 ring-pumpkin-400 dark:bg-night-line" : "hover:scale-105"
              }`}
              style={avatar === a ? undefined : { background: "var(--bg)" }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="country">Country (for the country leaderboard)</label>
        <select id="country" name="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Prefer not to say</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {flag(c.code)} {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border p-4 hairline" style={{ background: "var(--bg)" }}>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-pumpkin-100 text-2xl dark:bg-night-line">{avatar}</span>
        <div className="min-w-0">
          <div className="muted text-xs font-semibold uppercase tracking-wider">Leaderboard preview</div>
          <div className="truncate text-lg font-bold">
            {preview} <span className="ml-1">{country ? flag(country) : ""}</span>
          </div>
        </div>
      </div>

      {state?.error && <p className="text-sm font-semibold text-maple-500">{state.error}</p>}
      {state?.message && <p className="text-sm font-semibold text-forest-500">{state.message}</p>}
      <button className="btn-primary w-full !py-3.5 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Choice({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition hairline ${active ? "border-pumpkin-500 ring-2 ring-pumpkin-400" : "hover:brightness-95"}`}
      style={{ background: active ? "color-mix(in srgb, var(--accent) 10%, var(--card))" : "var(--bg)" }}
    >
      <div className="flex items-center gap-2 font-bold">
        <span className={`h-4 w-4 rounded-full border-2 ${active ? "border-pumpkin-500 bg-pumpkin-500 shadow-[inset_0_0_0_3px_var(--card)]" : "hairline"}`} />
        {title}
      </div>
      <div className="muted mt-1 text-sm">{sub}</div>
    </button>
  );
}
