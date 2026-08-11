import { createApi, defaultLimits, kvLimits } from '../server/handlers.js';
import { kvFromEnv } from '../server/kv.js';
import { KvStore } from '../server/kv-store.js';

/**
 * Serverless wiring, shared by every function in this directory.
 *
 * Module scope survives between invocations on a warm instance, so the store
 * and rate limiters are built once per instance rather than per request.
 */
const kv = kvFromEnv();
export const store = kv ? new KvStore(kv) : null;
export const api = store ? createApi({ store, limits: kvLimits(kv) }) : null;
export const hasStore = Boolean(store);

// Unused when KV is configured; kept so the export shape stays stable.
export const memoryLimits = defaultLimits;

/**
 * Without a Redis binding there is nowhere durable to keep a global board —
 * serverless filesystems are read-only and per-instance. Rather than pretend,
 * say so explicitly: the client understands this and drops into local-only
 * play, so the game stays fully playable on a bare deploy.
 */
export const NO_STORE = {
  status: 503,
  body: {
    error: 'No leaderboard store configured. Playing with local scores only.',
    code: 'no-store'
  }
};

/** Vercel parses JSON bodies already; be tolerant of a raw string too. */
export function readBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export function bearer(req) {
  const header = String(req.headers.authorization ?? '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Vercel sets x-forwarded-for itself, so the left-most entry is trustworthy. */
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

export function context(req) {
  return {
    ip: clientIp(req),
    headers: req.headers,
    token: bearer(req),
    query: req.query ?? {},
    body: readBody(req)
  };
}

export function respond(res, result) {
  res.status(result.status);
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(result.headers ?? {})) res.setHeader(key, value);
  res.json(result.body);
}

/** Wrap a handler with method checking, the no-store guard and error handling. */
export function route(methods, run) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) {
      res.setHeader('allow', methods.join(', '));
      return respond(res, { status: 405, body: { error: 'Method not allowed' } });
    }
    if (!hasStore) return respond(res, NO_STORE);

    try {
      return respond(res, await run(req, context(req)));
    } catch (err) {
      console.error('[api]', err);
      return respond(res, { status: 500, body: { error: 'Internal error' } });
    }
  };
}
