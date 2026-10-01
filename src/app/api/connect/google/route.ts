import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { GOOGLE_HEALTH } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", req.url));
  if (!GOOGLE_HEALTH.enabled()) return NextResponse.redirect(new URL("/connect?error=google_unavailable", req.url));
  const state = randomToken(16);
  (await cookies()).set("wt_google_state", state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
  const url = new URL(GOOGLE_HEALTH.authUrl);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_HEALTH.redirectUri(),
    response_type: "code",
    scope: GOOGLE_HEALTH.scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
