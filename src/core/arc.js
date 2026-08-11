// The jump arc, precomputed once, and the geometry that falls out of it.
//
// The arc is sampled by running the *exact* integrator the simulation uses, at
// the same fixed timestep. That means the table is not an approximation of the
// jump — it is the jump. Anything derived from it (how long you are above a
// given height, which take-off positions clear a cluster) is therefore exactly
// true in play, not nearly true.

import { TICK, AIR_TIME, TICKS_AIR, JUMP_V0, accelAtTick } from './config.js';

/** y[i] = height above ground at tick i after take-off. */
export const ARC = buildArc();

function buildArc() {
  const y = new Float64Array(TICKS_AIR + 1);
  let pos = 0;
  let vel = JUMP_V0;
  y[0] = 0;
  for (let i = 1; i <= TICKS_AIR; i++) {
    const a = accelAtTick(i - 1);
    pos += (vel + 0.5 * a * TICK) * TICK;
    vel += a * TICK;
    y[i] = pos;
  }
  return y;
}

export const ARC_PEAK = (() => {
  let m = 0;
  for (let i = 0; i < ARC.length; i++) if (ARC[i] > m) m = ARC[i];
  return m;
})();

/**
 * The window of time, after take-off, during which the jerboa's feet are at or
 * above `h`. Returns null if the jump never gets that high.
 *
 * Sub-tick edges are linearly interpolated so the result is smooth as `h`
 * varies — otherwise cluster feasibility would jitter by a whole tick.
 */
export function aboveWindow(h) {
  if (h <= 0) return [0, AIR_TIME];
  if (h > ARC_PEAK) return null;

  let first = -1;
  for (let i = 0; i < ARC.length; i++) {
    if (ARC[i] >= h) {
      first = i;
      break;
    }
  }
  if (first < 0) return null;

  let last = -1;
  for (let i = ARC.length - 1; i >= 0; i--) {
    if (ARC[i] >= h) {
      last = i;
      break;
    }
  }

  let tA = first * TICK;
  if (first > 0) {
    const y0 = ARC[first - 1];
    const y1 = ARC[first];
    if (y1 > y0) tA = (first - 1 + (h - y0) / (y1 - y0)) * TICK;
  }

  let tB = last * TICK;
  if (last < ARC.length - 1) {
    const y0 = ARC[last];
    const y1 = ARC[last + 1];
    if (y0 > y1) tB = (last + (y0 - h) / (y0 - y1)) * TICK;
  }

  return [tA, tB];
}

/**
 * Given a cluster of obstacles and a speed, return the range of world
 * x-positions from which a single jump clears every one of them.
 *
 * This is what keeps the game fair. Patterns are not trusted because they
 * looked reasonable when they were written down — every cluster the generator
 * produces is checked against this, and one that leaves the player no viable
 * take-off (or an unreasonably thin one) is thrown away before it is ever
 * spawned. The player can always be beaten by their own timing, never by the
 * level.
 *
 * @param cluster  [{x, w, h}] in world units, ordered left to right
 * @param speed    world units per second
 * @param halfW    jerboa collision half-width
 * @param grace    vertical forgiveness
 * @returns {[lo, hi]|null} take-off x range, or null if impossible
 */
export function clusterTakeoffWindow(cluster, speed, halfW, grace) {
  let lo = -Infinity;
  let hi = Infinity;

  for (const o of cluster) {
    const h = o.h - grace;
    if (h <= 0) continue; // flat enough to run straight through

    const win = aboveWindow(h);
    if (!win) return null;
    const [tA, tB] = win;

    // Overlap with the obstacle starts when the jerboa's leading edge passes
    // its left edge, and ends when its trailing edge clears the right edge.
    // Both must happen inside [tA, tB].
    const enter = o.x - halfW;
    const exit = o.x + o.w + halfW;

    // takeoffX + speed*tA <= enter   →   takeoffX <= enter - speed*tA
    hi = Math.min(hi, enter - speed * tA);
    // takeoffX + speed*tB >= exit    →   takeoffX >= exit - speed*tB
    lo = Math.max(lo, exit - speed * tB);
  }

  if (lo > hi) return null;
  return [lo, hi];
}
