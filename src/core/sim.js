// The MOONHOP simulation.
//
// This module is the single source of truth for the game. It knows nothing
// about canvases, the DOM, timers or the network — it advances a fixed-size
// step and nothing else. The renderer reads it; the server re-runs it.
//
// Determinism rules, in one place so they are easy to keep:
//   * every step is exactly TICK seconds, never a frame delta
//   * randomness comes only from the seeded integer RNG
//   * no Math.exp / Math.pow / Math.random anywhere in this path
//   * input is a list of tick indices, so a replay is an exact re-run
//
// The consequence: (seed, jump ticks) fully determines the score. That gives
// reproducible difficulty, testable balance, and a leaderboard the server can
// actually check.

import {
  TICK,
  JERBOA_X,
  COLLIDE_HALF_W,
  COLLIDE_GRACE,
  SPAWN_AHEAD,
  AIR_TIME,
  TICKS_AIR,
  JUMP_V0,
  accelAtTick,
  JUMP_BUFFER_TICKS,
  SCORE_PER_UNIT,
  speedAtScore,
  gapRangeAtScore,
  OBSTACLES,
  MAX_TICKS,
} from './config.js';
import { makeRng, rangeOf, pickWeighted } from './rng.js';
import { clusterTakeoffWindow } from './arc.js';
import { eligiblePatterns } from './patterns.js';

/**
 * How much take-off slack a cluster must leave the player to be allowed.
 * In world units, so it converts to a wider window early and a tighter one at
 * full speed: ~133ms at 300 u/s, ~60ms at the 660 u/s cap. That 60ms is the
 * hardest ask the game will ever make, and it is a floor, not a target.
 */
const MIN_TAKEOFF_WINDOW = 40;
const MAX_PATTERN_TRIES = 8;

let nextObstacleId = 1;

export class Sim {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);

    this.tick = 0;
    this.dist = 0;
    this.score = 0;
    this.speed = speedAtScore(0);

    // Vertical state. y is height above the horizon line, in world units.
    this.y = 0;
    this.vy = 0;
    this.airTicks = 0;
    this.onGround = true;

    this.bufferedJump = -1; // tick at which a jump was requested mid-air
    this.jumpCount = 0;
    this.lastJumpTick = -1;
    this.lastLandTick = -1;

    this.obstacles = [];
    this.nextClusterX = JERBOA_X + 620; // a calm opening approach
    // Earliest x the player could possibly be airborne from, given they had to
    // clear everything before. Used to keep generated clusters reachable.
    this.reachLo = -Infinity;

    this.dead = false;
    this.deathTick = -1;
    this.killedBy = null;
  }

  /** World-space x of the jerboa's centre. */
  get worldX() {
    return this.dist + JERBOA_X;
  }

  /** How far the jerboa travels while airborne, at the current speed. */
  get jumpSpan() {
    return this.speed * AIR_TIME;
  }

  /**
   * Advance exactly one tick.
   * @param {boolean} jumpPressed a fresh press this tick (not held)
   */
  step(jumpPressed) {
    if (this.dead) return;

    if (jumpPressed) {
      if (this.onGround) this.startJump();
      else this.bufferedJump = this.tick;
    }

    this.integrate();
    this.advance();
    this.spawn();
    this.prune();
    this.collide();

    this.tick++;
    if (this.tick >= MAX_TICKS) this.kill(null);
  }

  startJump() {
    this.onGround = false;
    this.y = 0;
    this.vy = JUMP_V0;
    this.airTicks = 0;
    this.bufferedJump = -1;
    this.jumpCount++;
    this.lastJumpTick = this.tick;
  }

  integrate() {
    if (this.onGround) return;

    const a = accelAtTick(this.airTicks);
    // Velocity-Verlet over a constant acceleration is exact, so this traces the
    // arc table tick for tick rather than drifting away from it.
    this.y += (this.vy + 0.5 * a * TICK) * TICK;
    this.vy += a * TICK;
    this.airTicks++;

    // The arc is a fixed shape with a known length, so touchdown is a tick
    // count, not a float comparison. Landing on `y <= 0` alone would hang the
    // jerboa for one extra tick whenever the final position rounds to a hair
    // above zero — a 8ms lie that the take-off window maths would not share.
    if (this.airTicks >= TICKS_AIR || this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.airTicks = 0;
      this.onGround = true;
      this.lastLandTick = this.tick;

      // The forgiveness window: a press made just before touchdown still
      // launches the next jump, so a run never dies to being 40ms early.
      if (
        this.bufferedJump >= 0 &&
        this.tick - this.bufferedJump <= JUMP_BUFFER_TICKS
      ) {
        this.startJump();
      } else {
        this.bufferedJump = -1;
      }
    }
  }

  advance() {
    this.speed = speedAtScore(this.score);
    this.dist += this.speed * TICK;
    this.score = Math.floor(this.dist * SCORE_PER_UNIT);
  }

  // -------------------------------------------------------------------------
  // Obstacle generation
  // -------------------------------------------------------------------------

  spawn() {
    const horizon = this.worldX + SPAWN_AHEAD;
    let guard = 0;
    while (this.nextClusterX < horizon && guard++ < 32) {
      this.spawnCluster();
    }
  }

  spawnCluster() {
    const span = this.jumpSpan;
    const pool = eligiblePatterns(this.score);

    let cluster = null;
    let window = null;

    for (let tries = 0; tries < MAX_PATTERN_TRIES; tries++) {
      const def = pickWeighted(this.rng, pool);
      const candidate = this.buildCluster(def, this.nextClusterX, span);
      const win = clusterTakeoffWindow(
        candidate,
        this.speed,
        COLLIDE_HALF_W,
        COLLIDE_GRACE,
      );
      if (!win) continue;

      // Can the player actually get to a viable take-off from here? They may
      // always delay a jump, never rush one, so the binding constraint is the
      // earliest point they could be back on the ground.
      const lo = Math.max(win[0], this.reachLo);
      if (win[1] - lo < MIN_TAKEOFF_WINDOW) continue;

      cluster = candidate;
      window = [lo, win[1]];
      break;
    }

    if (!cluster) {
      // Nothing fit — fall back to the gentlest obstacle in the game rather
      // than pushing out something unclearable.
      cluster = this.buildCluster(
        { items: [{ type: 'thornbrush' }] },
        this.nextClusterX,
        span,
      );
      const win = clusterTakeoffWindow(
        cluster,
        this.speed,
        COLLIDE_HALF_W,
        COLLIDE_GRACE,
      );
      window = win ? [Math.max(win[0], this.reachLo), win[1]] : [0, 0];
    }

    for (const o of cluster) this.obstacles.push(o);

    // Propagate reachability: taking off at the earliest viable point puts the
    // jerboa back on the ground one span later.
    this.reachLo = window[0] + span;

    let right = 0;
    for (const o of cluster) right = Math.max(right, o.x + o.w);

    const [gMin, gMax] = gapRangeAtScore(this.score);
    this.nextClusterX = right + span * rangeOf(this.rng, gMin, gMax);
  }

  buildCluster(def, origin, span) {
    const out = [];
    for (const item of def.items) {
      const spec = OBSTACLES[item.type];
      let w = spec.w;
      if (spec.spanFrac) {
        w = Math.min(spec.maxW, Math.max(spec.minW, spec.spanFrac * span));
      }
      out.push({
        id: nextObstacleId++,
        type: item.type,
        x: origin + (item.dx || 0) * span,
        w,
        h: spec.h,
        // Visual variation only — never read by collision or scoring.
        vs: (this.rng() * 4294967296) >>> 0,
      });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }

  prune() {
    const cut = this.worldX - 200;
    let i = 0;
    while (i < this.obstacles.length && this.obstacles[i].x + this.obstacles[i].w < cut) i++;
    if (i > 0) this.obstacles.splice(0, i);
  }

  // -------------------------------------------------------------------------
  // Collision
  // -------------------------------------------------------------------------

  collide() {
    const left = this.worldX - COLLIDE_HALF_W;
    const right = this.worldX + COLLIDE_HALF_W;

    for (const o of this.obstacles) {
      if (o.x + o.w < left) continue;
      if (o.x > right) break; // ordered by x — nothing further can overlap
      if (this.y < o.h - COLLIDE_GRACE) {
        this.kill(o);
        return;
      }
    }
  }

  kill(obstacle) {
    this.dead = true;
    this.deathTick = this.tick;
    this.killedBy = obstacle ? obstacle.type : null;
  }
}

/**
 * Re-run a recorded run and return the outcome.
 *
 * The client sends what it did, not what it scored. Everything below is
 * recomputed from the seed and the key presses, so a submitted score is only
 * ever a claim about a run that either replays or does not.
 */
export function replay(seed, jumpTicks, maxTicks = MAX_TICKS) {
  const sim = new Sim(seed);
  const jumps = new Set(jumpTicks);
  const checkpoints = [];

  while (!sim.dead && sim.tick < maxTicks) {
    if (sim.tick % 512 === 0) checkpoints.push(Math.round(sim.dist));
    sim.step(jumps.has(sim.tick));
  }

  return {
    score: sim.score,
    // Ticks survived — the index of the fatal tick, not the one after it.
    ticks: sim.dead ? sim.deathTick : sim.tick,
    dist: sim.dist,
    dead: sim.dead,
    killedBy: sim.killedBy,
    jumps: sim.jumpCount,
    checkpoints,
  };
}
