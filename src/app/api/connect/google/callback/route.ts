import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, saveConnection, syncGoogle } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", req.url));
  const jar = await cookies();
  const expected = jar.get("wt_google_state")?.value;
  jar.delete("wt_google_state");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected)
    return NextResponse.redirect(new URL("/connect?error=google_denied", req.url));
  try {
    const tok = await exchangeGoogleCode(code);
    await saveConnection(user.id, "google", tok, null);
    await syncGoogle(user.id, user.timezone).catch(() => 0);
    return NextResponse.redirect(new URL("/connect?connected=google", req.url));
  } catch {
    return NextResponse.redirect(new URL("/connect?error=google_failed", req.url));
  }
}
