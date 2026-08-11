// Tuning constants for MOONHOP.
//
// All distances are in "world units". The world is 360 units tall by design;
// the renderer scales that band to fit whatever screen it is given. Keeping the
// simulation in fixed units (rather than pixels) is what makes a run on a phone
// identical to the same run on a 34" ultrawide — and identical again when the
// server replays it.

export const CLIENT_VERSION = 1;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Fixed simulation step. Everything advances in whole ticks, never in frames. */
export const TICK = 1 / 120;
export const TICK_RATE = 120;

// ---------------------------------------------------------------------------
// World geometry
// ---------------------------------------------------------------------------

export const WORLD_H = 360;
/** The luminous horizon line, measured from the top of the 360-unit band. */
export const GROUND_Y = 262;
/** The jerboa holds a fixed horizontal position; the desert moves past it. */
export const JERBOA_X = 120;

export const JERBOA_HALF_W = 9;
export const JERBOA_H = 20;

/** Collision uses a slightly narrower box than the drawing. Quietly generous. */
export const COLLIDE_HALF_W = 7.5;
/** ...and forgives this much vertical overlap on a grazing jump. */
export const COLLIDE_GRACE = 1.5;

/** How far ahead of the jerboa obstacles are generated. Wider than any screen. */
export const SPAWN_AHEAD = 1600;

// ---------------------------------------------------------------------------
// The jump — the one thing worth obsessing over
// ---------------------------------------------------------------------------
//
// The brief asks for a ~0.42s ascent, a ~0.48s descent, and a downward
// acceleration heavier than the upward one. Those three are only compatible if
// the descent is not a single constant fall: a longer descent at a *uniformly*
// heavier gravity is a contradiction (same height, more force, less time).
//
// So the descent is split. The jerboa crests into a brief low-gravity float —
// the moment where the ears drift up — and then a genuinely heavier gravity
// snaps it back down. Total descent lands on 0.475s, the fall is ~32% heavier
// than the climb, and the arc stays a fixed, fully predictable shape: the
// player always knows exactly where they will come down.
//
// The phases are measured in whole ticks rather than seconds. Integrating a
// constant acceleration over a step is exact, so as long as gravity only ever
// changes on a tick boundary, the simulated arc is not an approximation of the
// intended jump — it is the intended jump, to the last bit, on every machine.

export const TICKS_UP = 51; // 0.425s
export const TICKS_FLOAT = 17; // 0.142s
export const TICKS_FALL = 40; // 0.333s
export const TICKS_AIR = TICKS_UP + TICKS_FLOAT + TICKS_FALL; // 108 = 0.9s

export const T_UP = TICKS_UP * TICK;
export const T_FLOAT = TICKS_FLOAT * TICK;
export const T_FALL = TICKS_FALL * TICK;
export const AIR_TIME = TICKS_AIR * TICK; // 0.90s
export const JUMP_H = 92;

export const G_UP = (2 * JUMP_H) / (T_UP * T_UP);
export const G_FLOAT = 0.3 * G_UP;
export const JUMP_V0 = G_UP * T_UP;

// Solve the heavy phase so the jerboa touches down exactly at AIR_TIME.
const FLOAT_DROP = 0.5 * G_FLOAT * T_FLOAT * T_FLOAT;
const FLOAT_EXIT_V = G_FLOAT * T_FLOAT;
export const G_DOWN =
  (2 * (JUMP_H - FLOAT_DROP - FLOAT_EXIT_V * T_FALL)) / (T_FALL * T_FALL);

/**
 * Downward acceleration applied across the step starting at tick `n` of the
 * jump. Indexed by tick, not by elapsed seconds, so the phase change can never
 * land a hair either side of a boundary. Negative is down.
 */
export function accelAtTick(n) {
  if (n < TICKS_UP) return -G_UP;
  if (n < TICKS_UP + TICKS_FLOAT) return -G_FLOAT;
  return -G_DOWN;
}

/**
 * Pressing jump slightly before touchdown still counts. This is the whole
 * "forgiveness window" — small enough that it never feels like the game jumped
 * for you, large enough that a run never dies to a 30ms mistake.
 */
export const JUMP_BUFFER_TICKS = 12; // 100ms

// ---------------------------------------------------------------------------
// Scoring and speed
// ---------------------------------------------------------------------------

export const SCORE_PER_UNIT = 0.1;

/**
 * Speed as a function of score, as a piecewise-linear table.
 *
 * A table instead of an exponential curve for two reasons: it is trivially
 * tunable, and linear interpolation uses only add/multiply, which is
 * bit-reproducible everywhere. Math.exp is not.
 *
 * The shape matters more than the numbers: the first twenty seconds barely
 * accelerate, the middle stretches out, and the whole thing caps. The game
 * never decides you are no longer allowed to play.
 */
const SPEED_TABLE = [
  [0, 300],
  [250, 322],
  [500, 348],
  [1000, 388],
  [1500, 420],
  [2200, 452],
  [3000, 484],
  [4200, 522],
  [6000, 566],
  [8000, 600],
  [11000, 630],
  [15000, 650],
  [20000, 660],
];

export const SPEED_MIN = SPEED_TABLE[0][1];
export const SPEED_MAX = SPEED_TABLE[SPEED_TABLE.length - 1][1];

function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  const last = table.length - 1;
  if (x >= table[last][0]) return table[last][1];
  let i = 0;
  while (i < last && table[i + 1][0] <= x) i++;
  const [x0, y0] = table[i];
  const [x1, y1] = table[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

export function speedAtScore(score) {
  return lerpTable(SPEED_TABLE, score);
}

/**
 * Gap between obstacle clusters, expressed as a multiple of the jump span
 * (how far the jerboa travels while airborne). Expressing gaps in jump spans
 * rather than raw units means the difficulty of a gap stays honest as speed
 * rises — a gap of 1.4 spans is the same ask at 300 u/s and at 660 u/s.
 */
const GAP_MIN_TABLE = [
  [0, 2.3],
  [500, 2.0],
  [1500, 1.7],
  [3000, 1.45],
  [6000, 1.25],
  [10000, 1.12],
  [20000, 1.02],
];
const GAP_MAX_TABLE = [
  [0, 2.9],
  [500, 2.6],
  [1500, 2.25],
  [3000, 1.95],
  [6000, 1.7],
  [10000, 1.5],
  [20000, 1.3],
];

export function gapRangeAtScore(score) {
  return [lerpTable(GAP_MIN_TABLE, score), lerpTable(GAP_MAX_TABLE, score)];
}

// ---------------------------------------------------------------------------
// Night phases
// ---------------------------------------------------------------------------

export const PHASES = [
  { key: 'dusk', from: 0 },
  { key: 'moonrise', from: 500 },
  { key: 'midnight', from: 1500 },
  { key: 'deepnight', from: 3000 },
  { key: 'dawn', from: 10000 },
];

export function phaseKeyForScore(score) {
  let key = PHASES[0].key;
  for (const p of PHASES) if (score >= p.from) key = p.key;
  return key;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
//
// Nothing here attacks, moves, or reacts. They sit in the path. The difficulty
// is entirely in when you leave the ground.

export const OBSTACLES = {
  thornbrush: { w: 26, h: 17 },
  stone: { w: 32, h: 25 },
  branch: { w: 11, h: 36 },
  // The sand ridge has no fixed width: it is sized as a fraction of the current
  // jump span, so it stays a genuine test of timing at every speed. It is the
  // one obstacle you cannot clear by jumping early.
  //
  // This is the whole reason the ridge exists. Every other obstacle is narrow
  // enough that the arc covers it many times over — you are above a thornbrush
  // for 820ms of a 900ms jump, so the timing is nearly free however fast the
  // desert is moving. A ridge occupying most of the jump span is the only shape
  // that turns speed into an actual demand on precision.
  ridge: { w: 0, h: 11, spanFrac: 0.62, minW: 140, maxW: 380 },
  longridge: { w: 0, h: 11, spanFrac: 0.72, minW: 180, maxW: 440 },
  scorpion: { w: 42, h: 13 },
};

/** Longest run the server will ever replay: 45 minutes. */
export const MAX_TICKS = TICK_RATE * 60 * 45;
