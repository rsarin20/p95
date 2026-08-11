import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApi, kvLimits } from '../server/handlers.js';
import { KvStore } from '../server/kv-store.js';

/**
 * An in-memory stand-in for the Redis commands `KvStore` actually uses.
 *
 * The serverless deploy path can't be exercised against a real Redis from here,
 * and shipping it unverified would mean the first test run happens in someone's
 * production. This mock keeps the same semantics that matter: sorted sets order
 * by score then member, and ranks are zero-based.
 */
class FakeKv {
  strings = new Map();
  zsets = new Map();
  calls = 0;

  #zset(key) {
    if (!this.zsets.has(key)) this.zsets.set(key, new Map());
    return this.zsets.get(key);
  }

  #ordered(key) {
    return [...this.#zset(key).entries()].sort(
      (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    );
  }

  /** One network round trip, whether it carries one command or twenty. */
  async run(...command) {
    this.calls += 1;
    return this.#exec(command);
  }

  async pipeline(commands) {
    this.calls += 1;
    const out = [];
    for (const command of commands) out.push(await this.#exec(command));
    return out;
  }

  #exec(command) {
    const [name, ...args] = command.map(String);

    switch (name.toUpperCase()) {
      case 'SET':
        this.strings.set(args[0], args[1]);
        return 'OK';
      case 'GET':
        return this.strings.get(args[0]) ?? null;
      case 'ZADD':
        this.#zset(args[0]).set(args[2], Number(args[1]));
        return 1;
      case 'ZCARD':
        return this.#zset(args[0]).size;
      case 'ZREVRANGE': {
        const members = this.#ordered(args[0]).map(([m]) => m).reverse();
        const stop = Number(args[2]);
        return members.slice(Number(args[1]), stop < 0 ? undefined : stop + 1);
      }
      case 'ZREVRANK': {
        const index = this.#ordered(args[0]).map(([m]) => m).reverse().indexOf(args[1]);
        return index === -1 ? null : index;
      }
      case 'INCR': {
        const next = Number(this.strings.get(args[0]) ?? 0) + 1;
        this.strings.set(args[0], String(next));
        return next;
      }
      case 'EXPIRE':
        return 1;
      default:
        throw new Error(`FakeKv does not implement ${name}`);
    }
  }
}

const ctx = (extra = {}) => ({ ip: '203.0.113.7', headers: {}, query: {}, body: {}, ...extra });

/** Vercel/Cloudflare-style edge geo, so no outbound lookup is attempted. */
const withCity = (city, countryCode) => ({
  'x-vercel-ip-city': encodeURIComponent(city),
  'x-vercel-ip-country': countryCode
});

test('the serverless store round-trips a player through the real handlers', async () => {
  const kv = new FakeKv();
  const api = createApi({ store: new KvStore(kv), limits: kvLimits(kv) });

  const created = await api.createSession(
    ctx({ body: { callsign: 'FastCapy' }, headers: withCity('Zurich', 'ch') })
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.callsign, 'FastCapy');
  assert.equal(created.body.location.city, 'Zurich');
  assert.equal(created.body.location.countryCode, 'CH');

  const { id, token } = created.body;

  const posted = await api.postScore(ctx({ token, body: { id, score: 4200, durationMs: 14_000 } }));
  assert.equal(posted.status, 200);
  assert.equal(posted.body.best, 4200);
  assert.equal(posted.body.improved, true);
  assert.equal(posted.body.you.rank, 1);
  assert.equal(posted.body.top[0].callsign, 'FastCapy');

  const worse = await api.postScore(ctx({ token, body: { id, score: 100, durationMs: 14_000 } }));
  assert.equal(worse.body.best, 4200, 'a worse run must not lower the best');
  assert.equal(worse.body.improved, false);
});

test('the serverless store ranks a field and finds the city champion', async () => {
  const kv = new FakeKv();
  const store = new KvStore(kv);
  const api = createApi({ store, limits: kvLimits(kv) });

  const join = async (callsign, score, city) => {
    const created = await api.createSession(
      ctx({ body: { callsign }, headers: withCity(city, 'pt') })
    );
    const { id, token } = created.body;
    await api.postScore(ctx({ token, body: { id, score, durationMs: 600_000 } }));
    return id;
  };

  await join('RiverKing', 9000, 'Lisbon');
  await join('YuzuHead', 4000, 'Lisbon');
  const you = await join('Drifter', 1200, 'Lisbon');
  await join('Nibbles', 7000, 'Porto');

  const board = await store.leaderboard(you);
  assert.deepEqual(
    board.top.map((r) => r.callsign),
    ['RiverKing', 'Nibbles', 'YuzuHead', 'Drifter']
  );
  assert.deepEqual(board.top.map((r) => r.rank), [1, 2, 3, 4]);
  assert.equal(board.totalPlayers, 4);

  assert.equal(board.you.callsign, 'Drifter');
  assert.equal(board.you.rank, 4);
  assert.equal(board.you.inTop, true);

  assert.equal(board.local.city, 'Lisbon');
  assert.equal(board.local.champion.callsign, 'RiverKing');
  assert.equal(board.local.players, 3, 'Porto must not count towards Lisbon');
  assert.equal(board.local.yourRank, 3);

  // A stranger still gets the global board, with no personal rows.
  const anon = await store.leaderboard(null);
  assert.equal(anon.you, null);
  assert.equal(anon.local, null);
  assert.equal(anon.top.length, 4);
});

test('a leaderboard read stays within a couple of round trips', async () => {
  const kv = new FakeKv();
  const store = new KvStore(kv);
  const api = createApi({ store, limits: kvLimits(kv) });

  const created = await api.createSession(ctx({ body: { callsign: 'Capy' }, headers: withCity('Lisbon', 'pt') }));
  const { id, token } = created.body;
  await api.postScore(ctx({ token, body: { id, score: 500, durationMs: 10_000 } }));

  kv.calls = 0;
  await store.leaderboard(id);
  assert.ok(kv.calls <= 2, `leaderboard took ${kv.calls} round trips; batching has regressed`);
});

test('a bad token is rejected by the serverless path too', async () => {
  const kv = new FakeKv();
  const api = createApi({ store: new KvStore(kv), limits: kvLimits(kv) });

  const created = await api.createSession(ctx({ body: { callsign: 'Capy' } }));
  const { id } = created.body;

  const forged = await api.postScore(ctx({ token: 'nope', body: { id, score: 10, durationMs: 1000 } }));
  assert.equal(forged.status, 401);

  const missing = await api.postScore(ctx({ body: { id, score: 10, durationMs: 1000 } }));
  assert.equal(missing.status, 401);
});

test('an impossible score is refused before it reaches the store', async () => {
  const kv = new FakeKv();
  const api = createApi({ store: new KvStore(kv), limits: kvLimits(kv) });

  const created = await api.createSession(ctx({ body: { callsign: 'Capy' } }));
  const { id, token } = created.body;

  const cheated = await api.postScore(ctx({ token, body: { id, score: 9_999_999, durationMs: 3000 } }));
  assert.equal(cheated.status, 422);

  const board = await new KvStore(kv).leaderboard(id);
  assert.equal(board.totalPlayers, 0, 'a refused score must not reach the board');
});

test('shared rate limiting closes the door after the burst', async () => {
  const kv = new FakeKv();
  const limits = kvLimits(kv);

  let blocked = 0;
  for (let i = 0; i < 15; i++) {
    const gate = await limits.session('198.51.100.4');
    if (!gate.ok) blocked += 1;
  }
  assert.equal(blocked, 3, 'the 13th through 15th session calls should be refused');

  const other = await limits.session('198.51.100.5');
  assert.equal(other.ok, true, 'a different caller is unaffected');
});

test('a rate-limit backend outage never blocks play', async () => {
  const broken = { pipeline: async () => { throw new Error('redis is down'); } };
  const gate = await kvLimits(broken).score('203.0.113.7');
  assert.equal(gate.ok, true, 'failing open beats taking the game down');
});
