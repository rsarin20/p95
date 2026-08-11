/** All gameplay tunables in one place. World units, seconds. */
export const CFG = {
  // Virtual camera: the world is `BASE_H` units tall, width follows the viewport.
  BASE_H: 540,
  MIN_W: 640,
  WATER_RATIO: 0.7,
  PLAYER_X_RATIO: 0.22,
  PLAYER_X_MIN: 130,

  // Flow
  BASE_SPEED: 330,
  SPEED_STEP: 1.02,      // +2% …
  SPEED_EVERY: 10,       // … every 10 seconds
  MAX_SPEED: 1150,

  // Capybara physics
  GRAVITY: 2400,
  JUMP_V: 800,           // tap apex ≈ 48u, full hold ≈ 212u
  HOLD_GRAVITY: 0.5,     // gravity scale while the hop key is held and rising
  HOLD_MAX: 0.24,        // seconds of assisted rise
  CUT_MULTIPLIER: 0.6,   // velocity kept when the key is released early
  DIVE_GRAVITY: 4400,
  COYOTE: 0.09,          // grace period to hop after leaving the surface
  BUFFER: 0.13,          // pre-registered hop just before landing
  SUBMERGE_DEPTH: 26,

  // Yuzu — springs off the head, floats at the top of the arc
  YUZU_GRAVITY: 1750,
  YUZU_DAMPING: 7,
  YUZU_MAX_LIFT: 46,

  // Scoring
  SCORE_RATE: 0.8,
  NEAR_MISS_BONUS: 250,
  NEAR_MISS_WINDOW: 30,  // vertical clearance that still counts as "chill"

  // Spawning
  GAP_MIN: 0.85,         // seconds of travel between obstacles at current speed
  GAP_MAX: 1.7,
  GAP_TIGHTEN: 0.55,     // gap multiplier floor as difficulty ramps
  DIFFICULTY_FULL: 150,  // seconds to reach maximum pressure

  // Feel
  SHAKE_DECAY: 7,
  LANDING_SHAKE: 0.018,
  HAPTIC_HOP: 8,
  HAPTIC_CRASH: [24, 40, 24]
};

/**
 * Day → night lighting. The cycle advances with score, so a long run visibly
 * carries the capybara from dawn through to a starfield and back.
 */
export const PHASES = [
  {
    name: 'dawn',
    skyTop: [38, 48, 92], skyMid: [126, 96, 132], skyLow: [242, 158, 116],
    sun: [255, 226, 178], sunGlow: [255, 170, 120], starAlpha: 0.25,
    far: [78, 76, 122], mid: [52, 54, 92], near: [30, 34, 62],
    water: [46, 62, 104], waterDeep: [24, 34, 64], shimmer: [255, 196, 150],
    silhouette: [16, 18, 34], foam: [226, 232, 255]
  },
  {
    name: 'day',
    skyTop: [96, 168, 226], skyMid: [158, 208, 238], skyLow: [216, 238, 244],
    sun: [255, 250, 226], sunGlow: [255, 236, 178], starAlpha: 0,
    far: [126, 168, 178], mid: [78, 130, 136], near: [40, 84, 92],
    water: [78, 150, 168], waterDeep: [36, 92, 116], shimmer: [242, 252, 255],
    silhouette: [18, 32, 38], foam: [255, 255, 255]
  },
  {
    name: 'dusk',
    skyTop: [58, 44, 96], skyMid: [162, 82, 118], skyLow: [248, 146, 88],
    sun: [255, 208, 132], sunGlow: [255, 128, 96], starAlpha: 0.35,
    far: [104, 68, 108], mid: [70, 44, 82], near: [40, 26, 54],
    water: [86, 60, 108], waterDeep: [38, 26, 60], shimmer: [255, 178, 122],
    silhouette: [20, 12, 30], foam: [255, 214, 190]
  },
  {
    name: 'night',
    skyTop: [6, 10, 30], skyMid: [14, 24, 56], skyLow: [30, 48, 84],
    sun: [226, 238, 255], sunGlow: [120, 160, 220], starAlpha: 1,
    far: [22, 34, 66], mid: [16, 24, 50], near: [10, 16, 36],
    water: [20, 38, 74], waterDeep: [8, 16, 38], shimmer: [156, 196, 255],
    silhouette: [3, 6, 16], foam: [186, 212, 255]
  }
];

/** Seconds of score-time each lighting phase lasts (score / this = phase index). */
export const PHASE_SCORE = 5200;
