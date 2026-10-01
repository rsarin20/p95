"use client";

import { useActionState, useState } from "react";
import { createTeam, joinTeam, updateTeam, type ActionState } from "@/app/actions";
import { TEAM_COLORS, TEAM_EMOJIS } from "@/lib/validate";
import { teamGradient } from "./teamColors";

type TeamInit = { name: string; emoji: string; color: string; motto: string | null };

export function CreateTeamForm() {
  return <TeamEditor action={createTeam} submit="Create team" />;
}

export function EditTeamForm({ team }: { team: TeamInit }) {
  return <TeamEditor action={updateTeam} submit="Save team" initial={team} />;
}

function TeamEditor({
  action: serverAction,
  submit,
  initial,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  submit: string;
  initial?: TeamInit;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(serverAction, null);
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🍂");
  const [color, setColor] = useState(initial?.color ?? "pumpkin");
  const [motto, setMotto] = useState(initial?.motto ?? "");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="color" value={color} />

      {/* Live crest preview */}
      <div className="flex items-center gap-4 rounded-3xl p-5 text-white shadow-card" style={{ background: teamGradient(color) }}>
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-4xl backdrop-blur">{emoji}</span>
        <div className="min-w-0">
          <div className="truncate font-display text-2xl font-extrabold drop-shadow-sm">{name || "Your team name"}</div>
          <div className="truncate text-sm opacity-90">{motto || "A rallying cry (optional)"}</div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="team-name">Team name</label>
        <input id="team-name" name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="e.g. The Sole Mates" required />
      </div>
      <div>
        <div className="label">Crest</div>
        <div className="flex flex-wrap gap-2">
          {TEAM_EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              aria-pressed={emoji === e}
              className={`grid h-10 w-10 place-items-center rounded-xl border text-xl transition hairline ${emoji === e ? "scale-110 ring-2 ring-pumpkin-400" : "hover:scale-105"}`}
              style={{ background: "var(--bg)" }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label">Colours</div>
        <div className="flex flex-wrap gap-3">
          {TEAM_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={`h-10 w-10 rounded-full shadow-sm transition ${color === c ? "scale-110 ring-4 ring-offset-2 ring-offset-[var(--card)]" : "hover:scale-105"}`}
              style={{ background: teamGradient(c), ["--tw-ring-color" as string]: "var(--accent)" }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="motto">Motto (optional)</label>
        <input id="motto" name="motto" className="input" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} placeholder="Leaf it all on the trail" />
      </div>
      {state?.error && <p className="text-sm font-semibold text-maple-500">{state.error}</p>}
      {state?.message && <p className="text-sm font-semibold text-forest-500">✓ {state.message}</p>}
      <button className="btn-primary w-full !py-3" disabled={pending || name.trim().length < 3}>
        {pending ? "Saving…" : submit}
      </button>
    </form>
  );
}

export function JoinTeamForm({ code: initial = "" }: { code?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinTeam, null);
  const [code, setCode] = useState(initial);
  return (
    <form action={action}>
      <div className="flex gap-2">
        <input
          name="code"
          className="input num text-center font-display text-xl font-extrabold uppercase tracking-[.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          aria-label="Invite code"
        />
        <button className="btn-primary shrink-0" disabled={pending || code.length < 6}>
          {pending ? "…" : "Join"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm font-semibold text-maple-500">{state.error}</p>}
    </form>
  );
}
