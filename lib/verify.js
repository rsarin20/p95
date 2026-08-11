// Score verification.
//
// The design goal is not a perfect anti-cheat system — there is no such thing
// for a client-side game, and chasing one before launch is a good way to never
// launch. The goal is that casual manipulation is more effort than actually
// getting good at the game, so the leaderboard stays credible.
//
// The client submits what it *did*, not what it scored: a seed and the ticks on
// which the jump key went down. The server re-runs the simulation from that and
// derives the score itself. Posting a made-up number therefore does not work at
// all; you have to submit a real sequence of inputs that really survives that
// long, which is the same problem as playing the game.

import { replay } from '../src/core/sim.js';
import { TICK_RATE, MAX_TICKS, CLIENT_VERSION } from '../src/core/config.js';

const MAX_JUMPS = 20000;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{2,13}$/;
const CITY_RE = /^[\p{L}][\p{L} '\-.]{0,39}$/u;

export function validName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

export function cleanCity(city) {
  if (typeof city !== 'string') return null;
  const trimmed = city.trim();
  // Rejected rather than truncated. No real place name is forty characters
  // long, so cutting one down would just launder junk into a label that looks
  // like a city on the board.
  if (!trimmed || trimmed.length > 40 || !CITY_RE.test(trimmed)) return null;
  return trimmed;
}

function decodeJumps(deltas) {
  const out = [];
  let acc = 0;
  for (const d of deltas) {
    if (!Number.isInteger(d) || d < 0) return null;
    acc += d;
    if (acc > MAX_TICKS) return null;
    out.push(acc);
  }
  return out;
}

/**
 * @returns {{ok: true, score, ticks, name, city, id}
 *          | {ok: false, reason: string}}
 */
export function verify(record) {
  if (!record || typeof record !== 'object') return bad('malformed');

  if (record.v !== CLIENT_VERSION) return bad('client version not accepted');
  if (!validName(record.name)) return bad('bad name');
  if (typeof record.id !== 'string' || record.id.length < 8 || record.id.length > 64) {
    return bad('bad player id');
  }
  if (!Number.isInteger(record.seed) || record.seed < 0 || record.seed > 0xffffffff) {
    return bad('bad seed');
  }
  if (!Array.isArray(record.jumps) || record.jumps.length > MAX_JUMPS) {
    return bad('bad input record');
  }
  if (!Number.isFinite(record.score) || record.score < 0) return bad('bad score');

  const jumpTicks = decodeJumps(record.jumps);
  if (!jumpTicks) return bad('bad input record');

  // Strictly increasing — a replay cannot contain two presses on one tick.
  for (let i = 1; i < jumpTicks.length; i++) {
    if (jumpTicks[i] <= jumpTicks[i - 1]) return bad('bad input record');
  }

  const result = replay(record.seed, jumpTicks);

  // A submitted run is a finished run. The game only ever posts on death, so a
  // replay that is still alive means the input stream was cut short — which is
  // exactly what trimming the jumps after a good stretch would look like.
  if (!result.dead && result.ticks < MAX_TICKS) return bad('run does not end');

  // The claimed score must be the score the inputs actually produce.
  if (result.score !== record.score) {
    return bad(`score does not replay (claimed ${record.score}, replayed ${result.score})`);
  }
  if (Number.isInteger(record.ticks) && record.ticks !== result.ticks) {
    return bad('run length does not replay');
  }

  // Checkpoints are redundant with the replay, but they make a truncated or
  // spliced input stream fail early and loudly rather than scoring oddly.
  if (Array.isArray(record.checkpoints)) {
    const expected = result.checkpoints;
    if (record.checkpoints.length !== expected.length) return bad('checkpoint mismatch');
    for (let i = 0; i < expected.length; i++) {
      if (Math.abs(record.checkpoints[i] - expected[i]) > 1) {
        return bad('checkpoint mismatch');
      }
    }
  }

  // Wall-clock sanity. A run cannot have taken meaningfully less real time than
  // its own simulated length, which rules out replaying a recording at speed.
  const simMs = (result.ticks / TICK_RATE) * 1000;
  if (Number.isFinite(record.duration)) {
    if (record.duration < simMs * 0.85) return bad('run finished faster than real time');
  }

  return {
    ok: true,
    score: result.score,
    ticks: result.ticks,
    id: record.id,
    name: record.name,
    city: cleanCity(record.city),
  };
}

function bad(reason) {
  return { ok: false, reason };
}
