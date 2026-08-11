import { strict as assert } from 'node:assert';
import test from 'node:test';

import { CFG } from '../public/js/config.js';
import { Spawner } from '../public/js/entities.js';
import { Player } from '../public/js/player.js';

const VIEW = { w: 960, h: 540, waterY: 378 };
const STEP = 1 / 60;

/**
 * A headless bot that plays the real physics through the real spawner.
 *
 * The point is not that a bot can win — it's that every pattern the spawner can
 * emit is *physically clearable*. If difficulty tuning ever produces a gap
 * tighter than a hop can cross, or hangs a flock lower than a dive can duck,
 * this test fails instead of a player discovering it at 40 seconds in.
 */
function play(seconds, { onDeath } = {}) {
  const player = new Player();
  const spawner = new Spawner();
  const input = { hopHeld: false, diveHeld: false };

  player.reset(Math.max(CFG.PLAYER_X_MIN, VIEW.w * CFG.PLAYER_X_RATIO), VIEW.waterY);
  spawner.reset(VIEW);

  let elapsed = 0;
  let worldTime = 0;
  let plannedApex = 0; // height this hop was committed to at take-off

  while (elapsed < seconds) {
    const speed = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED * CFG.SPEED_STEP ** (elapsed / CFG.SPEED_EVERY));
    const box = player.hitbox();

    // ── Policy ────────────────────────────────────────────────────────
    input.hopHeld = false;
    input.diveHeld = false;

    const next = spawner.obstacles.find((o) => spawner.hitbox(o).x + spawner.hitbox(o).w > box.x);
    if (next) {
      const hit = spawner.hitbox(next);
      const closing = speed * next.speedMul;
      const gap = hit.x - (box.x + box.w);
      const eta = gap / closing;

      if (next.flying) {
        // Submerge under it — hold the dive from well before contact.
        input.diveHeld = eta < 0.55;
      } else if (!player.airborne) {
        // Hop as late as is safe: clearing the leading edge needs only ~0.08s
        // of rise, and every extra moment aloft is airtime spent on the wrong
        // side of the obstacle.
        plannedApex = 0;
        if (eta < 0.15) {
          player.requestHop();
          input.hopHeld = true; // press *and hold* — releasing now clips the hop

          // Commit to a height at take-off and stick to it. What has to last
          // is the time spent *above the obstacle's top edge* — not total
          // airtime — while its trailing edge travels past us. A hop peaking
          // `extra` above that edge stays there for 2·√(2·extra/g).
          const clearTime = (gap + hit.w + box.w) / closing;
          const overTheTop = player.restY - 2 - hit.y + 8;
          plannedApex = overTheTop + (CFG.GRAVITY * clearTime ** 2) / 8;
        }
      } else if (player.vy < 0 && plannedApex > 0) {
        // Releasing clips the remaining climb, so predict the apex we'd get
        // *after* the cut — otherwise the bot lets go at exactly the height it
        // needs and then falls short of it.
        const rise = player.restY - 2 - (box.y + box.h);
        const kept = player.vy * CFG.CUT_MULTIPLIER;
        input.hopHeld = rise + (kept * kept) / (2 * CFG.GRAVITY) < plannedApex;
      }
    }

    // ── Step ──────────────────────────────────────────────────────────
    player.update(STEP, input, worldTime);
    spawner.update(STEP, { view: VIEW, speed, elapsed, worldTime, playerX: player.x });

    const now = player.hitbox();
    for (const o of spawner.obstacles) {
      const hit = spawner.hitbox(o);
      if (now.x < hit.x + hit.w && now.x + now.w > hit.x && now.y < hit.y + hit.h && now.y + now.h > hit.y) {
        onDeath?.({ kind: o.kind, elapsed, speed, obstacle: o, hit, player: now });
        return { survived: elapsed, killedBy: o.kind };
      }
    }

    elapsed += STEP;
    worldTime += STEP;
  }

  return { survived: elapsed, killedBy: null };
}

test('every spawned pattern is clearable for a long run', () => {
  // Five minutes is well past the difficulty ramp (150s) and covers every
  // obstacle type at speeds up to ~600u/s. 24 runs shakes out rare pairings.
  for (let attempt = 0; attempt < 24; attempt++) {
    let death = null;
    const result = play(300, { onDeath: (info) => (death = info) });

    assert.equal(
      result.killedBy,
      null,
      `bot died on a ${result.killedBy} at ${result.survived.toFixed(1)}s ` +
        `(speed ${death?.speed.toFixed(0)}u/s, obstacle ${death?.obstacle.w.toFixed(0)}u wide) — ` +
        'that pattern is not clearable with the current tuning'
    );
  }
});

test('fast obstacles do not eat the gap in front of them', () => {
  // Regression: kayaks travel at 1.5x the flow. Spacing them by distance let
  // one arrive barely behind a duck, close enough that landing from the hop
  // over the duck put the capybara straight into the kayak.
  const spawner = new Spawner();
  const playerX = Math.max(CFG.PLAYER_X_MIN, VIEW.w * CFG.PLAYER_X_RATIO);
  spawner.reset(VIEW);

  const seen = new Map(); // obstacle -> { arrived, cleared }
  let elapsed = 0;

  while (elapsed < 240) {
    const speed = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED * CFG.SPEED_STEP ** (elapsed / CFG.SPEED_EVERY));
    spawner.update(STEP, { view: VIEW, speed, elapsed, worldTime: elapsed, playerX });

    for (const o of spawner.obstacles) {
      if (!seen.has(o)) seen.set(o, { kind: o.kind, arrived: null, cleared: null });
      const record = seen.get(o);
      if (record.arrived === null && o.x <= playerX) record.arrived = elapsed;
      if (record.cleared === null && o.x + o.w <= playerX) record.cleared = elapsed;
    }
    elapsed += STEP;
  }

  const timeline = [...seen.values()]
    .filter((r) => r.arrived !== null && r.cleared !== null)
    .sort((a, b) => a.arrived - b.arrived);

  assert.ok(timeline.length > 60, `expected a long sequence, got ${timeline.length}`);

  for (let i = 1; i < timeline.length; i++) {
    const gap = timeline[i].arrived - timeline[i - 1].cleared;
    assert.ok(
      gap >= CFG.GAP_MIN - 0.05,
      `only ${gap.toFixed(2)}s of clear water between a ${timeline[i - 1].kind} and a ` +
        `${timeline[i].kind} (minimum is ${CFG.GAP_MIN}s)`
    );
  }
});

test('a full-height hop clears the tallest obstacle', () => {
  const player = new Player();
  player.reset(200, VIEW.waterY);
  const input = { hopHeld: true, diveHeld: false };

  player.requestHop();
  let apex = 0;
  for (let t = 0; t < 1.2; t += STEP) {
    player.update(STEP, input, t);
    apex = Math.max(apex, player.restY - player.y);
  }

  // The tallest thing in the game is a 3-duck flock topping out 112 above water.
  assert.ok(apex > 130, `full hop only reached ${apex.toFixed(0)}u`);
});

test('a tapped hop is much shorter than a held one', () => {
  const measure = (holdFrames) => {
    const player = new Player();
    player.reset(200, VIEW.waterY);
    const input = { hopHeld: true, diveHeld: false };
    player.requestHop();

    let apex = 0;
    for (let i = 0; i < 90; i++) {
      input.hopHeld = i < holdFrames;
      player.update(STEP, input, i * STEP);
      apex = Math.max(apex, player.restY - player.y);
    }
    return apex;
  };

  const tap = measure(1);
  const held = measure(60);
  assert.ok(tap > 30, `a tap must still clear a log, got ${tap.toFixed(0)}u`);
  assert.ok(held > tap * 2.5, `hold (${held.toFixed(0)}u) should tower over tap (${tap.toFixed(0)}u)`);
});

test('submerging ducks the capybara under a rogue flock', () => {
  const player = new Player();
  player.reset(200, VIEW.waterY);
  const diving = { hopHeld: false, diveHeld: true };

  const standingTop = player.hitbox().y;
  for (let t = 0; t < 0.6; t += STEP) player.update(STEP, diving, t);
  const submergedTop = player.hitbox().y;

  // The lowest duck in a flock hangs 34 above the water.
  assert.ok(standingTop < VIEW.waterY - 34, 'a standing capybara must be hit by the flock');
  assert.ok(submergedTop > VIEW.waterY - 34, 'a submerged capybara must slip under it');
});

test('the yuzu hangs above the head at the top of a hop', () => {
  const player = new Player();
  player.reset(200, VIEW.waterY);
  const input = { hopHeld: true, diveHeld: false };
  player.requestHop();

  let maxLift = 0;
  for (let t = 0; t < 1; t += STEP) {
    player.update(STEP, input, t);
    maxLift = Math.max(maxLift, player.yuzu.lift ?? 0);
  }

  assert.ok(maxLift > 8, `yuzu barely left the head (${maxLift.toFixed(1)}u)`);
  assert.ok(maxLift <= CFG.YUZU_MAX_LIFT + 0.01, 'yuzu drifted past its leash');
});

test('the yuzu settles back onto the head after landing', () => {
  const player = new Player();
  player.reset(200, VIEW.waterY);
  const input = { hopHeld: false, diveHeld: false };
  player.requestHop();
  for (let t = 0; t < 2.5; t += STEP) player.update(STEP, input, t);

  assert.ok(Math.abs(player.yuzu.lift) < 1.5, `yuzu came to rest ${player.yuzu.lift.toFixed(2)}u off the head`);
});
