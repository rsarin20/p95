import { INTENSITIES, INTENSITY_INFO, SCORING } from "@/lib/config";

export const metadata = { title: "How scoring works" };

export default function Scoring() {
  const s = SCORING;
  const ex = (i: (typeof INTENSITIES)[number], m: number) => (m * s.exercisePointsPerMinute[i]).toLocaleString();
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">How scoring works</h1>
      <p className="muted text-lg">Simple enough to explain at the water cooler, fair enough that cyclists and swimmers can compete with walkers.</p>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">👟 Steps: 1 point each</h2>
        <p>Every step is a point. Hit <b>{s.dailyGoalSteps.toLocaleString()} steps</b> in a day and earn a <b>+{s.dailyGoalBonus} bonus</b>.</p>
        <p className="muted text-sm">If Apple Health, Google, Garmin and a manual entry all report steps for the same day, we count the highest single number — not the sum — because they usually see the same steps.</p>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">💪 Exercise: points per minute</h2>
        <p>
          The anchor is walking itself: brisk walking at about <b>100 steps per minute</b> is the research-backed threshold for moderate
          intensity. So one minute of moderate exercise earns the same as one minute of brisk walking — <b>100 points</b>. Following WHO
          guidance (one vigorous minute ≈ two moderate minutes), heavy exercise earns double; light activity earns half.
        </p>
        <div className="overflow-hidden rounded-2xl border hairline">
          <table className="w-full text-left text-sm">
            <thead style={{ background: "var(--bg-2)" }}>
              <tr>
                <th className="p-3">Intensity</th>
                <th className="p-3">Talk test</th>
                <th className="p-3 text-right">Pts/min</th>
                <th className="p-3 text-right">30 min</th>
              </tr>
            </thead>
            <tbody className="divide-y hairline">
              {INTENSITIES.map((i) => (
                <tr key={i}>
                  <td className="p-3">
                    <div className="font-bold">{INTENSITY_INFO[i].emoji} {INTENSITY_INFO[i].label}</div>
                    <div className="muted text-xs">{INTENSITY_INFO[i].examples}</div>
                  </td>
                  <td className="muted p-3">{INTENSITY_INFO[i].met}</td>
                  <td className="num p-3 text-right font-bold">{s.exercisePointsPerMinute[i]}</td>
                  <td className="num p-3 text-right font-bold">{ex(i, 30)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted text-sm">
          <b>Don&apos;t double-dip:</b> if your watch already counted the steps from a walk or run, don&apos;t also log it as exercise. Exercise logging is for
          activity your step counter misses — cycling, swimming, rowing, weights, yoga, classes.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">⚖️ Fair-play limits</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Up to {s.maxStepsPerDay.toLocaleString()} steps count per day.</li>
          <li>Up to {s.maxExerciseMinutesPerDay} minutes of logged exercise per day.</li>
          <li>Days are your local calendar days. You can backfill any past day of the challenge, but not the future.</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">🛡️ Teams</h2>
        <p>A team&apos;s score is the sum of its members&apos; points. The team board can also be sorted by <b>points per member</b>, so small teams can still top the charts.</p>
      </section>

      <section className="card">
        <h2 className="text-xl font-bold">Example day</h2>
        <p className="mt-2">8,000 steps + 30 min moderate cycling + 20 min light yoga</p>
        <p className="num mt-1 font-display text-2xl font-extrabold">
          8,000 + {ex("moderate", 30)} + {ex("light", 20)} = {(8000 + 30 * s.exercisePointsPerMinute.moderate + 20 * s.exercisePointsPerMinute.light).toLocaleString()} pts
        </p>
      </section>
    </article>
  );
}
