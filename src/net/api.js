// Talking to the leaderboard.
//
// The game never waits for the network. A run is recorded, queued, and then
// submitted whenever a connection happens to exist — which may be immediately,
// or two hours later when the plane lands. Nothing in the play loop depends on
// any of this succeeding.

import { CLIENT_VERSION } from '../core/config.js';
import * as store from './storage.js';

const TIMEOUT = 8000;

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(path, {
      ...options,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || `http ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the record for a finished run.
 *
 * Note what is *not* in here: the score is included, but it is not what the
 * server trusts. The seed and the exact ticks on which the player jumped are
 * enough to re-run the whole thing, so the score is a claim the server checks
 * rather than a number it accepts.
 */
export function buildRecord(run) {
  return {
    v: CLIENT_VERSION,
    seed: run.seed,
    score: run.score,
    ticks: run.ticks,
    jumps: deltaEncode(run.jumpTicks),
    checkpoints: run.checkpoints,
    duration: Math.round(run.durationMs),
    id: store.playerId(),
    name: store.getName(),
    city: store.detectCity(),
    at: Date.now(),
  };
}

/** Jump ticks are strictly increasing, so gaps compress much better than values. */
function deltaEncode(ticks) {
  const out = [];
  let prev = 0;
  for (const t of ticks) {
    out.push(t - prev);
    prev = t;
  }
  return out;
}

export function decodeJumps(deltas) {
  const out = [];
  let acc = 0;
  for (const d of deltas) {
    acc += d;
    out.push(acc);
  }
  return out;
}

export async function submitScore(record) {
  return request('/api/score', { method: 'POST', body: JSON.stringify(record) });
}

export async function fetchLeaderboard({ id, city } = {}) {
  const q = new URLSearchParams();
  if (id) q.set('id', id);
  if (city) q.set('city', city);
  return request(`/api/leaderboard?${q.toString()}`);
}

/**
 * Send everything that is waiting. Returns the result of the best run that
 * went up, so the caller can show a rank change if one happened.
 */
export async function flushQueue() {
  const pending = store.queued();
  if (!pending.length) return null;

  const remaining = [];
  let best = null;

  for (const record of pending) {
    try {
      const res = await submitScore(record);
      if (!best || record.score > best.score) best = { ...res, score: record.score };
    } catch (err) {
      // A rejected run is gone for good; there is no point retrying a record
      // the server has already judged invalid. Anything else is worth keeping.
      if (!err.status || err.status >= 500 || err.status === 0) remaining.push(record);
    }
  }

  store.setQueue(remaining);
  return best;
}

export function onReconnect(fn) {
  window.addEventListener('online', fn);
}

export const isOnline = () => navigator.onLine !== false;
