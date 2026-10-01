import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ingestGarminDailies } from "@/lib/connectors";
import { q } from "@/lib/db";

// Garmin Health API push endpoint. Configure in the Garmin developer portal:
//   Dailies → https://<your-domain>/api/webhooks/garmin
//   Deregistrations / User permissions → same URL.
export async function POST(req: Request) {
  const expected = process.env.GARMIN_CLIENT_ID ?? "";
  const got = req.headers.get("garmin-client-id") ?? "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  // Users who disconnect from Garmin's side.
  const dereg = (payload.deregistrations as { userId?: string }[] | undefined) ?? [];
  for (const d of dereg) {
    if (d.userId) await q("DELETE FROM connections WHERE provider = 'garmin' AND external_user_id = $1", [d.userId]);
  }
  const written = await ingestGarminDailies(payload);
  return NextResponse.json({ ok: true, written });
}
