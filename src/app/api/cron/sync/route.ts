import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { syncGoogle } from "@/lib/connectors";

export const maxDuration = 300;

/** Nightly safety-net sync for everyone connected to Google (Vercel Cron). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await q<{ user_id: string; timezone: string }>(
    `SELECT c.user_id, u.timezone FROM connections c JOIN users u ON u.id = c.user_id
     WHERE c.provider = 'google' ORDER BY c.last_sync_at NULLS FIRST LIMIT 500`,
  );
  let ok = 0;
  for (const r of rows) {
    try {
      await syncGoogle(r.user_id, r.timezone);
      ok++;
    } catch {
      /* recorded on the connection row */
    }
  }
  return NextResponse.json({ ok: true, synced: ok, of: rows.length });
}
