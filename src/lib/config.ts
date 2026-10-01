// Central knobs for the challenge. Everything an organiser might want to tweak
// lives here (or in env vars) so there is one place to look.

export const CHALLENGE = {
  name: process.env.NEXT_PUBLIC_CHALLENGE_NAME || "Walktober",
  start: process.env.CHALLENGE_START || "2026-10-01",
  end: process.env.CHALLENGE_END || "2026-10-31",
  // Days after the end during which people can still backfill late syncs.
  graceDays: 3,
};

export const TEAM_MAX_MEMBERS = Number(process.env.TEAM_MAX_MEMBERS || 10);

export const SCORING = {
  // 1 step = 1 point.
  pointsPerStep: 1,
  // Exercise points per minute, by intensity. Anchored to walking:
  // ~100 steps/min is the research-backed cadence threshold for "moderate"
  // intensity, so 1 minute of moderate exercise = 100 points = 1 minute of
  // brisk walking. WHO guidance treats 1 vigorous minute as worth 2 moderate
  // minutes, and light activity as roughly half of moderate.
  exercisePointsPerMinute: { light: 50, moderate: 100, heavy: 200 } as const,
  // Daily goal bonus — a nudge to hit the classic 10k.
  dailyGoalSteps: 10_000,
  dailyGoalBonus: 500,
  // Anti-gaming guardrails (per user, per day).
  maxStepsPerDay: 60_000,
  maxExerciseMinutesPerDay: 240,
};

export type Intensity = keyof typeof SCORING.exercisePointsPerMinute;
export const INTENSITIES: Intensity[] = ["light", "moderate", "heavy"];

export const INTENSITY_INFO: Record<Intensity, { label: string; emoji: string; examples: string; met: string }> = {
  light: {
    label: "Light",
    emoji: "🧘",
    examples: "Yoga, stretching, easy cycling, gardening, housework",
    met: "you can sing while doing it",
  },
  moderate: {
    label: "Moderate",
    emoji: "🚴",
    examples: "Cycling, swimming, dancing, hiking, tennis doubles, weights",
    met: "you can talk, but not sing",
  },
  heavy: {
    label: "Heavy",
    emoji: "🔥",
    examples: "Running, HIIT, spin class, football, rowing hard, lap swimming",
    met: "you can only say a few words",
  },
};

export const STEP_SOURCES = ["manual", "apple_health", "google", "garmin"] as const;
export type StepSource = (typeof STEP_SOURCES)[number];

export const SOURCE_INFO: Record<StepSource, { label: string; emoji: string }> = {
  manual: { label: "Manual", emoji: "✍️" },
  apple_health: { label: "Apple Health", emoji: "🍎" },
  google: { label: "Google", emoji: "🟢" },
  garmin: { label: "Garmin", emoji: "⌚" },
};
