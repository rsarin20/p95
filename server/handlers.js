import { resolveLocation } from './geo.js';
import { sanitizeCallsign } from './player.js';
import { rateLimiter } from './rate-limit.js';
import { maxPlausibleScore } from './scoring.js';

/**
 * The API, expressed once and independent of how it is being served.
 *
 * Handlers take a plain request shape and return `{ status, body }`, so the
 * long-running Node server and the serverless functions share the exact same
 * logic instead of drifting into two subtly different games.
 */
export function createApi({ store, limits = defaultLimits() }) {
  return {
    /** POST /api/session — mint an identity, resolving a coarse city. */
    async createSession({ body, ip, headers }) {
      const gate = await limits.session(ip);
      if (!gate.ok) return tooMany(gate, 'Slow down a moment.');

      const callsign = sanitizeCallsign(body?.callsign);
      if (!callsign) return bad('Callsign must be 2-16 visible characters.');

      const location = await resolveLocation({ ip, headers });
      const { player, token } = await store.createPlayer({ callsign, location });

      return {
        status: 201,
        body: {
          id: player.id,
          token,
          callsign: player.callsign,
          location: { city: player.city, country: player.country, countryCode: player.countryCode }
        }
      };
    },

    /** PATCH /api/session — rename, and backfill a location the first lookup missed. */
    async updateSession({ body, ip, headers, token }) {
      const gate = await limits.session(ip);
      if (!gate.ok) return tooMany(gate, 'Slow down a moment.');

      const player = await store.authenticate(body?.id, token);
      if (!player) return unauthorized();

      if (body.callsign !== undefined) {
        const callsign = sanitizeCallsign(body.callsign);
        if (!callsign) return bad('Callsign must be 2-16 visible characters.');
        await store.renamePlayer(player, callsign);
      }
      if (!player.city) await store.updateLocation(player, await resolveLocation({ ip, headers }));

      return {
        status: 200,
        body: {
          id: player.id,
          callsign: player.callsign,
          best: player.best,
          location: { city: player.city, country: player.country, countryCode: player.countryCode }
        }
      };
    },

    /** POST /api/score — record a finished run. */
    async postScore({ body, ip, headers, token }) {
      const gate = await limits.score(ip);
      if (!gate.ok) return tooMany(gate, 'Too many runs, too fast.');

      const player = await store.authenticate(body?.id, token);
      if (!player) return unauthorized();

      const score = Number(body.score);
      const durationMs = Number(body.durationMs);
      if (!Number.isFinite(score) || score < 0 || score > 100_000_000) {
        return bad('Score out of range.');
      }
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        return bad('Run duration missing.');
      }
      if (Math.floor(score) > maxPlausibleScore(durationMs)) {
        return { status: 422, body: { error: 'Score is not achievable in that run length.' } };
      }

      const improved = await store.submitScore(player, Math.floor(score));
      if (!player.city) await store.updateLocation(player, await resolveLocation({ ip, headers }));

      return {
        status: 200,
        body: { best: player.best, improved, ...(await store.leaderboard(player.id)) }
      };
    },

    /** GET /api/leaderboard?id= — top 10, your standing, your city's champion. */
    async getLeaderboard({ query, ip }) {
      const gate = await limits.board(ip);
      if (!gate.ok) return tooMany(gate, 'Too many requests.');
      return { status: 200, body: await store.leaderboard(query?.id ?? null) };
    }
  };
}

export function defaultLimits() {
  const session = rateLimiter({ windowMs: 60_000, max: 12 });
  const score = rateLimiter({ windowMs: 60_000, max: 40 });
  const board = rateLimiter({ windowMs: 60_000, max: 120 });
  return { session, score, board };
}

/**
 * Rate limiting backed by the shared store, for hosts that spread traffic over
 * many short-lived instances where a per-process counter means very little.
 */
export function kvLimits(kv) {
  const bucket = (name, windowMs, max) => async (ip) => {
    const key = `capy:rl:${name}:${ip}:${Math.floor(Date.now() / windowMs)}`;
    try {
      const [count] = await kv.pipeline([
        ['INCR', key],
        ['EXPIRE', key, Math.ceil(windowMs / 1000)]
      ]);
      const used = Number(count) || 0;
      return { ok: used <= max, retryAfter: Math.ceil(windowMs / 1000) };
    } catch {
      // Never let a rate-limit backend outage take the game down with it.
      return { ok: true, retryAfter: 0 };
    }
  };

  return {
    session: bucket('session', 60_000, 12),
    score: bucket('score', 60_000, 40),
    board: bucket('board', 60_000, 120)
  };
}

const bad = (error) => ({ status: 400, body: { error } });
const unauthorized = () => ({ status: 401, body: { error: 'Unknown or expired identity.' } });
const tooMany = (gate, error) => ({
  status: 429,
  body: { error },
  headers: { 'retry-after': String(gate.retryAfter ?? 60) }
});
