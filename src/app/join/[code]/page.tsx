import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { q1 } from "@/lib/db";
import { TEAM_MAX_MEMBERS } from "@/lib/config";
import { teamGradient } from "@/components/teamColors";
import { JoinTeamForm } from "@/components/TeamForms";

export const metadata = { title: "Join a team" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const team = await q1<{ id: string; name: string; emoji: string; color: string; motto: string | null; members: number }>(
    `SELECT t.id, t.name, t.emoji, t.color, t.motto, (SELECT COUNT(*)::int FROM users u WHERE u.team_id = t.id) AS members
     FROM teams t WHERE t.invite_code = $1`,
    [code],
  );
  const user = await getCurrentUser().catch(() => null);

  if (!team)
    return (
      <div className="card mx-auto mt-10 max-w-md text-center">
        <div className="text-5xl">🤔</div>
        <h1 className="mt-3 text-xl font-bold">That invite link doesn&apos;t work</h1>
        <p className="muted mt-1">The team may have been renamed or disbanded. Ask your captain for a fresh link.</p>
        <Link href="/teams" className="btn-primary mt-5">Browse teams</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card animate-pop overflow-hidden !p-0 text-center">
        <div className="p-8 text-white" style={{ background: teamGradient(team.color) }}>
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/20 text-5xl backdrop-blur">{team.emoji}</div>
          <div className="mt-3 text-sm font-semibold uppercase tracking-wider opacity-85">You&apos;re invited to join</div>
          <h1 className="font-display text-3xl font-extrabold">{team.name}</h1>
          {team.motto && <p className="mt-1 opacity-90">“{team.motto}”</p>}
          <p className="mt-2 text-sm opacity-85">{team.members}/{TEAM_MAX_MEMBERS} members</p>
        </div>
        <div className="p-6">
          {!user ? (
            <>
              <p className="muted mb-4">Sign in first, then come back to this link.</p>
              <Link href={`/signin?callbackUrl=/join/${code}`} className="btn-primary w-full">Sign in to join</Link>
            </>
          ) : !user.onboarded ? (
            <Link href="/onboarding" className="btn-primary w-full">Finish setting up your profile</Link>
          ) : user.team_id === team.id ? (
            <Link href={`/teams/${team.id}`} className="btn-primary w-full">You&apos;re already in — open team</Link>
          ) : user.team_id ? (
            <p className="muted">You&apos;re on another team. Leave it from your team page to switch.</p>
          ) : team.members >= TEAM_MAX_MEMBERS ? (
            <p className="muted">This team is full.</p>
          ) : (
            <JoinTeamForm code={code} />
          )}
        </div>
      </div>
    </div>
  );
}
