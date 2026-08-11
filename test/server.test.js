import { strict as assert } from 'node:assert';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { isPrivateIp } from '../server/geo.js';
import { rateLimiter } from '../server/rate-limit.js';
import { maxPlausibleScore } from '../server/scoring.js';
import { Store, sanitizeCallsign } from '../server/store.js';

const tmpFile = () => join(tmpdir(), `capy-test-${Math.random().toString(36).slice(2)}.json`);

test('callsigns are cleaned up, not trusted', () => {
  assert.equal(sanitizeCallsign('FastCapy'), 'FastCapy');
  assert.equal(sanitizeCallsign('  spaced   out  '), 'spaced out');
  assert.equal(sanitizeCallsign('a'.repeat(40)), 'a'.repeat(16), 'must be truncated');

  // Control characters and bidi/zero-width tricks are stripped outright.
  // Written as escapes so this file stays readable plain text.
  assert.equal(sanitizeCallsign('Cap\u0000y'), 'Capy', 'NUL byte');
  assert.equal(sanitizeCallsign('Ca\u202Epy'), 'Capy', 'right-to-left override');
  assert.equal(sanitizeCallsign('Fast\u200BCapy'), 'FastCapy', 'zero-width space');
  assert.equal(sanitizeCallsign('\u200B\u200B'), null, 'nothing visible left');

  assert.equal(sanitizeCallsign('x'), null, 'too short');
  assert.equal(sanitizeCallsign('   '), null);
  assert.equal(sanitizeCallsign(42), null);
  assert.equal(sanitizeCallsign(undefined), null);
});

test('a player can only post scores with their own token', async () => {
  const file = tmpFile();
  const store = new Store(file);
  const { player, token } = store.createPlayer({ callsign: 'Capy', location: {} });

  assert.equal(store.authenticate(player.id, token)?.id, player.id);
  assert.equal(store.authenticate(player.id, 'wrong'), null);
  assert.equal(store.authenticate(player.id, ''), null);
  assert.equal(store.authenticate(player.id, undefined), null);
  assert.equal(store.authenticate('not-a-player', token), null);

  await rm(file, { force: true });
});

test('the raw token is never persisted', async () => {
  const file = tmpFile();
  const store = new Store(file);
  const { token } = store.createPlayer({ callsign: 'Capy', location: {} });
  await store.flush();

  const written = await (await import('node:fs/promises')).readFile(file, 'utf8');
  assert.ok(!written.includes(token), 'the plaintext token leaked into the data file');
  assert.ok(written.includes('tokenHash'));

  await rm(file, { force: true });
});

test('only a better run moves the personal best', async () => {
  const file = tmpFile();
  const store = new Store(file);
  const { player } = store.createPlayer({ callsign: 'Capy', location: {} });

  assert.equal(store.submitScore(player, 500), true);
  assert.equal(player.best, 500);
  assert.equal(store.submitScore(player, 200), false, 'a worse run must not lower the best');
  assert.equal(player.best, 500);
  assert.equal(player.runs, 2, 'every run is still counted');

  await rm(file, { force: true });
});

test('the leaderboard ranks, finds you, and names your city champion', async () => {
  const file = tmpFile();
  const store = new Store(file);

  const make = (callsign, best, city) => {
    const { player } = store.createPlayer({
      callsign,
      location: city ? { city, country: 'Portugal', countryCode: 'PT' } : {}
    });
    store.submitScore(player, best);
    return player;
  };

  const top = make('RiverKing', 9000, 'Lisbon');
  make('FastCapy', 4000, 'Lisbon');
  const you = make('Drifter', 1200, 'Lisbon');
  make('Nobody', 0, 'Porto');

  const board = store.leaderboard(you.id);
  assert.deepEqual(board.top.map((r) => r.callsign), ['RiverKing', 'FastCapy', 'Drifter']);
  assert.deepEqual(board.top.map((r) => r.rank), [1, 2, 3]);
  assert.equal(board.totalPlayers, 3, 'a player who never scored is not ranked');

  assert.equal(board.you.rank, 3);
  assert.equal(board.you.inTop, true);

  assert.equal(board.local.city, 'Lisbon');
  assert.equal(board.local.champion.callsign, top.callsign);
  assert.equal(board.local.players, 3);
  assert.equal(board.local.yourRank, 3);

  // Someone with no identity still sees the global board.
  const anon = store.leaderboard(null);
  assert.equal(anon.you, null);
  assert.equal(anon.local, null);
  assert.equal(anon.top.length, 3);

  await rm(file, { force: true });
});

test('players survive a save/load round trip', async () => {
  const file = tmpFile();
  const store = new Store(file);
  const { player, token } = store.createPlayer({
    callsign: 'Capy',
    location: { city: 'Zurich', country: 'Switzerland', countryCode: 'CH' }
  });
  store.submitScore(player, 7777);
  await store.flush();

  const reloaded = await new Store(file).load();
  const same = reloaded.authenticate(player.id, token);
  assert.equal(same.callsign, 'Capy');
  assert.equal(same.best, 7777);
  assert.equal(same.city, 'Zurich');

  await rm(file, { force: true });
});

test('a missing data file is not an error', async () => {
  const store = await new Store(join(tmpdir(), 'capy-does-not-exist.json')).load();
  assert.deepEqual(store.leaderboard(null), { top: [], you: null, local: null, totalPlayers: 0 });
});

test('score plausibility tracks the real difficulty curve', () => {
  // A 60s run: speed climbs 330 → ~372, so honest scores land near 21k.
  const realistic = maxPlausibleScore(60_000);
  assert.ok(realistic > 21_000, `bound too tight for a real run: ${realistic}`);
  assert.ok(realistic < 90_000, `bound too loose for a 60s run: ${realistic}`);

  // Nobody scores six figures in three seconds.
  assert.ok(maxPlausibleScore(3000) < 12_000);
  // The bound has to keep rising, or long runs would start getting rejected.
  assert.ok(maxPlausibleScore(600_000) > maxPlausibleScore(300_000));
  // A zero-length run still gets a small allowance rather than zero.
  assert.ok(maxPlausibleScore(0) > 0);
});

test('private and loopback addresses are never sent to the geo service', () => {
  for (const ip of ['127.0.0.1', '::1', '10.0.0.4', '192.168.1.9', '172.16.0.1', '172.31.255.1',
                    '169.254.1.1', '100.100.0.1', 'fd00::1', 'fe80::1', '', 'not-an-ip']) {
    assert.equal(isPrivateIp(ip), true, `${ip} should be treated as private`);
  }
  for (const ip of ['8.8.8.8', '203.0.113.7', '172.15.0.1', '172.32.0.1', '2606:4700::1111']) {
    assert.equal(isPrivateIp(ip), false, `${ip} should be treated as public`);
  }
});

test('the rate limiter opens a fresh window after it expires', () => {
  const allow = rateLimiter({ windowMs: 50, max: 2 });
  assert.equal(allow('a').ok, true);
  assert.equal(allow('a').ok, true);
  assert.equal(allow('a').ok, false, 'third call in the window is blocked');
  assert.equal(allow('b').ok, true, 'a different caller is unaffected');

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(allow('a').ok, true, 'the window should have rolled over');
      resolve();
    }, 60);
  });
});
