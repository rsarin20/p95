// Tests for score verification.
//
// The important property is not "cheats are rejected" — a function that
// rejects everything does that. It is that an honest run is accepted and each
// specific tampering is caught, so both halves are checked here.

import assert from 'node:assert/strict';
import { Sim } from '../src/core/sim.js';
import { clusterTakeoffWindow } from '../src/core/arc.js';
import {
  TICK,
  TICK_RATE,
  CLIENT_VERSION,
  COLLIDE_HALF_W,
  COLLIDE_GRACE,
} from '../src/core/config.js';
import { verify } from '../server/verify.js';

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

/** A player who aims for the last safe moment and misses by a human margin. */
function playUntilDeath(seed, sigmaMs) {
  const sim = new Sim(seed);
  const jumpTicks = [];
  const checkpoints = [];
  let lastId = -1;
  let err = 0;
  let n = seed >>> 0;
  const noise = () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  while (!sim.dead && sim.tick < TICK_RATE * 60 * 45) {
    if (sim.tick % 512 === 0) checkpoints.push(Math.round(sim.dist));
    let jump = false;
    if (sim.onGround) {
      const span = sim.jumpSpan;
      const ahead = sim.obstacles.filter((o) => o.x + o.w > sim.worldX);
      if (ahead.length) {
        const cl = [ahead[0]];
        for (let i = 1; i < ahead.length; i++) {
          const r = cl[cl.length - 1].x + cl[cl.length - 1].w;
          if (ahead[i].x - r < span * 0.42) cl.push(ahead[i]);
          else break;
        }
        const win = clusterTakeoffWindow(cl, sim.speed, COLLIDE_HALF_W, COLLIDE_GRACE);
        if (win) {
          if (cl[0].id !== lastId) {
            lastId = cl[0].id;
            err = noise() * (sigmaMs / 1000) * sim.speed * 2;
          }
          if (sim.worldX + sim.speed * TICK > win[1] - err) jump = true;
        }
      }
    }
    if (jump) jumpTicks.push(sim.tick);
    sim.step(jump);
  }
  return { sim, jumpTicks, checkpoints };
}

function recordFor(seed, sigmaMs = 140) {
  const { sim, jumpTicks, checkpoints } = playUntilDeath(seed, sigmaMs);
  const ticks = sim.dead ? sim.deathTick : sim.tick;
  const deltas = [];
  let prev = 0;
  for (const t of jumpTicks) {
    deltas.push(t - prev);
    prev = t;
  }
  return {
    v: CLIENT_VERSION,
    seed,
    score: sim.score,
    ticks,
    jumps: deltas,
    checkpoints,
    duration: Math.round((ticks / TICK_RATE) * 1000 * 1.03),
    id: 'id-test-000000000',
    name: 'tester',
    city: 'London',
    at: Date.now(),
  };
}

console.log('\nverification');

const honest = recordFor(777);

test('an honest run is accepted, with the score the inputs produce', () => {
  const r = verify(honest);
  assert.ok(r.ok, `rejected: ${r.reason}`);
  assert.equal(r.score, honest.score);
  assert.equal(r.name, 'tester');
  assert.equal(r.city, 'London');
  assert.ok(r.score > 0, 'the test run should have gone somewhere');
});

test('several different honest runs all replay', () => {
  for (const seed of [11, 222, 3333, 44444]) {
    const rec = recordFor(seed);
    const r = verify(rec);
    assert.ok(r.ok, `seed ${seed} rejected: ${r.reason}`);
    assert.equal(r.score, rec.score);
  }
});

const tampering = {
  'an inflated score': { score: 999999999 },
  'a big score with no jumps at all': { jumps: [], score: 500000 },
  'a padded run length': { ticks: honest.ticks + 500 },
  'shifted checkpoints': { checkpoints: honest.checkpoints.map((c) => c + 50) },
  'a run replayed faster than real time': { duration: 50 },
  'markup in the name': { name: '<script>x</script>' },
  'an unknown client version': { v: 99 },
  'a negative jump delta': { jumps: [10, -5, 20] },
  'jumps trimmed to stop before the death': { jumps: honest.jumps.slice(0, -2) },
};

for (const [label, patch] of Object.entries(tampering)) {
  test(`rejects ${label}`, () => {
    const r = verify({ ...honest, ...patch });
    assert.equal(r.ok, false, 'should not be accepted');
    assert.ok(typeof r.reason === 'string' && r.reason.length, 'should say why');
  });
}

test('a run cannot be replayed under another player id without redoing it', () => {
  // Re-submitting somebody else's inputs is possible — and pointless, because
  // it is the same score. What must not work is the inputs *plus* a better
  // number attached to them.
  const stolen = { ...honest, id: 'id-thief-00000000', name: 'thief', score: honest.score + 1 };
  const r = verify(stolen);
  assert.equal(r.ok, false);
});

test('city is sanitised rather than trusted', () => {
  assert.equal(verify({ ...honest, city: 'Stoke-on-Trent' }).city, 'Stoke-on-Trent');
  assert.equal(verify({ ...honest, city: "N'Djamena" }).city, "N'Djamena");
  assert.equal(verify({ ...honest, city: '<img src=x>' }).city, null);
  assert.equal(verify({ ...honest, city: 'x'.repeat(200) }).city, null);
});

console.log(failures === 0 ? '\nall good\n' : `\n${failures} failing\n`);
process.exit(failures === 0 ? 0 : 1);
