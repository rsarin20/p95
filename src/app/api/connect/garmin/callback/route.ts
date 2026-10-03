import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGarminCode, garminUserId, saveConnection } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", req.url));
  const jar = await cookies();
  const expected = jar.get("wt_garmin_state")?.value;
  const verifier = jar.get("wt_garmin_verifier")?.value;
  jar.delete("wt_garmin_state");
  jar.delete("wt_garmin_verifier");
  const code = url.searchParams.get("code");
  if (!code || !verifier || !expected || url.searchParams.get("state") !== expected)
    return NextResponse.redirect(new URL("/connect?error=garmin_denied", req.url));
  try {
    const tok = await exchangeGarminCode(code, verifier);
    const garminId = await garminUserId(tok.access_token);
    if (!garminId) throw new Error("no user id");
    await saveConnection(user.id, "garmin", tok, garminId);
    return NextResponse.redirect(new URL("/connect?connected=garmin", req.url));
  } catch {
    return NextResponse.redirect(new URL("/connect?error=garmin_failed", req.url));
  }
}
