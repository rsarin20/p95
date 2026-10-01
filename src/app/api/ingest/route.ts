import { NextResponse } from "next/server";
import { canLogDay, isDay, todayIn } from "@/lib/dates";
import { sha256 } from "@/lib/crypto";
import { q1 } from "@/lib/db";
import { recordSteps } from "@/lib/entries";
import { parseCount } from "@/lib/validate";

/**
 * Personal-token step upload, used by the Apple Health iOS Shortcut (and any
 * other device that can make an HTTP request).
 *
 *   POST /api/ingest
 *   Authorization: Bearer wt_xxx
 *   { "steps": 8421, "date": "2026-10-03" }   // date optional → user's today
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("wt_")) return NextResponse.json({ error: "Missing or invalid token." }, { status: 401 });

  const user = await q1<{ id: string; timezone: string; onboarded: boolean }>(
    "SELECT id, timezone, onboarded FROM users WHERE ingest_token_hash = $1",
    [sha256(token)],
  );
  if (!user) return NextResponse.json({ error: "Token not recognised. Generate a new one in the app." }, { status: 401 });

  let body: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = await req.json();
    else body = Object.fromEntries((await req.formData()).entries());
  } catch {
    return NextResponse.json({ error: "Send JSON like {\"steps\": 1234}." }, { status: 400 });
  }

  const steps = parseCount(body.steps);
  if (steps === null) return NextResponse.json({ error: "`steps` must be a number." }, { status: 400 });
  const today = todayIn(user.timezone);
  const rawDate = typeof body.date === "string" ? body.date.trim().slice(0, 10) : "";
  const day = isDay(rawDate) ? rawDate : today;
  const check = canLogDay(day, today);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 422 });

  const saved = await recordSteps(user.id, day, "apple_health", steps);
  return NextResponse.json({ ok: true, day, steps: saved, message: `Walktober: ${saved.toLocaleString()} steps saved for ${day} 🍂` });
}
