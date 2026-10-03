import "server-only";
import { CHALLENGE, SCORING, TEAM_MAX_MEMBERS } from "./config";
import { EXERCISE_POINTS_SQL } from "./scoring";
import { q, q1 } from "./db";

/**
 * Per-user-per-day score rows between $1 and $2 (inclusive), as a SQL CTE body.
 * Mirrors scoreDay(): highest reading across sources (capped) + exercise + goal bonus.
 */
const DAILY_SCORES_CTE = `
  day_steps AS (
    SELECT user_id, day, LEAST(MAX(steps), ${SCORING.maxStepsPerDay}) AS steps
    FROM step_entries WHERE day BETWEEN $1::date AND $2::date
    GROUP BY user_id, day
  ),
  day_ex AS (
    SELECT user_id, day, SUM(${EXERCISE_POINTS_SQL}) AS ex_points, SUM(minutes) AS ex_minutes
    FROM activities WHERE day BETWEEN $1::date AND $2::date
    GROUP BY user_id, day
  ),
  daily AS (
    SELECT COALESCE(s.user_id, e.user_id) AS user_id,
           COALESCE(s.day, e.day) AS day,
           COALESCE(s.steps, 0) AS steps,
           COALESCE(e.ex_points, 0) AS ex_points,
           COALESCE(e.ex_minutes, 0) AS ex_minutes,
           CASE WHEN COALESCE(s.steps, 0) >= ${SCORING.dailyGoalSteps} THEN ${SCORING.dailyGoalBonus} ELSE 0 END AS bonus
    FROM day_steps s FULL OUTER JOIN day_ex e ON s.user_id = e.user_id AND s.day = e.day
  ),
  totals AS (
    SELECT user_id,
           SUM(steps)::float8 AS steps,
           SUM(ex_minutes)::float8 AS ex_minutes,
           SUM(steps + ex_points + bonus)::float8 AS points,
           COUNT(*)::int AS active_days
    FROM daily GROUP BY user_id
  )`;

export type Period = "today" | "week" | "all";

export function periodRange(period: Period, today: string): [string, string] {
  const end = today > CHALLENGE.end ? CHALLENGE.end : today;
  if (period === "today") return [end, end];
  if (period === "week") {
    const d = new Date(end + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6);
    const start = d.toISOString().slice(0, 10);
    return [start < CHALLENGE.start ? CHALLENGE.start : start, end];
  }
  return [CHALLENGE.start, CHALLENGE.end];
}

export type PersonRow = {
  rank: number;
  id: string;
  display_name: string;
  avatar: string;
  country: string | null;
  team_name: string | null;
  team_emoji: string | null;
  steps: number;
  ex_minutes: number;
  points: number;
  active_days: number;
};

export async function peopleLeaderboard(opts: {
  range: [string, string];
  country?: string | null;
  limit?: number;
}): Promise<PersonRow[]> {
  const params: unknown[] = [opts.range[0], opts.range[1], opts.limit ?? 100];
  let where = "u.onboarded";
  if (opts.country) {
    params.push(opts.country);
    where += ` AND u.country = $${params.length}`;
  }
  return q<PersonRow>(
    `WITH ${DAILY_SCORES_CTE}
     SELECT RANK() OVER (ORDER BY t.points DESC)::int AS rank,
            u.id, u.display_name, u.avatar, u.country, tm.name AS team_name, tm.emoji AS team_emoji,
            t.steps, t.ex_minutes, t.points, t.active_days
     FROM totals t JOIN users u ON u.id = t.user_id LEFT JOIN teams tm ON tm.id = u.team_id
     WHERE ${where} AND t.points > 0
     ORDER BY t.points DESC, u.display_name ASC
     LIMIT $3`,
    params,
  );
}

/** The viewer's own rank, so they can see where they stand even outside the top 100. */
export async function myRank(userId: string, range: [string, string], country?: string | null) {
  const params: unknown[] = [range[0], range[1], userId];
  let where = "u.onboarded";
  if (country) {
    params.push(country);
    where += ` AND u.country = $${params.length}`;
  }
  return q1<{ rank: number; points: number; of: number }>(
    `WITH ${DAILY_SCORES_CTE},
     ranked AS (
       SELECT t.user_id, t.points, RANK() OVER (ORDER BY t.points DESC)::int AS rank, COUNT(*) OVER ()::int AS of
       FROM totals t JOIN users u ON u.id = t.user_id WHERE ${where} AND t.points > 0
     )
     SELECT rank, points, of FROM ranked WHERE user_id = $3`,
    params,
  );
}

export type TeamRow = {
  rank: number;
  id: string;
  name: string;
  emoji: string;
  color: string;
  motto: string | null;
  members: number;
  points: number;
  steps: number;
  avg_points: number;
};

export async function teamLeaderboard(opts: { range: [string, string]; sort?: "total" | "avg"; limit?: number }) {
  const order = opts.sort === "avg" ? "avg_points" : "points";
  return q<TeamRow>(
    `WITH ${DAILY_SCORES_CTE},
     team_totals AS (
       SELECT tm.id, tm.name, tm.emoji, tm.color, tm.motto,
              COUNT(u.id)::int AS members,
              COALESCE(SUM(t.points), 0)::float8 AS points,
              COALESCE(SUM(t.steps), 0)::float8 AS steps
       FROM teams tm
       LEFT JOIN users u ON u.team_id = tm.id
       LEFT JOIN totals t ON t.user_id = u.id
       GROUP BY tm.id
     )
     SELECT RANK() OVER (ORDER BY ${order} DESC)::int AS rank, *
     FROM (SELECT *, CASE WHEN members > 0 THEN points / members ELSE 0 END AS avg_points FROM team_totals) x
     WHERE members > 0
     ORDER BY ${order} DESC, name ASC
     LIMIT $3`,
    [opts.range[0], opts.range[1], opts.limit ?? 100],
  );
}

export type DayRow = { day: string; steps: number; ex_points: number; ex_minutes: number; bonus: number; points: number };

/** Daily breakdown for one user across the whole challenge. */
export async function userDays(userId: string): Promise<DayRow[]> {
  return q<DayRow>(
    `WITH ${DAILY_SCORES_CTE}
     SELECT day::text AS day, steps::int, ex_points::int, ex_minutes::int, bonus::int,
            (steps + ex_points + bonus)::int AS points
     FROM daily WHERE user_id = $3 ORDER BY day`,
    [CHALLENGE.start, CHALLENGE.end, userId],
  );
}

export async function dayDetail(userId: string, day: string) {
  const [entries, activities] = await Promise.all([
    q<{ source: string; steps: number; updated_at: string }>(
      "SELECT source, steps, updated_at::text FROM step_entries WHERE user_id = $1 AND day = $2 ORDER BY steps DESC",
      [userId, day],
    ),
    q<{ id: number; intensity: "light" | "moderate" | "heavy"; minutes: number; label: string | null }>(
      "SELECT id::int, intensity, minutes, label FROM activities WHERE user_id = $1 AND day = $2 ORDER BY id",
      [userId, day],
    ),
  ]);
  return { entries, activities };
}

export type Team = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  motto: string | null;
  invite_code: string;
  captain_id: string | null;
  members: number;
};

export async function getTeam(id: string) {
  return q1<Team>(
    `SELECT t.*, (SELECT COUNT(*)::int FROM users u WHERE u.team_id = t.id) AS members FROM teams t WHERE t.id = $1`,
    [id],
  );
}

export async function teamMembers(teamId: string) {
  return q<PersonRow & { is_captain: boolean }>(
    `WITH ${DAILY_SCORES_CTE}
     SELECT RANK() OVER (ORDER BY COALESCE(t.points, 0) DESC)::int AS rank,
            u.id, u.display_name, u.avatar, u.country, NULL AS team_name, NULL AS team_emoji,
            COALESCE(t.steps, 0) AS steps, COALESCE(t.ex_minutes, 0) AS ex_minutes,
            COALESCE(t.points, 0) AS points, COALESCE(t.active_days, 0) AS active_days,
            (tm.captain_id = u.id) AS is_captain
     FROM users u JOIN teams tm ON tm.id = u.team_id LEFT JOIN totals t ON t.user_id = u.id
     WHERE u.team_id = $3
     ORDER BY points DESC, u.display_name`,
    [CHALLENGE.start, CHALLENGE.end, teamId],
  );
}

export async function openTeams(limit = 30) {
  return q<Team>(
    `SELECT t.*, COUNT(u.id)::int AS members FROM teams t LEFT JOIN users u ON u.team_id = t.id
     GROUP BY t.id HAVING COUNT(u.id) < $1 ORDER BY COUNT(u.id) DESC, t.created_at DESC LIMIT $2`,
    [TEAM_MAX_MEMBERS, limit],
  );
}

export async function globalStats() {
  return q1<{ people: number; steps: number; teams: number; countries: number }>(
    `SELECT (SELECT COUNT(*)::int FROM users WHERE onboarded) AS people,
            (SELECT COALESCE(SUM(s), 0)::float8 FROM (
               SELECT LEAST(MAX(steps), ${SCORING.maxStepsPerDay}) AS s FROM step_entries
               WHERE day BETWEEN $1::date AND $2::date GROUP BY user_id, day) x) AS steps,
            (SELECT COUNT(*)::int FROM teams) AS teams,
            (SELECT COUNT(DISTINCT country)::int FROM users WHERE onboarded AND country IS NOT NULL) AS countries`,
    [CHALLENGE.start, CHALLENGE.end],
  );
}

export async function userConnections(userId: string) {
  return q<{ provider: string; last_sync_at: string | null; last_error: string | null }>(
    "SELECT provider, last_sync_at::text, last_error FROM connections WHERE user_id = $1",
    [userId],
  );
}
