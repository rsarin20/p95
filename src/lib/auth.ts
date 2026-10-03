import "server-only";
import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { SignJWT, importPKCS8 } from "jose";
import { randomUUID } from "node:crypto";
import { q, q1 } from "./db";

export const demoLoginEnabled = () =>
  process.env.ALLOW_DEMO_LOGIN === "true" || process.env.NODE_ENV !== "production";

export function enabledProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    facebook: Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
    apple: Boolean(
      process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY,
    ),
    demo: demoLoginEnabled(),
  };
}

// Apple's "client secret" is a short-lived JWT we sign with our .p8 key.
let appleSecret: { value: string; exp: number } | null = null;
async function appleClientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (appleSecret && appleSecret.exp - now > 86_400) return appleSecret.value;
  const pem = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  const exp = now + 60 * 60 * 24 * 150; // Apple allows up to 6 months.
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setAudience("https://appleid.apple.com")
    .setSubject(process.env.APPLE_ID!)
    .sign(key);
  appleSecret = { value, exp };
  return value;
}

/** Find-or-create our user for an identity-provider account. Returns our user id. */
export async function upsertUserFromAccount(
  provider: string,
  providerAccountId: string,
  profile: { name?: string | null; email?: string | null; image?: string | null },
): Promise<string> {
  const existing = await q1<{ user_id: string }>(
    "SELECT user_id FROM accounts WHERE provider = $1 AND provider_account_id = $2",
    [provider, providerAccountId],
  );
  if (existing) {
    // Keep provider-supplied details fresh, but never overwrite the chosen display name.
    await q(
      `UPDATE users SET provider_name = COALESCE($2, provider_name), email = COALESCE($3, email),
         provider_image = COALESCE($4, provider_image) WHERE id = $1`,
      [existing.user_id, profile.name ?? null, profile.email ?? null, profile.image ?? null],
    );
    return existing.user_id;
  }
  const id = randomUUID();
  await q("INSERT INTO users (id, provider_name, email, provider_image) VALUES ($1, $2, $3, $4)", [
    id,
    profile.name?.slice(0, 80) ?? null,
    profile.email ?? null,
    profile.image ?? null,
  ]);
  await q("INSERT INTO accounts (provider, provider_account_id, user_id) VALUES ($1, $2, $3)", [
    provider,
    providerAccountId,
    id,
  ]);
  return id;
}

let cached: NextAuthOptions | null = null;

export async function getAuthOptions(): Promise<NextAuthOptions> {
  if (cached) return cached;
  const on = enabledProviders();
  const providers: Provider[] = [];
  if (on.google)
    providers.push(
      GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }),
    );
  if (on.facebook)
    providers.push(
      FacebookProvider({ clientId: process.env.FACEBOOK_CLIENT_ID!, clientSecret: process.env.FACEBOOK_CLIENT_SECRET! }),
    );
  if (on.apple)
    providers.push(AppleProvider({ clientId: process.env.APPLE_ID!, clientSecret: await appleClientSecret() }));
  if (on.demo)
    providers.push(
      CredentialsProvider({
        id: "demo",
        name: "Demo",
        credentials: { name: { label: "Name", type: "text" } },
        async authorize(creds) {
          const name = String(creds?.name ?? "").trim().slice(0, 40);
          if (name.length < 2) return null;
          const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const id = await upsertUserFromAccount("demo", key, { name });
          return { id, name };
        },
      }),
    );

  // Mirror next-auth's own rule for secure cookies (based on the public base URL).
  const base = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const secure = base.startsWith("https://");
  // Apple returns via a cross-site form POST, so the state/PKCE/nonce cookies
  // must be SameSite=None or the browser won't send them back.
  const crossSite = (name: string) => ({
    name: `${secure ? "__Secure-" : ""}next-auth.${name}`,
    options: { httpOnly: true, sameSite: secure ? ("none" as const) : ("lax" as const), path: "/", secure },
  });

  cached = {
    providers,
    secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV !== "production" ? "walktober-dev-secret" : undefined),
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
    pages: { signIn: "/signin", error: "/signin" },
    cookies: {
      state: crossSite("state"),
      pkceCodeVerifier: crossSite("pkce.code_verifier"),
      nonce: crossSite("nonce"),
    },
    callbacks: {
      async jwt({ token, account, user, profile }) {
        if (account && account.provider !== "demo") {
          const p = profile as { name?: string; email?: string; picture?: string } | undefined;
          token.uid = await upsertUserFromAccount(account.provider, account.providerAccountId, {
            name: user?.name ?? p?.name ?? null,
            email: user?.email ?? p?.email ?? null,
            image: user?.image ?? p?.picture ?? null,
          });
        } else if (account?.provider === "demo" && user) {
          token.uid = user.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.uid) (session.user as { id?: string }).id = token.uid as string;
        return session;
      },
    },
  };
  return cached;
}
