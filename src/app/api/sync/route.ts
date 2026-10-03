import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { q1 } from "@/lib/db";
import { syncGoogle } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/session";

/** Pull the latest steps from pull-based connectors (Google) for the signed-in user. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const google = await q1("SELECT 1 FROM connections WHERE user_id = $1 AND provider = 'google'", [user.id]);
  if (!google) return NextResponse.json({ ok: true, synced: 0 });
  try {
    const synced = await syncGoogle(user.id, user.timezone);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, synced });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
