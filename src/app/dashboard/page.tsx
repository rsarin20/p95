import Link from "next/link";
import { CHALLENGE, INTENSITY_INFO, SCORING, SOURCE_INFO, type StepSource } from "@/lib/config";
import { addDays, canLogDay, challengeDayNumber, challengeLength, clampToChallenge, fmtDay, isDay, todayIn } from "@/lib/dates";
import { dayDetail, getTeam, myRank, periodRange, userConnections, userDays } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { scoreDay } from "@/lib/scoring";
import { compact, stepsToKm } from "@/lib/format";
import { ScoreRing } from "@/components/ScoreRing";
import { StepForm, ExerciseForm, RemoveActivityButton } from "@/components/LogForms";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SyncButton } from "@/components/SyncButton";
import { teamGradient } from "@/components/teamColors";

export const metadata = { title: "Today" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ day?: string; welcome?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIn(user.timezone);
  const defaultDay = clampToChallenge(today);
  const day = isDay(sp.day) ? clampToChallenge(sp.day) : defaultDay;
  const before = today < CHALLENGE.start;

  const [days, detail, rank, team, conns] = await Promise.all([
    userDays(user.id),
    dayDetail(user.id, day),
    myRank(user.id, periodRange("all", today)),
    user.team_id ? getTeam(user.team_id) : Promise.resolve(null),
    userConnections(user.id),
  ]);

  const score = scoreDay(detail.entries.map((e) => e.steps), detail.activities);
  const manual = detail.entries.find((e) => e.source === "manual")?.steps ?? null;
  const countedSource = detail.entries[0]?.source as StepSource | undefined;
  const total = days.reduce((s, d) => s + d.points, 0);
  const totalSteps = days.reduce((s, d) => s + d.steps, 0);
  const streak = currentStreak(days.map((d) => d.day), defaultDay);
  const loggable = canLogDay(day, today);
  const exMinutes = detail.activities.reduce((s, a) => s + a.minutes, 0);
  const hasGoogle = conns.some((c) => c.provider === "google");

  return (
    <div className="space-y-6">
      {sp.welcome && (
        <div className="card animate-pop flex items-center gap-4 !py-4" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--card))" }}>
          <span className="text-3xl">🎉</span>
          <div className="flex-1">
            <div className="font-bold">You&apos;re in, {user.display_name}!</div>
            <div className="muted text-sm">Log today&apos;s steps below, connect a tracker, or join a team.</div>
          </div>
          <Link href="/connect" className="btn-ghost hidden sm:inline-flex">Connect a tracker</Link>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="muted text-sm font-semibold uppercase tracking-wider">
            {before ? `Starts ${fmtDay(CHALLENGE.start, { month: "long", day: "numeric" })}` : `Day ${Math.min(challengeDayNumber(defaultDay), challengeLength())} of ${challengeLength()}`}
          </div>
          <h1 className="font-display text-4xl font-extrabold">
            {day === today ? "Today" : fmtDay(day, { weekday: "long", month: "short", day: "numeric" })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <DayNav day={day} />
          {hasGoogle && <SyncButton />}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Day score */}
        <section className="card">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ScoreRing value={score.steps} goal={SCORING.dailyGoalSteps} />
            <div className="w-full flex-1 space-y-3">
              <div>
                <div className="muted text-xs font-semibold uppercase tracking-wider">Day score</div>
                <div className="num font-display text-5xl font-extrabold text-pumpkin-600 dark:text-pumpkin-400">
                  {score.total.toLocaleString()}
                </div>
              </div>
              <Breakdown label="Steps" value={score.stepPoints} />
              <Breakdown label={`Exercise · ${exMinutes} min`} value={score.exercisePoints} />
              <Breakdown label={score.bonus ? "10K bonus 🏅" : `10K bonus (${(SCORING.dailyGoalSteps - score.steps).toLocaleString()} to go)`} value={score.bonus} dim={!score.bonus} />
            </div>
          </div>

          {detail.entries.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {detail.entries.map((e) => (
                <span key={e.source} className="chip" title={e.source === countedSource ? "Highest reading — this one counts" : "Lower reading — not counted"}>
                  {SOURCE_INFO[e.source as StepSource]?.emoji} {SOURCE_INFO[e.source as StepSource]?.label}: {e.steps.toLocaleString()}
                  {e.source === countedSource && detail.entries.length > 1 ? " ✓" : ""}
                </span>
              ))}
            </div>
          )}
          {detail.entries.length > 1 && (
            <p className="muted mt-2 text-xs">When several sources report steps for a day, we count the highest one — never the sum — so nothing is double-counted.</p>
          )}
        </section>

        {/* Logging */}
        <section className="card space-y-6">
          {!loggable.ok ? (
            <p className="muted text-sm">{loggable.reason}</p>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold">👟 Steps</h2>
                <p className="muted mb-3 text-sm">Type your total for the day. Synced trackers fill this in automatically.</p>
                <StepForm day={day} current={manual} />
              </div>
              <div className="border-t pt-6 hairline">
                <h2 className="text-lg font-bold">💪 Exercise</h2>
                <p className="muted mb-3 text-sm">For workouts your step counter misses — cycling, swimming, gym, yoga. Don&apos;t log walks or runs your tracker already counted.</p>
                <ExerciseForm day={day} />
                {detail.activities.length > 0 && (
                  <ul className="mt-4 divide-y hairline">
                    {detail.activities.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-xl">{INTENSITY_INFO[a.intensity].emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{a.label || INTENSITY_INFO[a.intensity].label + " exercise"}</div>
                          <div className="muted text-xs">
                            {a.minutes} min · {INTENSITY_INFO[a.intensity].label}
                          </div>
                        </div>
                        <div className="num font-bold">+{(a.minutes * SCORING.exercisePointsPerMinute[a.intensity]).toLocaleString()}</div>
                        <RemoveActivityButton id={a.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Totals */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Walktober points" value={total < 1_000_000 ? total.toLocaleString() : compact(total)} accent />
        <Tile label="Global rank" value={rank ? `#${rank.rank.toLocaleString()}` : "—"} sub={rank ? `of ${rank.of.toLocaleString()}` : "log to get ranked"} href="/leaderboard" />
        <Tile label="Steps" value={compact(totalSteps)} sub={`${stepsToKm(totalSteps).toFixed(1)} km`} />
        <Tile label="Streak" value={`${streak} 🔥`} sub={streak === 1 ? "day" : "days"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Your {CHALLENGE.name}</h2>
            <span className="muted text-xs">Tap a day to edit it</span>
          </div>
          <MonthCalendar days={days} selected={day} today={today} />
        </section>

        <section className="card overflow-hidden !p-0">
          {team ? (
            <Link href={`/teams/${team.id}`} className="block">
              <div className="p-5 text-white" style={{ background: teamGradient(team.color) }}>
                <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Your team</div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-4xl drop-shadow">{team.emoji}</span>
                  <span className="font-display text-2xl font-extrabold">{team.name}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-5">
                <span className="muted text-sm">{team.members} member{team.members === 1 ? "" : "s"}</span>
                <span className="text-sm font-semibold text-pumpkin-600 dark:text-pumpkin-400">Team page →</span>
              </div>
            </Link>
          ) : (
            <div className="p-6">
              <div className="text-4xl">🛡️</div>
              <h2 className="mt-2 text-lg font-bold">Better together</h2>
              <p className="muted mt-1 text-sm">Start a team or join one with an invite code. Team totals battle it out on the global board.</p>
              <Link href="/teams" className="btn-primary mt-4">Find a team</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Breakdown({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b pb-2 text-sm hairline ${dim ? "opacity-50" : ""}`}>
      <span className="muted">{label}</span>
      <span className="num font-bold">{value ? "+" : ""}{value.toLocaleString()}</span>
    </div>
  );
}

function Tile({ label, value, sub, accent, href }: { label: string; value: string; sub?: string; accent?: boolean; href?: string }) {
  const inner = (
    <div className={`card h-full !p-4 ${accent ? "!border-transparent bg-gradient-to-br from-pumpkin-400 to-maple-500 text-white" : ""}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider ${accent ? "opacity-85" : "muted"}`}>{label}</div>
      <div className="num mt-1 font-display text-3xl font-extrabold">{value}</div>
      {sub && <div className={`text-xs ${accent ? "opacity-85" : "muted"}`}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function DayNav({ day }: { day: string }) {
  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  return (
    <div className="seg">
      <Link href={`/dashboard?day=${prev}`} aria-disabled={prev < CHALLENGE.start} className={prev < CHALLENGE.start ? "pointer-events-none opacity-40" : ""}>
        ←
      </Link>
      <Link href="/dashboard">Today</Link>
      <Link href={`/dashboard?day=${next}`} aria-disabled={next > CHALLENGE.end} className={next > CHALLENGE.end ? "pointer-events-none opacity-40" : ""}>
        →
      </Link>
    </div>
  );
}

function currentStreak(activeDays: string[], today: string): number {
  const set = new Set(activeDays);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
