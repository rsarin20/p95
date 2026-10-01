import Link from "next/link";
import { CHALLENGE, SCORING } from "@/lib/config";
import { addDays, daysBetween } from "@/lib/dates";
import type { DayRow } from "@/lib/queries";

// Leaf-colour heat map: from pale (no activity) to deep maple (huge day).
const SHADES = ["var(--bg-2)", "#ffe3c9", "#ffb070", "#f2711c", "#c8372a"];

function shade(points: number) {
  if (points <= 0) return 0;
  if (points < 5_000) return 1;
  if (points < SCORING.dailyGoalSteps) return 2;
  if (points < 15_000) return 3;
  return 4;
}

export function MonthCalendar({ days, selected, today }: { days: DayRow[]; selected: string; today: string }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const len = daysBetween(CHALLENGE.start, CHALLENGE.end) + 1;
  // Monday-first offset
  const offset = (new Date(CHALLENGE.start + "T00:00:00Z").getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: len }, (_, i) => addDays(CHALLENGE.start, i))];

  return (
    <div>
      <div className="muted mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const row = byDay.get(d);
          const s = shade(row?.points ?? 0);
          const future = d > today;
          return (
            <Link
              key={d}
              href={future ? "#" : `/dashboard?day=${d}`}
              aria-disabled={future}
              title={row ? `${row.points.toLocaleString()} pts · ${row.steps.toLocaleString()} steps` : d}
              className={`relative grid aspect-square place-items-center rounded-xl text-xs font-bold transition ${
                future ? "pointer-events-none opacity-35" : "hover:scale-105"
              } ${d === selected ? "ring-2 ring-offset-2 ring-pumpkin-500 ring-offset-[var(--card)]" : ""}`}
              style={{ background: SHADES[s], color: s >= 3 ? "#fff" : undefined }}
            >
              {Number(d.slice(8))}
              {row && row.bonus > 0 && <span className="absolute -right-1 -top-1 text-[10px]">🏅</span>}
              {d === today && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current" />}
            </Link>
          );
        })}
      </div>
      <div className="muted mt-4 flex items-center justify-end gap-1.5 text-[11px]">
        less
        {SHADES.map((c, i) => (
          <span key={i} className="h-3 w-3 rounded" style={{ background: c }} />
        ))}
        more
      </div>
    </div>
  );
}
