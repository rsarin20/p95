import { CHALLENGE } from "./config";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for "now" in the given IANA time zone (falls back to UTC). */
export function todayIn(timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !DAY_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function clampToChallenge(day: string): string {
  if (day < CHALLENGE.start) return CHALLENGE.start;
  if (day > CHALLENGE.end) return CHALLENGE.end;
  return day;
}

/**
 * Can this user log data for `day`? It must fall inside the challenge, must not
 * be in the user's future, and the challenge must not have closed (end + grace).
 */
export function canLogDay(day: string, userToday: string): { ok: true } | { ok: false; reason: string } {
  if (!isDay(day)) return { ok: false, reason: "That date doesn't look right." };
  if (day < CHALLENGE.start || day > CHALLENGE.end)
    return { ok: false, reason: `Only days between ${fmtDay(CHALLENGE.start)} and ${fmtDay(CHALLENGE.end)} count.` };
  // Allow +1 day of slack for people near the date line whose server-side "today" lags.
  if (day > addDays(userToday, 1)) return { ok: false, reason: "You can't log the future (yet)." };
  if (userToday > addDays(CHALLENGE.end, CHALLENGE.graceDays))
    return { ok: false, reason: "The challenge is closed — results are final." };
  return { ok: true };
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function challengeDayNumber(day: string): number {
  return daysBetween(CHALLENGE.start, day) + 1;
}

export function challengeLength(): number {
  return daysBetween(CHALLENGE.start, CHALLENGE.end) + 1;
}
