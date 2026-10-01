import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { randomToken } from "@/lib/crypto";
import { GARMIN } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", req.url));
  if (!GARMIN.enabled()) return NextResponse.redirect(new URL("/connect?error=garmin_unavailable", req.url));
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomToken(16);
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/", maxAge: 600 };
  jar.set("wt_garmin_state", state, opts);
  jar.set("wt_garmin_verifier", verifier, opts);
  const url = new URL(GARMIN.authUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GARMIN_CLIENT_ID!,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: GARMIN.redirectUri(),
    state,
  }).toString();
  return NextResponse.redirect(url);
}
