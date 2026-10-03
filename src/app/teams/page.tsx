import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { openTeams, periodRange, teamLeaderboard } from "@/lib/queries";
import { todayIn } from "@/lib/dates";
import { TEAM_MAX_MEMBERS } from "@/lib/config";
import { compact } from "@/lib/format";
import { CreateTeamForm, JoinTeamForm } from "@/components/TeamForms";
import { teamGradient } from "@/components/teamColors";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requireUser();
  if (user.team_id) redirect(`/teams/${user.team_id}`);
  const [top, open] = await Promise.all([
    teamLeaderboard({ range: periodRange("all", todayIn(user.timezone)), limit: 6 }),
    openTeams(6),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Teams</h1>
        <p className="muted mt-1">Up to {TEAM_MAX_MEMBERS} walkers per team. Every member&apos;s points add to the team total.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card">
          <h2 className="text-xl font-bold">✨ Start a team</h2>
          <p className="muted mb-5 text-sm">You&apos;ll be captain. You get an invite link to share right after.</p>
          <CreateTeamForm />
        </section>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-xl font-bold">🎟️ Have an invite code?</h2>
            <p className="muted mb-4 text-sm">Ask your captain for the 6-character code or their invite link.</p>
            <JoinTeamForm />
          </section>
          {top.length > 0 && (
            <section className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">🏆 Top teams</h2>
                <Link href="/leaderboard?tab=teams" className="text-sm font-semibold text-pumpkin-600 dark:text-pumpkin-400">All →</Link>
              </div>
              <ul className="space-y-2">
                {top.map((t) => (
                  <li key={t.id}>
                    <Link href={`/teams/${t.id}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-pumpkin-500/5">
                      <span className="grid h-9 w-9 place-items-center rounded-xl text-lg text-white" style={{ background: teamGradient(t.color) }}>{t.emoji}</span>
                      <span className="flex-1 truncate font-semibold">{t.name}</span>
                      <span className="num muted text-sm font-bold">{compact(t.points)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {open.length > 0 && (
            <p className="muted text-center text-xs">{open.length} team{open.length === 1 ? " has" : "s have"} open spots — ask around for a code!</p>
          )}
        </div>
      </div>
    </div>
  );
}
