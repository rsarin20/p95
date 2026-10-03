import { SCORING, type Intensity } from "./config";

export type ActivityInput = { intensity: Intensity; minutes: number };

export type DayScore = {
  steps: number;
  stepPoints: number;
  exercisePoints: number;
  bonus: number;
  total: number;
};

export function exercisePoints(a: ActivityInput): number {
  return Math.max(0, Math.round(a.minutes)) * SCORING.exercisePointsPerMinute[a.intensity];
}

/**
 * Score for one user on one day.
 * `stepReadings` are the step counts each source reported for that day. We take
 * the highest rather than the sum, because Apple Health, Garmin and Google often
 * see the *same* steps — summing would double count.
 */
export function scoreDay(stepReadings: number[], activities: ActivityInput[]): DayScore {
  const raw = stepReadings.length ? Math.max(...stepReadings) : 0;
  const steps = Math.min(Math.max(0, Math.round(raw)), SCORING.maxStepsPerDay);
  const stepPoints = steps * SCORING.pointsPerStep;
  const ex = activities.reduce((sum, a) => sum + exercisePoints(a), 0);
  const bonus = steps >= SCORING.dailyGoalSteps ? SCORING.dailyGoalBonus : 0;
  return { steps, stepPoints, exercisePoints: ex, bonus, total: stepPoints + ex + bonus };
}

/** SQL expression mirroring scoreDay's exercise points, for use in aggregate queries. */
export const EXERCISE_POINTS_SQL = `(CASE intensity
  WHEN 'light' THEN ${SCORING.exercisePointsPerMinute.light}
  WHEN 'moderate' THEN ${SCORING.exercisePointsPerMinute.moderate}
  WHEN 'heavy' THEN ${SCORING.exercisePointsPerMinute.heavy}
  ELSE 0 END) * minutes`;
