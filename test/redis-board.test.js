// Tests for the Redis leaderboard backend.
//
// Run against a small in-memory stand-in that speaks the Upstash REST pipeline
// protocol. The point is not to test Redis — it is that the command sequences
// this code sends are the ones it thinks it is sending, because the Redis path
// is what runs in production the moment a KV store is attached, and a mistake
// there is a broken leaderboard for real players.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RedisBoard, redisConfig } from '../lib/redis-board.js';

let failures = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- a very small Redis ----------------------------------------------------

const hashes = new Map(); // key -> Map(field -> value)
const zsets = new Map(); // key -> Map(member -> score)

const hash = (k) => {
  if (!hashes.has(k)) hashes.set(k, new Map());
  return hashes.get(k);
};
const zset = (k) => {
  if (!zsets.has(k)) zsets.set(k, new Map());
  return zsets.get(k);
};

/** Descending order: score desc, then member desc — Redis's reverse ordering. */
function revSorted(key) {
  return [...zset(key).entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0),
  );
}

function run(cmd) {
  const op = String(cmd[0]).toUpperCase();
  const args = cmd.slice(1);

  switch (op) {
    case 'HSET': {
      hash(args[0]).set(args[1], args[2]);
      return 1;
    }
    case 'HGET':
      return hash(args[0]).get(args[1]) ?? null;
    case 'HMGET':
      return args.slice(1).map((f) => hash(args[0]).get(f) ?? null);
    case 'ZADD': {
      const key = args[0];
      let i = 1;
      let gt = false;
      while (['GT', 'LT', 'NX', 'XX', 'CH'].includes(String(args[i]).toUpperCase())) {
        if (String(args[i]).toUpperCase() === 'GT') gt = true;
        i++;
      }
      const score = Number(args[i]);
      const member = args[i + 1];
      const z = zset(key);
      const prev = z.get(member);
      if (gt && prev !== undefined && score <= prev) return 0;
      z.set(member, score);
      return prev === undefined ? 1 : 1;
    }
    case 'ZREM':
      return zset(args[0]).delete(args[1]) ? 1 : 0;
    case 'ZCARD':
      return zset(args[0]).size;
    case 'ZREVRANK': {
      const idx = revSorted(args[0]).findIndex(([m]) => m === args[1]);
      return idx < 0 ? null : idx;
    }
    case 'ZREVRANGE': {
      const all = revSorted(args[0]);
      let start = Number(args[1]);
      let stop = Number(args[2]);
      if (start < 0) start = Math.max(0, all.length + start);
      if (stop < 0) stop = all.length + stop;
      stop = Math.min(stop, all.length - 1);
      const slice = start > stop ? [] : all.slice(start, stop + 1);
      const withScores = String(args[3] || '').toUpperCase() === 'WITHSCORES';
      return withScores ? slice.flatMap(([m, s]) => [m, String(s)]) : slice.map(([m]) => m);
    }
    default:
      throw new Error(`mock redis: unsupported ${op}`);
  }
}

const redis = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.statusCode = 401;
      return res.end('{}');
    }
    let out;
    try {
      out = JSON.parse(body).map((cmd) => {
        try {
          return { result: run(cmd) };
        } catch (err) {
          return { error: err.message };
        }
      });
    } catch {
      res.statusCode = 400;
      return res.end('{}');
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  });
});

await new Promise((r) => redis.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${redis.address().port}`;

console.log('\nredis backend');

test('credentials are read from either Vercel KV or Upstash variables', () => {
  assert.equal(redisConfig({}), null);
  assert.deepEqual(redisConfig({ KV_REST_API_URL: 'https://a/', KV_REST_API_TOKEN: 't' }), {
    url: 'https://a',
    token: 't',
  });
  assert.deepEqual(
    redisConfig({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 'u' }),
    { url: 'https://b', token: 'u' },
  );
});

const board = new RedisBoard({ url, token: 'test-token' });

test('a first run is stored and ranked', async () => {
  const r = await board.submit({ id: 'p1', name: 'ann', city: 'Lisbon', score: 1200, ticks: 900 });
  assert.equal(r.improved, true);
  assert.equal(r.best, 1200);
  assert.deepEqual(await board.ranks('p1', 'Lisbon'), { worldRank: 1, cityRank: 1 });
});

test('a better run raises the best, a worse one never lowers it', async () => {
  await board.submit({ id: 'p1', name: 'ann', city: 'Lisbon', score: 3000, ticks: 2000 });
  let r = await board.submit({ id: 'p1', name: 'ann', city: 'Lisbon', score: 50, ticks: 40 });
  assert.equal(r.improved, false);
  assert.equal(r.best, 3000, 'a late low run must not demote a best score');

  const board2 = await board.scope(null, 'p1', 10, 1);
  assert.equal(board2.top[0].score, 3000);
});

test('players are ranked against each other', async () => {
  await board.submit({ id: 'p2', name: 'bo', city: 'Lisbon', score: 9000, ticks: 5000 });
  await board.submit({ id: 'p3', name: 'cy', city: 'Oslo', score: 5000, ticks: 3000 });

  const world = await board.scope(null, 'p1', 10, 1);
  assert.deepEqual(
    world.top.map((e) => [e.rank, e.name, e.score]),
    [
      [1, 'bo', 9000],
      [2, 'cy', 5000],
      [3, 'ann', 3000],
    ],
  );
  assert.equal(world.total, 3);
  assert.equal(world.you.rank, 3);
});

test('the city board only contains that city', async () => {
  const lisbon = await board.scope('Lisbon', 'p1', 10, 1);
  assert.deepEqual(lisbon.top.map((e) => e.name), ['bo', 'ann']);
  assert.equal(lisbon.you.rank, 2);

  const oslo = await board.scope('Oslo', 'p3', 10, 1);
  assert.deepEqual(oslo.top.map((e) => e.name), ['cy']);
});

test('moving city removes you from the old board', async () => {
  await board.submit({ id: 'p3', name: 'cy', city: 'Bergen', score: 5200, ticks: 3100 });
  const oslo = await board.scope('Oslo', 'p3', 10, 1);
  assert.equal(oslo.total, 0, 'should no longer appear in Oslo');
  const bergen = await board.scope('Bergen', 'p3', 10, 1);
  assert.deepEqual(bergen.top.map((e) => e.name), ['cy']);
});

test('a player outside the top ten gets the rows around them', async () => {
  // Fill in enough players to push our man well down the board.
  for (let i = 0; i < 30; i++) {
    await board.submit({
      id: `f${i}`,
      name: `filler${i}`,
      city: 'Lisbon',
      score: 100000 - i * 100,
      ticks: 1000,
    });
  }
  await board.submit({ id: 'deep', name: 'deep', city: 'Lisbon', score: 96550, ticks: 1000 });

  const world = await board.scope(null, 'deep', 10, 1);
  assert.equal(world.top.length, 10);
  assert.ok(world.you, 'should still find the player');
  assert.ok(world.you.rank > 10, `expected a rank past the top ten, got ${world.you.rank}`);
  assert.equal(world.window.length, 3, 'one either side');
  assert.equal(world.window[1].id, 'deep');
  assert.equal(world.window[0].rank, world.you.rank - 1);
  assert.equal(world.window[2].rank, world.you.rank + 1);
  assert.ok(
    world.window[0].score > world.you.score && world.window[2].score < world.you.score,
    'the neighbours should bracket the player',
  );
});

test('an unknown player simply has no place yet', async () => {
  const world = await board.scope(null, 'nobody', 10, 1);
  assert.equal(world.you, null);
  assert.deepEqual(world.window, []);
  assert.deepEqual(await board.ranks('nobody', 'Lisbon'), { worldRank: null, cityRank: null });
});

test('a redis error surfaces rather than being swallowed', async () => {
  await assert.rejects(() => board.one(['NOTACOMMAND', 'x']), /unsupported/);
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

redis.close();
console.log(failures === 0 ? '\nall good\n' : `\n${failures} failing\n`);
process.exit(failures === 0 ? 0 : 1);
