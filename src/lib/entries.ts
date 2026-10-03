import "server-only";
import { SCORING, type Intensity, type StepSource } from "./config";
import { q, q1 } from "./db";

export async function recordSteps(userId: string, day: string, source: StepSource, steps: number) {
  const capped = Math.min(Math.max(0, Math.round(steps)), SCORING.maxStepsPerDay);
  await q(
    `INSERT INTO step_entries (user_id, day, source, steps) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, day, source) DO UPDATE SET steps = EXCLUDED.steps, updated_at = now()`,
    [userId, day, source, capped],
  );
  return capped;
}

export async function clearSteps(userId: string, day: string, source: StepSource) {
  await q("DELETE FROM step_entries WHERE user_id = $1 AND day = $2 AND source = $3", [userId, day, source]);
}

export async function addActivity(
  userId: string,
  day: string,
  intensity: Intensity,
  minutes: number,
  label: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Atomic cap check: insert only if the day's total stays within the limit.
  const row = await q1<{ id: number }>(
    `INSERT INTO activities (user_id, day, intensity, minutes, label)
     SELECT $1::text, $2::date, $3::text, $4::int, $5::text
     WHERE (SELECT COALESCE(SUM(minutes), 0) FROM activities WHERE user_id = $1::text AND day = $2::date) + $4::int <= $6::int
     RETURNING id`,
    [userId, day, intensity, minutes, label, SCORING.maxExerciseMinutesPerDay],
  );
  if (!row)
    return {
      ok: false,
      error: `That would take you past ${SCORING.maxExerciseMinutesPerDay} exercise minutes for the day — the daily maximum.`,
    };
  return { ok: true };
}

export async function deleteActivity(userId: string, id: number) {
  await q("DELETE FROM activities WHERE id = $1 AND user_id = $2", [id, userId]);
}
