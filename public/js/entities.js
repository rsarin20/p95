import { CFG } from './config.js';
import { clamp, lerp, rand, randInt, weightedPick } from './utils.js';
import { drawDriftwood, drawDuck, drawGator, drawKayak, drawRogueDuck } from './shapes.js';

const DUCK_H = 28;

/**
 * Obstacle catalogue. `unlock` is the run time (seconds) at which a kind starts
 * appearing; `weight(d)` shapes how often it shows up as difficulty `d` (0→1)
 * climbs. `hit` is the collision box — deliberately tighter than the art so a
 * clean-looking pass is never scored as a crash.
 */
const KINDS = {
  driftwood: {
    unlock: 0,
    weight: (d) => 3.2 - d * 1.4,
    speedMul: 1,
    create(waterY) {
      const w = rand(76, 118);
      const h = 20;
      return { w, h, y: waterY - 17 };
    },
    hit: (o) => ({ x: o.x + 6, y: o.y - 9, w: o.w - 12, h: o.h + 9 }),
    draw: drawDriftwood
  },

  duck: {
    unlock: 7,
    weight: (d) => 1 + d * 0.5,
    speedMul: 1,
    create(waterY) {
      return { w: 30, h: DUCK_H, y: waterY - 23, bob: rand(0, Math.PI * 2) };
    },
    update(o, t) {
      o.y = o.baseY + Math.sin(t * 3.4 + o.bob) * 3;
    },
    hit: (o) => ({ x: o.x + 3, y: o.y + 2, w: o.w - 4, h: o.h - 4 }),
    draw: drawDuck
  },

  gator: {
    unlock: 13,
    weight: (d) => 0.7 + d * 1.9,
    speedMul: 1,
    nearMiss: true,
    create(waterY) {
      const w = rand(116, 146);
      const h = 36;
      return { w, h, y: waterY - 31 };
    },
    // Top of the box is the scute ridge — clearing it by a hair is the whole
    // point of the Chill Moment, so the box starts just under the tips.
    hit: (o) => ({ x: o.x + 8, y: o.y + 5, w: o.w - 14, h: o.h - 5 }),
    draw: drawGator
  },

  // Rogue ducks fly in a stacked column. The bottom of the stack hangs lower
  // than a capybara is tall, so this is the obstacle the dive exists for —
  // submerge under it, or commit to a full-height hop to clear the top.
  rogueDucks: {
    unlock: 26,
    weight: (d) => 0.35 + d * 1.25,
    speedMul: 1.08,
    flying: true,
    create(waterY) {
      const count = randInt(2, 3);
      const spacing = 25;
      const h = DUCK_H + (count - 1) * spacing;
      // Anchored from the bottom: the lowest duck always hangs at the same
      // height, so the dive works identically whatever the stack height.
      return { w: 36, h, count, spacing, y: waterY - 34 - h, bob: rand(0, Math.PI * 2) };
    },
    update(o, t) {
      o.y = o.baseY + Math.sin(t * 2.2 + o.bob) * 3;
    },
    hit: (o) => ({ x: o.x - 2, y: o.y + 2, w: o.w + 8, h: o.h - 4 }),
    draw(ctx, o, palette, t) {
      for (let i = 0; i < o.count; i++) {
        drawRogueDuck(
          ctx,
          {
            x: o.x + Math.sin(t * 1.6 + i * 2.1) * 4,
            y: o.y + i * o.spacing,
            w: o.w,
            h: DUCK_H
          },
          palette,
          t + i * 0.4
        );
      }
    }
  },

  kayak: {
    unlock: 42,
    weight: (d) => 0.3 + d * 1.1,
    speedMul: 1.5, // paddling upstream — closes on you noticeably faster
    create(waterY) {
      const w = rand(92, 114);
      const h = 52;
      return { w, h, y: waterY - 36 };
    },
    // The paddler's head is above the box: clipping a helmet shouldn't end a run.
    hit: (o) => ({ x: o.x + 8, y: o.y + 12, w: o.w - 16, h: o.h - 16 }),
    draw: drawKayak
  }
};

/**
 * Decides what arrives next and when.
 *
 * Spacing is defined in *arrival times at the capybara*, never in pixels. That
 * distinction matters: a kayak closes at 1.5× the flow, so a gap that looks
 * generous on screen is half eaten by the time the kayak gets there. Placing
 * each obstacle by when it will reach the player keeps the breathing room
 * honest no matter how fast the thing travels or how fast the river is running.
 */
export class Spawner {
  obstacles = [];
  #graceX = 0;

  reset(view) {
    this.obstacles.length = 0;
    // A beat of clear water before the first obstacle of a run.
    this.#graceX = view.w + 260;
  }

  /** @param {number} elapsed seconds since the run started */
  update(dt, { view, speed, elapsed, worldTime, playerX }) {
    for (const o of this.obstacles) {
      o.x -= speed * o.speedMul * dt;
      KINDS[o.kind].update?.(o, worldTime);
    }

    // Retire anything fully off the left edge.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].x + this.obstacles[i].w < -160) this.obstacles.splice(i, 1);
    }

    // Queue the next one as soon as the last one spawned has entered view.
    const last = this.obstacles[this.obstacles.length - 1];
    if (!last || last.x <= view.w) {
      this.#spawn({ view, speed, playerX, last, difficulty: clamp(elapsed / CFG.DIFFICULTY_FULL, 0, 1), elapsed });
    }
  }

  #spawn({ view, speed, elapsed, difficulty, playerX, last }) {
    const candidates = Object.entries(KINDS)
      .filter(([, spec]) => elapsed >= spec.unlock)
      .map(([kind, spec]) => ({ kind, spec, weight: Math.max(0.05, spec.weight(difficulty)) }));

    const { kind, spec } = weightedPick(candidates);
    const shape = spec.create(view.waterY);

    // Spacing tightens as the run gets long, but never below a clearable hop.
    const spread = lerp(CFG.GAP_MAX, CFG.GAP_MIN * 1.3, difficulty);
    const gapSeconds = rand(CFG.GAP_MIN, spread);

    let x = Math.max(view.w + 40, this.#graceX);
    if (last) {
      // When the previous obstacle's tail clears the player, plus the gap, is
      // when this one's nose should arrive — converted back into a position at
      // this obstacle's own travel speed.
      const lastClears = (last.x + last.w - playerX) / (speed * last.speedMul);
      x = Math.max(x, playerX + (lastClears + gapSeconds) * speed * spec.speedMul);
    }

    const o = {
      kind,
      x,
      speedMul: spec.speedMul,
      flying: Boolean(spec.flying),
      nearMissEligible: Boolean(spec.nearMiss),
      scored: false,
      nearMissed: false,
      ...shape
    };
    o.baseY = o.y;
    this.obstacles.push(o);
    this.#graceX = 0;
  }

  hitbox(o) {
    return KINDS[o.kind].hit(o);
  }

  draw(ctx, palette, worldTime, view) {
    for (const o of this.obstacles) {
      if (o.x > view.w + 160 || o.x + o.w < -160) continue;
      KINDS[o.kind].draw(ctx, o, palette, worldTime);
    }
  }
}
