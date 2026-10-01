import "server-only";
import { addDays, todayIn } from "./dates";
import { CHALLENGE } from "./config";
import { q, q1 } from "./db";
import { seal, unseal } from "./crypto";
import { recordSteps } from "./entries";

/*
 * Fitness connectors.
 *
 * Apple Health  — no cloud API exists; HealthKit data lives on the iPhone. We
 *                 accept pushes from an iOS Shortcut via /api/ingest (personal token).
 * Google        — Google Fit's REST API closed to new apps in 2024 and shuts down
 *                 end-2026. Its successor for cloud apps is the Google Health API
 *                 (health.googleapis.com, v4), which also carries Fitbit/Pixel data.
 * Garmin        — Garmin Connect Developer Program (Health API, OAuth 2.0 + PKCE).
 *                 Garmin *pushes* daily summaries to our webhook.
 */

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export const GOOGLE_HEALTH = {
  enabled: () =>
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_HEALTH_ENABLED === "true"),
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scope: "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  apiBase: process.env.GOOGLE_HEALTH_API_BASE || "https://health.googleapis.com/v4",
  redirectUri: () => `${appBaseUrl()}/api/connect/google/callback`,
};

export const GARMIN = {
  enabled: () => Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET),
  authUrl: process.env.GARMIN_AUTH_URL || "https://connect.garmin.com/oauth2Confirm",
  tokenUrl: process.env.GARMIN_TOKEN_URL || "https://diauth.garmin.com/di-oauth2-service/oauth/token",
  userIdUrl: "https://apis.garmin.com/wellness-api/rest/user/id",
  deregisterUrl: "https://apis.garmin.com/wellness-api/rest/user/registration",
  redirectUri: () => `${appBaseUrl()}/api/connect/garmin/callback`,
};

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export async function saveConnection(
  userId: string,
  provider: "google" | "garmin",
  tok: TokenResponse,
  externalUserId: string | null,
) {
  await q(
    `INSERT INTO connections (user_id, provider, external_user_id, access_token, refresh_token, expires_at, last_error)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     ON CONFLICT (user_id, provider) DO UPDATE SET external_user_id = COALESCE(EXCLUDED.external_user_id, connections.external_user_id),
       access_token = EXCLUDED.access_token, refresh_token = COALESCE(EXCLUDED.refresh_token, connections.refresh_token),
       expires_at = EXCLUDED.expires_at, last_error = NULL`,
    [
      userId,
      provider,
      externalUserId,
      seal(tok.access_token),
      seal(tok.refresh_token ?? null),
      tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    ],
  );
}

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  return res.json();
}

export function exchangeGoogleCode(code: string) {
  return postForm(GOOGLE_HEALTH.tokenUrl, {
    grant_type: "authorization_code",
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: GOOGLE_HEALTH.redirectUri(),
  });
}

export function exchangeGarminCode(code: string, verifier: string) {
  return postForm(GARMIN.tokenUrl, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: process.env.GARMIN_CLIENT_ID!,
    client_secret: process.env.GARMIN_CLIENT_SECRET!,
    redirect_uri: GARMIN.redirectUri(),
  });
}

export async function garminUserId(accessToken: string): Promise<string | null> {
  const res = await fetch(GARMIN.userIdUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { userId?: string };
  return j.userId ?? null;
}

async function googleAccessToken(userId: string): Promise<string> {
  const c = await q1<{ access_token: string; refresh_token: string | null; expires_at: string | null }>(
    "SELECT access_token, refresh_token, expires_at::text FROM connections WHERE user_id = $1 AND provider = 'google'",
    [userId],
  );
  if (!c) throw new Error("Google is not connected.");
  const fresh = c.expires_at && Date.parse(c.expires_at) - Date.now() > 60_000;
  if (fresh) return unseal(c.access_token)!;
  const refresh = unseal(c.refresh_token);
  if (!refresh) throw new Error("Google connection expired — please reconnect.");
  const tok = await postForm(GOOGLE_HEALTH.tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  });
  await saveConnection(userId, "google", tok, null);
  return tok.access_token;
}

const civil = (day: string) => {
  const [year, month, d] = day.split("-").map(Number);
  return { date: { year, month, day: d } };
};

/** Pull up to the last 7 days of daily step totals from the Google Health API. */
export async function syncGoogle(userId: string, timeZone: string): Promise<number> {
  const today = todayIn(timeZone);
  const end = today > CHALLENGE.end ? CHALLENGE.end : today;
  let start = addDays(end, -6);
  if (start < CHALLENGE.start) start = CHALLENGE.start;
  if (end < start) return 0;
  try {
    const token = await googleAccessToken(userId);
    const res = await fetch(`${GOOGLE_HEALTH.apiBase}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: { start: civil(start), end: civil(addDays(end, 1)) }, windowSizeDays: 1 }),
    });
    if (!res.ok) throw new Error(`Google Health API returned ${res.status}`);
    const days = parseGoogleRollup(await res.json());
    let n = 0;
    for (const { day, steps } of days) {
      if (day >= start && day <= end) {
        await recordSteps(userId, day, "google", steps);
        n++;
      }
    }
    await q("UPDATE connections SET last_sync_at = now(), last_error = NULL WHERE user_id = $1 AND provider = 'google'", [
      userId,
    ]);
    return n;
  } catch (e) {
    await q("UPDATE connections SET last_error = $2 WHERE user_id = $1 AND provider = 'google'", [
      userId,
      (e as Error).message.slice(0, 200),
    ]);
    throw e;
  }
}

/**
 * Defensive parser for dailyRollUp output. Each data point carries a civil start
 * date and a steps rollup whose `countSum` is the day's total (often as a string).
 */
export function parseGoogleRollup(json: unknown): { day: string; steps: number }[] {
  const points = (json as { rollupDataPoints?: unknown[]; dataPoints?: unknown[] })?.rollupDataPoints ??
    (json as { dataPoints?: unknown[] })?.dataPoints ?? [];
  const out: { day: string; steps: number }[] = [];
  for (const p of points as Record<string, unknown>[]) {
    const day = findDate(p);
    const steps = findCountSum(p);
    if (day && steps !== null) out.push({ day, steps });
  }
  return out;
}

function findDate(o: unknown): string | null {
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  if (typeof rec.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(rec.date)) return rec.date.slice(0, 10);
  const d = rec.date as { year?: number; month?: number; day?: number } | undefined;
  if (d && typeof d === "object" && d.year && d.month && d.day)
    return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  for (const k of ["civilStartTime", "startTime", "start", "interval", "civilInterval"]) {
    const r = findDate(rec[k]);
    if (r) return r;
  }
  return null;
}

function findCountSum(o: unknown): number | null {
  if (!o || typeof o !== "object") return null;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (k === "countSum") {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    if (v && typeof v === "object") {
      const r = findCountSum(v);
      if (r !== null) return r;
    }
  }
  return null;
}

/** Garmin "dailies" push payload → step entries. Returns rows written. */
export async function ingestGarminDailies(payload: unknown): Promise<number> {
  const dailies = (payload as { dailies?: { userId?: string; calendarDate?: string; steps?: number }[] })?.dailies ?? [];
  let n = 0;
  for (const d of dailies) {
    if (!d.userId || !d.calendarDate || typeof d.steps !== "number") continue;
    if (d.calendarDate < CHALLENGE.start || d.calendarDate > CHALLENGE.end) continue;
    const conn = await q1<{ user_id: string }>(
      "SELECT user_id FROM connections WHERE provider = 'garmin' AND external_user_id = $1",
      [d.userId],
    );
    if (!conn) continue;
    await recordSteps(conn.user_id, d.calendarDate, "garmin", d.steps);
    await q("UPDATE connections SET last_sync_at = now() WHERE user_id = $1 AND provider = 'garmin'", [conn.user_id]);
    n++;
  }
  return n;
}
