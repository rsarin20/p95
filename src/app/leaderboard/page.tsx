import Link from "next/link";
import { todayIn } from "@/lib/dates";
import { getCurrentUser } from "@/lib/session";
import { globalStats, myRank, peopleLeaderboard, periodRange, teamLeaderboard, type Period, type PersonRow, type TeamRow } from "@/lib/queries";
import { COUNTRIES, COUNTRY_CODES, countryName, flag } from "@/lib/countries";
import { compact, earthLaps } from "@/lib/format";
import { teamGradient } from "@/components/teamColors";
import { CountryFilter } from "@/components/CountryFilter";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

type SP = { tab?: string; period?: string; country?: string; sort?: string };

export default async function Leaderboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const tab = sp.tab === "teams" ? "teams" : "people";
  const period: Period = sp.period === "today" || sp.period === "week" ? sp.period : "all";
  const country = sp.country && COUNTRY_CODES.includes(sp.country) ? sp.country : null;
  const sort = sp.sort === "avg" ? "avg" : "total";
  const range = periodRange(period, todayIn(user?.timezone));

  const [stats, people, teams, mine] = await Promise.all([
    globalStats(),
    tab === "people" ? peopleLeaderboard({ range, country }) : Promise.resolve([] as PersonRow[]),
    tab === "teams" ? teamLeaderboard({ range, sort }) : Promise.resolve([] as TeamRow[]),
    user?.onboarded && tab === "people" ? myRank(user.id, range, country) : Promise.resolve(null),
  ]);

  const href = (p: Partial<SP>) => {
    const next = { tab, period, country: country ?? undefined, sort, ...p };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/leaderboard?${qs}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Leaderboard</h1>
          <p className="muted mt-1">
            {compact(stats?.people ?? 0)} walkers · {stats?.countries ?? 0} countries · {earthLaps(stats?.steps ?? 0)} around the Earth 🌍
          </p>
        </div>
        <div className="seg">
          <Link href={href({ tab: "people" })} aria-current={tab === "people" ? "page" : undefined}>🙋 People</Link>
          <Link href={href({ tab: "teams" })} aria-current={tab === "teams" ? "page" : undefined}>🛡️ Teams</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="seg">
          {(["today", "week", "all"] as Period[]).map((p) => (
            <Link key={p} href={href({ period: p })} aria-current={period === p ? "page" : undefined}>
              {p === "today" ? "Today" : p === "week" ? "7 days" : "All month"}
            </Link>
          ))}
        </div>
        {tab === "people" ? (
          <CountryFilter value={country ?? ""} countries={COUNTRIES} />
        ) : (
          <div className="seg">
            <Link href={href({ sort: "total" })} aria-current={sort === "total" ? "page" : undefined}>Total</Link>
            <Link href={href({ sort: "avg" })} aria-current={sort === "avg" ? "page" : undefined}>Per member</Link>
          </div>
        )}
      </div>

      {tab === "people" ? (
        <People rows={people} meId={user?.id} mine={mine} country={country} />
      ) : (
        <Teams rows={teams} myTeam={user?.team_id ?? null} sort={sort} />
      )}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function People({ rows, meId, mine, country }: { rows: PersonRow[]; meId?: string; mine: { rank: number; points: number; of: number } | null; country: string | null }) {
  if (!rows.length) return <Empty text={country ? `No one from ${countryName(country)} has scored yet. Be the first!` : "No scores yet for this period. Lace up!"} />;
  const podium = rows.slice(0, 3);
  return (
    <>
      <Podium items={podium.map((r) => ({ key: r.id, rank: r.rank, top: r.avatar, title: r.display_name, sub: `${flag(r.country)} ${r.team_name ? r.team_emoji + " " + r.team_name : ""}`, points: r.points, me: r.id === meId }))} />
      {mine && !rows.some((r) => r.id === meId && r.rank <= 3) && (
        <div className="card flex items-center gap-3 !py-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--card))" }}>
          <span className="font-bold">You</span>
          <span className="muted text-sm">are ranked</span>
          <span className="num font-display text-2xl font-extrabold">#{mine.rank.toLocaleString()}</span>
          <span className="muted text-sm">of {mine.of.toLocaleString()}</span>
          <span className="num ml-auto font-bold">{mine.points.toLocaleString()} pts</span>
        </div>
      )}
      <div className="card !p-0">
        <ol className="divide-y hairline">
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 sm:px-6 ${r.id === meId ? "bg-pumpkin-500/10" : ""}`}>
              <RankBadge rank={r.rank} />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pumpkin-100 text-xl dark:bg-night-line">{r.avatar}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {r.display_name} <span title={countryName(r.country)}>{r.country ? flag(r.country) : ""}</span>
                  {r.id === meId && <span className="chip ml-2 !py-0">you</span>}
                </div>
                <div className="muted truncate text-xs">
                  {compact(r.steps)} steps{r.ex_minutes ? ` · ${r.ex_minutes} workout min` : ""}
                  {r.team_name ? ` · ${r.team_emoji} ${r.team_name}` : ""}
                </div>
              </div>
              <div className="num text-right font-display text-lg font-extrabold">{r.points.toLocaleString()}</div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function Teams({ rows, myTeam, sort }: { rows: TeamRow[]; myTeam: string | null; sort: "total" | "avg" }) {
  if (!rows.length) return <Empty text="No teams on the board yet." cta={{ href: "/teams", label: "Start the first team" }} />;
  const val = (r: TeamRow) => Math.round(sort === "avg" ? r.avg_points : r.points);
  return (
    <>
      <Podium items={rows.slice(0, 3).map((r) => ({ key: r.id, rank: r.rank, top: r.emoji, title: r.name, sub: `${r.members} member${r.members === 1 ? "" : "s"}`, points: val(r), me: r.id === myTeam, gradient: teamGradient(r.color) }))} />
      <div className="card !p-0">
        <ol className="divide-y hairline">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/teams/${r.id}`} className={`flex items-center gap-3 px-4 py-3 transition hover:bg-pumpkin-500/5 sm:px-6 ${r.id === myTeam ? "bg-pumpkin-500/10" : ""}`}>
                <RankBadge rank={r.rank} />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xl text-white shadow-sm" style={{ background: teamGradient(r.color) }}>{r.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {r.name} {r.id === myTeam && <span className="chip ml-1 !py-0">your team</span>}
                  </div>
                  <div className="muted truncate text-xs">
                    {r.members} member{r.members === 1 ? "" : "s"} · {compact(r.steps)} steps · {compact(sort === "avg" ? r.points : r.avg_points)} {sort === "avg" ? "total" : "per member"}
                  </div>
                </div>
                <div className="num text-right font-display text-lg font-extrabold">{val(r).toLocaleString()}</div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

type PodiumItem = { key: string; rank: number; top: string; title: string; sub: string; points: number; me: boolean; gradient?: string };

function Podium({ items }: { items: PodiumItem[] }) {
  // Visual order: 2nd, 1st, 3rd
  const order = [items[1], items[0], items[2]].filter(Boolean) as PodiumItem[];
  const heights: Record<number, string> = { 0: "h-28", 1: "h-20", 2: "h-14" };
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((it) => {
        const idx = items.indexOf(it);
        return (
          <div key={it.key} className="flex flex-col items-center text-center">
            <div
              className={`grid place-items-center rounded-full text-3xl shadow-card ${idx === 0 ? "h-20 w-20 sm:h-24 sm:w-24 sm:text-5xl" : "h-16 w-16 sm:h-20 sm:w-20 sm:text-4xl"} ${it.me ? "ring-4 ring-pumpkin-400" : ""}`}
              style={{ background: it.gradient ?? "var(--card)" }}
            >
              {it.top}
            </div>
            <div className="mt-2 w-full truncate px-1 text-sm font-bold sm:text-base">{it.title}</div>
            <div className="muted w-full truncate px-1 text-xs">{it.sub}</div>
            <div className="num mt-1 font-display text-base font-extrabold sm:text-xl">{compact(it.points)}</div>
            <div
              className={`mt-2 grid w-full place-items-start justify-center rounded-t-2xl pt-2 text-2xl ${heights[idx]}`}
              style={{ background: idx === 0 ? "linear-gradient(180deg,#f7d27a,#d99a12)" : idx === 1 ? "linear-gradient(180deg,#e7e2dc,#b9b0a6)" : "linear-gradient(180deg,#f0b48a,#b86b3a)" }}
            >
              {MEDALS[idx]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`num w-8 shrink-0 text-center font-display text-lg font-extrabold ${rank <= 3 ? "" : "muted"}`}>
      {rank <= 3 ? MEDALS[rank - 1] : rank}
    </span>
  );
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="card py-14 text-center">
      <div className="text-5xl">🍂</div>
      <p className="muted mt-3">{text}</p>
      {cta && <Link href={cta.href} className="btn-primary mt-5">{cta.label}</Link>}
    </div>
  );
}
