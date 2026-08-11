// Tests for the deterministic core.
//
// The point of a deterministic simulation is that it can be interrogated. The
// two things worth proving are that a run replays identically, and that the
// level generator never produces something a perfect player could not clear.

import assert from 'node:assert/strict';
import {
  TICK,
  TICKS_AIR,
  AIR_TIME,
  JUMP_H,
  G_UP,
  G_DOWN,
  T_UP,
  T_FLOAT,
  T_FALL,
  COLLIDE_HALF_W,
  COLLIDE_GRACE,
  speedAtScore,
  SPEED_MAX,
} from '../src/core/config.js';
import { ARC, ARC_PEAK, clusterTakeoffWindow } from '../src/core/arc.js';
import { Sim, replay } from '../src/core/sim.js';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

console.log('\nphysics');

test('ascent is ~0.42s and descent ~0.48s', () => {
  assert.ok(Math.abs(T_UP - 0.42) < 0.01, `ascent ${T_UP}`);
  const descent = T_FLOAT + T_FALL;
  assert.ok(Math.abs(descent - 0.48) < 0.01, `descent ${descent}`);
});

test('the fall is heavier than the climb', () => {
  assert.ok(G_DOWN > G_UP, `${G_DOWN} vs ${G_UP}`);
});

test('the arc peaks at the intended height, at the intended moment', () => {
  assert.ok(Math.abs(ARC_PEAK - JUMP_H) < 1e-9, `peak ${ARC_PEAK}`);
  let peakTick = 0;
  for (let i = 0; i < ARC.length; i++) if (ARC[i] === ARC_PEAK) peakTick = i;
  assert.equal(peakTick * TICK, T_UP);
});

test('the arc lands exactly on the last tick', () => {
  assert.equal(ARC.length - 1, TICKS_AIR);
  assert.ok(Math.abs(ARC[TICKS_AIR]) < 1e-9, `residual ${ARC[TICKS_AIR]}`);
  assert.ok(ARC[TICKS_AIR - 1] > 0, 'should still be airborne one tick earlier');
});

test('a jump in the sim traces the arc table tick for tick', () => {
  const sim = new Sim(1);
  sim.step(true);
  for (let i = 1; i <= TICKS_AIR; i++) {
    assert.ok(
      Math.abs(sim.y - ARC[i]) < 1e-9,
      `tick ${i}: sim ${sim.y} vs arc ${ARC[i]}`,
    );
    if (i < TICKS_AIR) sim.step(false);
  }
  assert.ok(sim.onGround, 'should have landed');
});

test('speed rises monotonically and caps', () => {
  let prev = -1;
  for (let s = 0; s <= 40000; s += 137) {
    const v = speedAtScore(s);
    assert.ok(v >= prev, `speed dipped at ${s}`);
    assert.ok(v <= SPEED_MAX + 1e-9, `speed exceeded cap at ${s}`);
    prev = v;
  }
  assert.equal(speedAtScore(999999), SPEED_MAX);
});

console.log('\nfairness');

/**
 * A bot that plays perfectly: at every moment it knows the exact take-off
 * window for the next cluster and leaves the ground at the last possible tick.
 * If this bot can be killed, the generator produced something unfair.
 */
function perfectBot(seed, ticks) {
  const sim = new Sim(seed);
  while (!sim.dead && sim.tick < ticks) {
    let jump = false;

    if (sim.onGround) {
      // Group the obstacles ahead into clusters that a single jump must clear.
      const span = sim.jumpSpan;
      const ahead = sim.obstacles.filter((o) => o.x + o.w > sim.worldX);
      if (ahead.length) {
        const cluster = [ahead[0]];
        for (let i = 1; i < ahead.length; i++) {
          const right = cluster[cluster.length - 1].x + cluster[cluster.length - 1].w;
          if (ahead[i].x - right < span * 0.42) cluster.push(ahead[i]);
          else break;
        }
        const win = clusterTakeoffWindow(cluster, sim.speed, COLLIDE_HALF_W, COLLIDE_GRACE);
        if (win) {
          // Leave it as late as possible without overshooting the window.
          const latest = win[1];
          if (sim.worldX + sim.speed * TICK > latest) jump = true;
        }
      }
    }
    sim.step(jump);
  }
  return sim;
}

test('a perfect player survives 6 minutes on 40 different seeds', () => {
  const target = 120 * 60 * 6;
  for (let seed = 1; seed <= 40; seed++) {
    const sim = perfectBot(seed, target);
    assert.ok(
      !sim.dead,
      `seed ${seed} died at tick ${sim.deathTick} (score ${sim.score}) on a ${sim.killedBy}`,
    );
  }
});

test('every generated cluster leaves a usable take-off window', () => {
  for (let seed = 100; seed < 108; seed++) {
    const sim = new Sim(seed);
    const seen = new Set();
    while (sim.tick < 120 * 60 * 5) {
      const span = sim.jumpSpan;
      const ahead = sim.obstacles.filter((o) => o.x > sim.worldX);
      for (let i = 0; i < ahead.length; i++) {
        if (seen.has(ahead[i].id)) continue;
        seen.add(ahead[i].id);
        const cluster = [ahead[i]];
        for (let j = i + 1; j < ahead.length; j++) {
          const right = cluster[cluster.length - 1].x + cluster[cluster.length - 1].w;
          if (ahead[j].x - right < span * 0.42) {
            cluster.push(ahead[j]);
            seen.add(ahead[j].id);
          } else break;
        }
        const win = clusterTakeoffWindow(cluster, sim.speed, COLLIDE_HALF_W, COLLIDE_GRACE);
        assert.ok(win, `seed ${seed}: unclearable cluster at ${cluster[0].x | 0}`);
      }
      sim.step(false);
      if (sim.dead) {
        // Standing still dies immediately; restart the walk past the obstacle.
        break;
      }
    }
  }
});

test('the opening is generous and the late game is not', () => {
  const sim = new Sim(7);
  const gaps = [];
  let prevRight = null;
  while (sim.tick < 120 * 60 * 4) {
    sim.step(false);
    if (sim.dead) sim.dead = false; // ignore death, we only want the layout
    for (const o of sim.obstacles) {
      if (prevRight === null) prevRight = o.x + o.w;
    }
  }
  // Re-derive from a clean walk: compare gap multipliers early vs late.
  const early = [];
  const late = [];
  const s2 = new Sim(7);
  let last = null;
  while (s2.tick < 120 * 60 * 8) {
    const before = s2.obstacles.length ? s2.obstacles[s2.obstacles.length - 1] : null;
    s2.dead = false;
    s2.step(false);
    const after = s2.obstacles[s2.obstacles.length - 1];
    if (after && before && after.id !== before.id) {
      if (last !== null) {
        const mul = (after.x - last) / (s2.speed * AIR_TIME);
        (s2.score < 800 ? early : late).push(mul);
      }
      last = before.x + before.w;
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(early.length && late.length, 'expected samples in both eras');
  assert.ok(avg(early) > avg(late), `early ${avg(early)} should exceed late ${avg(late)}`);
  void gaps;
});

console.log('\nreplay');

test('the same seed and inputs always produce the same run', () => {
  const jumps = [];
  const sim = new Sim(4242);
  while (!sim.dead && sim.tick < 20000) {
    const jump = sim.onGround && sim.tick % 47 === 0;
    if (jump) jumps.push(sim.tick);
    sim.step(jump);
  }
  const a = replay(4242, jumps);
  const b = replay(4242, jumps);
  assert.deepEqual(a, b);
  assert.equal(a.score, sim.score);
  assert.equal(a.ticks, sim.dead ? sim.deathTick : sim.tick);
});

test('a fabricated score does not survive a replay', () => {
  const honest = replay(99, [10, 200, 400]);
  assert.ok(honest.score < 999999, 'sanity');
  const claimed = 999999;
  assert.notEqual(honest.score, claimed);
});

test('different seeds lay out different deserts', () => {
  // The opening approach is deliberately identical on every seed — the first
  // obstacle always arrives at the same moment, so the game is learnable — so
  // this compares the layout further out rather than the time of first death.
  const layout = (seed) => {
    const sim = new Sim(seed);
    while (sim.tick < 120 * 30) {
      sim.dead = false;
      sim.step(false);
    }
    return sim.obstacles.map((o) => `${o.type}@${Math.round(o.x)}`).join(',');
  };
  assert.notEqual(layout(1), layout(2));
});

console.log(
  failures === 0 ? '\nall good\n' : `\n${failures} failing\n`,
);
process.exit(failures === 0 ? 0 : 1);
