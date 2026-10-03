"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { INTENSITIES, SCORING, TEAM_MAX_MEMBERS } from "@/lib/config";
import { canLogDay, isValidTimeZone, todayIn } from "@/lib/dates";
import { q, q1 } from "@/lib/db";
import { addActivity, clearSteps, deleteActivity, recordSteps } from "@/lib/entries";
import { inviteCode, randomToken, sha256 } from "@/lib/crypto";
import { getCurrentUser, requireUser } from "@/lib/session";
import { AVATARS, TEAM_COLORS, TEAM_EMOJIS, cleanName, isOneOf, parseCount } from "@/lib/validate";
import { COUNTRY_CODES } from "@/lib/countries";
import { safeNext } from "@/lib/next-path";

export type ActionState = { ok?: boolean; error?: string; message?: string; token?: string } | null;

const done = (message?: string): ActionState => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ---------- Profile ----------

export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const mode = form.get("name_mode") === "nickname" ? "nickname" : "real";
  const name = cleanName(mode === "nickname" ? form.get("nickname") : form.get("real_name"));
  if (!name.ok) return { error: name.error };

  const avatar = String(form.get("avatar") ?? "");
  const country = String(form.get("country") ?? "");
  const tz = String(form.get("timezone") ?? "");

  await q(
    `UPDATE users SET display_name = $2, name_mode = $3, avatar = $4, country = $5,
       timezone = COALESCE($6, timezone), onboarded = true WHERE id = $1`,
    [
      user.id,
      name.value,
      mode,
      isOneOf(avatar, AVATARS) ? avatar : user.avatar,
      COUNTRY_CODES.includes(country) ? country : null,
      tz && isValidTimeZone(tz) ? tz : null,
    ],
  );
  if (!user.onboarded) {
    revalidatePath("/", "layout");
    redirect(safeNext(form.get("next")) ?? "/dashboard?welcome=1");
  }
  return done("Profile saved.");
}

export async function updateTimezone(tz: string) {
  const user = await getCurrentUser();
  if (!user || !isValidTimeZone(tz) || tz === user.timezone) return;
  await q("UPDATE users SET timezone = $2 WHERE id = $1", [user.id, tz]);
}

export async function deleteAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: 'Type DELETE to confirm.' };
  await leaveTeamInternal(user.id, user.team_id);
  await q("DELETE FROM users WHERE id = $1", [user.id]);
  return { ok: true, message: "deleted" };
}

// ---------- Steps & exercise ----------

export async function logSteps(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const day = String(form.get("day") ?? "");
  const check = canLogDay(day, todayIn(user.timezone));
  if (!check.ok) return { error: check.reason };
  const steps = parseCount(form.get("steps"));
  if (steps === null) return { error: "Enter a whole number of steps." };
  if (steps === 0) {
    await clearSteps(user.id, day, "manual");
    return done("Manual steps cleared.");
  }
  if (steps > SCORING.maxStepsPerDay)
    return { error: `The daily maximum is ${SCORING.maxStepsPerDay.toLocaleString()} steps.` };
  await recordSteps(user.id, day, "manual", steps);
  return done(`${steps.toLocaleString()} steps saved.`);
}

export async function logExercise(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const day = String(form.get("day") ?? "");
  const check = canLogDay(day, todayIn(user.timezone));
  if (!check.ok) return { error: check.reason };
  const intensity = form.get("intensity");
  if (!isOneOf(intensity, INTENSITIES)) return { error: "Pick an intensity." };
  const minutes = parseCount(form.get("minutes"));
  if (!minutes || minutes < 1 || minutes > SCORING.maxExerciseMinutesPerDay)
    return { error: `Minutes must be between 1 and ${SCORING.maxExerciseMinutesPerDay}.` };
  const labelRaw = String(form.get("label") ?? "").trim();
  const label = labelRaw ? cleanName(labelRaw, { min: 1, max: 40 }) : null;
  if (label && !label.ok) return { error: "Activity name: " + label.error };
  const res = await addActivity(user.id, day, intensity, minutes, label?.ok ? label.value : null);
  if (!res.ok) return { error: res.error };
  const pts = minutes * SCORING.exercisePointsPerMinute[intensity];
  return done(`+${pts.toLocaleString()} points logged.`);
}

export async function removeExercise(id: number) {
  const user = await requireUser();
  await deleteActivity(user.id, id);
  revalidatePath("/", "layout");
}

// ---------- Teams ----------

const nameKey = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

export async function createTeam(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.team_id) return { error: "Leave your current team before starting a new one." };
  const name = cleanName(form.get("name"), { min: 3, max: 32 });
  if (!name.ok) return { error: name.error };
  const key = nameKey(name.value);
  if (key.length < 2) return { error: "Team names need some letters or numbers." };
  const emoji = String(form.get("emoji") ?? "");
  const color = String(form.get("color") ?? "");
  const mottoRaw = String(form.get("motto") ?? "").trim();
  const motto = mottoRaw ? cleanName(mottoRaw, { min: 2, max: 80 }) : null;
  if (motto && !motto.ok) return { error: "Motto: " + motto.error };

  const taken = await q1("SELECT 1 FROM teams WHERE name_key = $1", [key]);
  if (taken) return { error: "That team name is taken — try another." };

  const id = randomUUID();
  try {
    await q(
      `INSERT INTO teams (id, name, name_key, emoji, color, motto, invite_code, captain_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        name.value,
        key,
        isOneOf(emoji, TEAM_EMOJIS) ? emoji : "🍂",
        isOneOf(color, TEAM_COLORS) ? color : "pumpkin",
        motto?.ok ? motto.value : null,
        inviteCode(),
        user.id,
      ],
    );
  } catch {
    return { error: "That team name is taken — try another." };
  }
  await q("UPDATE users SET team_id = $2 WHERE id = $1", [user.id, id]);
  revalidatePath("/", "layout");
  redirect(`/teams/${id}?created=1`);
}

export async function joinTeam(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.team_id) return { error: "You're already on a team. Leave it first to switch." };
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const team = await q1<{ id: string; name: string }>("SELECT id, name FROM teams WHERE invite_code = $1", [code]);
  if (!team) return { error: "No team found with that invite code." };
  const joined = await q1<{ id: string }>(
    `UPDATE users SET team_id = $2 WHERE id = $1 AND team_id IS NULL
       AND (SELECT COUNT(*) FROM users WHERE team_id = $2) < $3
     RETURNING id`,
    [user.id, team.id, TEAM_MAX_MEMBERS],
  );
  if (!joined) return { error: `${team.name} is full (${TEAM_MAX_MEMBERS} max).` };
  revalidatePath("/", "layout");
  redirect(`/teams/${team.id}?joined=1`);
}

async function leaveTeamInternal(userId: string, teamId: string | null) {
  if (!teamId) return;
  await q("UPDATE users SET team_id = NULL WHERE id = $1", [userId]);
  const team = await q1<{ captain_id: string | null }>("SELECT captain_id FROM teams WHERE id = $1", [teamId]);
  if (!team) return;
  const next = await q1<{ id: string }>("SELECT id FROM users WHERE team_id = $1 ORDER BY created_at LIMIT 1", [
    teamId,
  ]);
  if (!next) await q("DELETE FROM teams WHERE id = $1", [teamId]);
  else if (team.captain_id === userId) await q("UPDATE teams SET captain_id = $2 WHERE id = $1", [teamId, next.id]);
}

export async function leaveTeam() {
  const user = await requireUser();
  await leaveTeamInternal(user.id, user.team_id);
  revalidatePath("/", "layout");
  redirect("/teams");
}

export async function updateTeam(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const team = user.team_id
    ? await q1<{ id: string; captain_id: string }>("SELECT id, captain_id FROM teams WHERE id = $1", [user.team_id])
    : null;
  if (!team || team.captain_id !== user.id) return { error: "Only the team captain can edit the team." };
  const name = cleanName(form.get("name"), { min: 3, max: 32 });
  if (!name.ok) return { error: name.error };
  const key = nameKey(name.value);
  const clash = await q1("SELECT 1 FROM teams WHERE name_key = $1 AND id <> $2", [key, team.id]);
  if (clash) return { error: "That team name is taken — try another." };
  const emoji = String(form.get("emoji") ?? "");
  const color = String(form.get("color") ?? "");
  const mottoRaw = String(form.get("motto") ?? "").trim();
  const motto = mottoRaw ? cleanName(mottoRaw, { min: 2, max: 80 }) : null;
  if (motto && !motto.ok) return { error: "Motto: " + motto.error };
  await q(
    `UPDATE teams SET name = $2, name_key = $3, emoji = COALESCE($4, emoji), color = COALESCE($5, color), motto = $6
     WHERE id = $1`,
    [
      team.id,
      name.value,
      key,
      isOneOf(emoji, TEAM_EMOJIS) ? emoji : null,
      isOneOf(color, TEAM_COLORS) ? color : null,
      motto?.ok ? motto.value : null,
    ],
  );
  return done("Team updated.");
}

// ---------- Connectors ----------

export async function createIngestToken(): Promise<ActionState> {
  const user = await requireUser();
  const token = "wt_" + randomToken(24);
  await q("UPDATE users SET ingest_token_hash = $2 WHERE id = $1", [user.id, sha256(token)]);
  revalidatePath("/connect");
  return { ok: true, token };
}

export async function revokeIngestToken() {
  const user = await requireUser();
  await q("UPDATE users SET ingest_token_hash = NULL WHERE id = $1", [user.id]);
  revalidatePath("/connect");
}

export async function disconnectProvider(provider: string) {
  const user = await requireUser();
  if (provider !== "google" && provider !== "garmin") return;
  await q("DELETE FROM connections WHERE user_id = $1 AND provider = $2", [user.id, provider]);
  revalidatePath("/connect");
}
