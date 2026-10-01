import Link from "next/link";
import { redirect } from "next/navigation";
import { CHALLENGE, INTENSITY_INFO, INTENSITIES, SCORING } from "@/lib/config";
import { challengeLength, fmtDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/session";
import { globalStats } from "@/lib/queries";
import { compact, earthLaps } from "@/lib/format";

export default async function Home() {
  const user = await getCurrentUser().catch(() => null);
  if (user?.onboarded) redirect("/dashboard");
  if (user) redirect("/onboarding");
  const stats = await globalStats().catch(() => null);

  return (
    <div className="space-y-16 pt-6 sm:pt-12">
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <span className="chip">
            🍂 {fmtDay(CHALLENGE.start, { month: "long", day: "numeric" })} – {fmtDay(CHALLENGE.end, { month: "long", day: "numeric" })}
          </span>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            Walk the whole of <span className="bg-gradient-to-r from-pumpkin-500 to-maple-500 bg-clip-text text-transparent">October.</span>
          </h1>
          <p className="muted mt-5 max-w-lg text-lg">
            {challengeLength()} days. Every step is a point. Workouts count too. Climb the global leaderboard, rally a
            team, and see how far the world can walk together.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signin" className="btn-primary !px-7 !py-3.5 text-base">
              Start walking →
            </Link>
            <Link href="/leaderboard" className="btn-ghost !px-6 !py-3.5 text-base">
              See the leaderboard
            </Link>
          </div>
          <p className="muted mt-4 text-sm">Sign in with Google, Apple or Facebook. Free, forever.</p>
        </div>

        <div className="card relative overflow-hidden !p-0">
          <div className="bg-gradient-to-br from-pumpkin-400 via-pumpkin-500 to-maple-500 p-6 text-white">
            <div className="text-sm font-semibold uppercase tracking-wider opacity-80">The world so far</div>
            <div className="num mt-1 font-display text-5xl font-extrabold">{compact(stats?.steps ?? 0)}</div>
            <div className="opacity-90">steps walked together</div>
          </div>
          <div className="grid grid-cols-3 divide-x hairline text-center">
            <Stat n={stats?.people ?? 0} label="walkers" />
            <Stat n={stats?.countries ?? 0} label="countries" />
            <Stat n={stats?.teams ?? 0} label="teams" />
          </div>
          <div className="border-t px-6 py-4 text-sm hairline">
            🌍 That&apos;s <b>{earthLaps(stats?.steps ?? 0)}</b> of the way around the Earth.
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-3xl font-extrabold">How points work</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <div className="text-3xl">👟</div>
            <div className="mt-3 font-display text-2xl font-extrabold">1 pt</div>
            <div className="font-semibold">per step</div>
            <p className="muted mt-2 text-sm">Hit {SCORING.dailyGoalSteps.toLocaleString()} in a day for a +{SCORING.dailyGoalBonus} bonus.</p>
          </div>
          {INTENSITIES.map((i) => (
            <div key={i} className="card">
              <div className="text-3xl">{INTENSITY_INFO[i].emoji}</div>
              <div className="mt-3 font-display text-2xl font-extrabold">{SCORING.exercisePointsPerMinute[i]} pts</div>
              <div className="font-semibold">per minute · {INTENSITY_INFO[i].label.toLowerCase()} exercise</div>
              <p className="muted mt-2 text-sm">{INTENSITY_INFO[i].examples}</p>
            </div>
          ))}
        </div>
        <Link href="/scoring" className="mt-4 inline-block text-sm font-semibold text-pumpkin-600 underline-offset-4 hover:underline dark:text-pumpkin-400">
          Why these numbers? →
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["🔗", "Sync or type it in", "Apple Health, Google, Garmin — or just enter your steps each day."],
          ["🛡️", "Build a team", "Name it, pick a crest, invite friends with a link. Team totals compete globally."],
          ["🏆", "Climb the board", "Daily, weekly and all-month rankings — worldwide or just your country."],
        ].map(([icon, t, d]) => (
          <div key={t} className="card">
            <div className="text-3xl">{icon}</div>
            <div className="mt-3 text-lg font-bold">{t}</div>
            <p className="muted mt-1">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="px-2 py-4">
      <div className="num font-display text-2xl font-extrabold">{compact(n)}</div>
      <div className="muted text-xs font-semibold uppercase tracking-wider">{label}</div>
    </div>
  );
}
