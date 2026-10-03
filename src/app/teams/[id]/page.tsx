import Link from "next/link";
import { notFound } from "next/navigation";
import { leaveTeam } from "@/app/actions";
import { requireUser } from "@/lib/session";
import { getTeam, periodRange, teamLeaderboard, teamMembers } from "@/lib/queries";
import { todayIn } from "@/lib/dates";
import { TEAM_MAX_MEMBERS } from "@/lib/config";
import { compact, stepsToKm } from "@/lib/format";
import { flag } from "@/lib/countries";
import { appBaseUrl } from "@/lib/connectors";
import { teamGradient } from "@/components/teamColors";
import { CopyButton, ShareButton } from "@/components/CopyButton";
import { EditTeamForm } from "@/components/TeamForms";

export const metadata = { title: "Team" };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; joined?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const team = await getTeam(id);
  if (!team) notFound();
  const [members, board] = await Promise.all([
    teamMembers(team.id),
    teamLeaderboard({ range: periodRange("all", todayIn(user.timezone)), limit: 10_000 }),
  ]);
  const isMember = user.team_id === team.id;
  const isCaptain = team.captain_id === user.id;
  const total = members.reduce((s, m) => s + m.points, 0);
  const steps = members.reduce((s, m) => s + m.steps, 0);
  const rank = board.find((t) => t.id === team.id)?.rank;
  const inviteUrl = `${appBaseUrl()}/join/${team.invite_code}`;

  return (
    <div className="space-y-6">
      {(sp.created || sp.joined) && (
        <div className="card animate-pop !py-4 text-center font-semibold">
          {sp.created ? "🎉 Team created! Now invite your crew with the link below." : `🎉 Welcome to ${team.name}!`}
        </div>
      )}

      <section className="relative overflow-hidden rounded-[2rem] p-6 text-white shadow-card sm:p-10" style={{ background: teamGradient(team.color) }}>
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none text-[11rem] opacity-15">{team.emoji}</div>
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid h-20 w-20 place-items-center rounded-3xl bg-white/20 text-5xl backdrop-blur">{team.emoji}</span>
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-extrabold drop-shadow-sm sm:text-5xl">{team.name}</h1>
            {team.motto && <p className="mt-1 text-lg opacity-90">“{team.motto}”</p>}
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-3 gap-3">
          <Big label="Team points" value={total < 1_000_000 ? total.toLocaleString() : compact(total)} />
          <Big label="Global rank" value={rank ? `#${rank}` : "—"} />
          <Big label="Distance" value={`${compact(stepsToKm(steps))} km`} />
        </div>
      </section>

      {isMember && (
        <section className="card flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="font-bold">Invite teammates ({team.members}/{TEAM_MAX_MEMBERS})</div>
            <div className="muted text-sm">
              Share the link, or the code <span className="num font-display font-extrabold tracking-widest text-[var(--text)]">{team.invite_code}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <CopyButton text={inviteUrl} label="Copy link" />
            <ShareButton url={inviteUrl} title={`Join ${team.name} on Walktober`} text={`Walk with me this October — join ${team.emoji} ${team.name}!`} />
          </div>
        </section>
      )}

      <section className="card !p-0">
        <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
          <h2 className="text-lg font-bold">Roster</h2>
          <span className="muted text-sm">{members.length} member{members.length === 1 ? "" : "s"}</span>
        </div>
        <ol className="mt-3 divide-y hairline">
          {members.map((m) => {
            const share = total ? Math.round((m.points / total) * 100) : 0;
            return (
              <li key={m.id} className={`flex items-center gap-3 px-5 py-3 sm:px-6 ${m.id === user.id ? "bg-pumpkin-500/10" : ""}`}>
                <span className="muted num w-6 text-center font-bold">{m.rank}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-pumpkin-100 text-xl dark:bg-night-line">{m.avatar}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {m.display_name} {m.country ? flag(m.country) : ""} {m.is_captain && <span className="chip ml-1 !py-0">👑 captain</span>}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: teamGradient(team.color) }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="num font-display text-lg font-extrabold">{m.points.toLocaleString()}</div>
                  <div className="muted text-xs">{compact(m.steps)} steps</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {isCaptain && (
        <details className="card">
          <summary className="cursor-pointer font-bold">✏️ Edit team</summary>
          <div className="mt-5">
            <EditTeamForm team={{ name: team.name, emoji: team.emoji, color: team.color, motto: team.motto }} />
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/leaderboard?tab=teams" className="btn-ghost">🏆 Team leaderboard</Link>
        {isMember && (
          <form action={leaveTeam}>
            <button className="text-sm font-semibold text-maple-500 hover:underline">
              Leave team{isCaptain && members.length > 1 ? " (captaincy passes on)" : ""}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 p-3 backdrop-blur sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-85">{label}</div>
      <div className="num font-display text-2xl font-extrabold sm:text-3xl">{value}</div>
    </div>
  );
}
