// Tests for the deployed shape.
//
// In production the API is two serverless functions rather than the dev server,
// so these exercise `api/*.js` directly over real HTTP — same handler
// signature, same invocation, same storage fallback a config-free deploy gets.

// Must be set before the board module first resolves a backend.
process.env.VERCEL = '1';
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import score from '../api/score.js';
import leaderboard from '../api/leaderboard.js';
import { Sim } from '../src/core/sim.js';
import { clusterTakeoffWindow } from '../src/core/arc.js';
import {
  TICK,
  TICK_RATE,
  CLIENT_VERSION,
  COLLIDE_HALF_W,
  COLLIDE_GRACE,
} from '../src/core/config.js';

let failures = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/api/score') return score(req, res);
  if (path === '/api/leaderboard') return leaderboard(req, res);
  res.statusCode = 404;
  res.end('{}');
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// --- a real run, played to death -------------------------------------------

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
    at: Date.now(),
  };
}

const post = (body, ip) =>
  fetch(`${BASE}/api/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '10.1.1.1' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const get = (q, headers) =>
  fetch(`${BASE}/api/leaderboard?${q}`, { headers }).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }));

console.log('\napi (serverless shape)');

const run = playUntilDeath(4242, 140);
const record = { ...run, id: 'id-api-test-00001', name: 'apirunner', city: 'Lisbon' };

test('an honest run posts and is ranked', async () => {
  const r = await post(record, '10.1.1.2');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.score, record.score);
  assert.equal(r.body.worldRank, 1);
  assert.equal(r.body.cityRank, 1);
  assert.equal(r.body.city, 'Lisbon');
});

test('a config-free deploy reports its board as not durable', async () => {
  const r = await get('id=id-api-test-00001&city=Lisbon');
  assert.equal(r.status, 200);
  assert.equal(r.body.durable, false, 'memory fallback should admit it is not durable');
});

test('the leaderboard returns the world and city boards', async () => {
  const r = await get('id=id-api-test-00001&city=Lisbon');
  assert.equal(r.body.world.top[0].name, 'apirunner');
  assert.equal(r.body.world.you.rank, 1);
  assert.equal(r.body.city.name, 'Lisbon');
  assert.equal(r.body.city.top[0].score, record.score);
});

test('a fabricated score is rejected by the function too', async () => {
  const r = await post({ ...record, score: 999999999 }, '10.1.1.3');
  assert.equal(r.status, 422);
  assert.match(r.body.error, /replay/);
});

test('a lower later run never demotes a best score', async () => {
  const weak = playUntilDeath(99, 400);
  const r = await post({ ...weak, id: 'id-api-test-00001', name: 'apirunner', city: 'Lisbon' }, '10.1.1.4');
  assert.equal(r.status, 200);
  assert.equal(r.body.best, record.score, 'best should be unchanged');
  assert.equal(r.body.improved, false);
});

test('an edge city header overrides whatever the client claimed', async () => {
  const other = playUntilDeath(31337, 150);
  const r = await fetch(`${BASE}/api/score`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.1.1.5',
      'x-vercel-ip-city': 'Reykjav%C3%ADk',
    },
    body: JSON.stringify({ ...other, id: 'id-api-test-00002', name: 'edgy', city: 'Nowhere' }),
  }).then(async (x) => ({ status: x.status, body: await x.json() }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.city, 'Reykjavík');
});

test('the wrong method is refused', async () => {
  const r = await fetch(`${BASE}/api/score`).then(async (x) => ({ status: x.status }));
  assert.equal(r.status, 405);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

server.close();
console.log(failures === 0 ? '\nall good\n' : `\n${failures} failing\n`);
process.exit(failures === 0 ? 0 : 1);
