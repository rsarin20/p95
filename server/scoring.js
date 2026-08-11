// Mirrors the client's score curve (see public/js/config.js). If BASE_SPEED,
// SPEED_STEP, SPEED_EVERY or SCORE_RATE change there, change them here too or
// honest high scores will start bouncing.
const BASE_SPEED = 330;
const SPEED_STEP = 1.02;
const SPEED_EVERY = 10;
const SCORE_RATE = 0.8;

/** Slack for near-miss bonuses, plus a flat allowance for very short runs. */
const BONUS_HEADROOM = 2.5;
const FLOOR = 1000;
const CLOCK_SLOP = 3; // seconds, covers frame timing and clock jitter

/**
 * The most a run of the given length could possibly have scored.
 *
 * Score accrues at `speed · SCORE_RATE`, and speed grows continuously as
 * `BASE_SPEED · SPEED_STEP^(t/SPEED_EVERY)`, so the distance covered by time t
 * is the integral of that exponential.
 *
 * This rejects numbers that could not have come from the game at all. It is a
 * sanity bound, not anti-cheat: a patient forger can still submit a plausible
 * score, and stopping that would take server-side simulation of the run.
 */
export function maxPlausibleScore(durationMs) {
  const seconds = Math.max(0, durationMs / 1000) + CLOCK_SLOP;
  const growth = Math.log(SPEED_STEP) / SPEED_EVERY;
  const distance = (BASE_SPEED * (Math.exp(growth * seconds) - 1)) / growth;
  return Math.ceil(distance * SCORE_RATE * BONUS_HEADROOM + FLOOR);
}
