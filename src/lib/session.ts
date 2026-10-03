import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getAuthOptions } from "./auth";
import { q1 } from "./db";

export type User = {
  id: string;
  email: string | null;
  provider_name: string | null;
  provider_image: string | null;
  display_name: string | null;
  name_mode: "real" | "nickname";
  avatar: string;
  country: string | null;
  timezone: string;
  team_id: string | null;
  onboarded: boolean;
  has_token: boolean;
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getServerSession(await getAuthOptions());
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  return q1<User>(
    `SELECT id, email, provider_name, provider_image, display_name, name_mode, avatar, country, timezone,
            team_id, onboarded, (ingest_token_hash IS NOT NULL) AS has_token
     FROM users WHERE id = $1`,
    [id],
  );
});

/** For pages that need a signed-in, onboarded user. */
export async function requireUser(opts: { allowNotOnboarded?: boolean } = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.onboarded && !opts.allowNotOnboarded) redirect("/onboarding");
  return user;
}
