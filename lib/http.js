// Request handling shared by the Vercel functions and the local dev server.
//
// Both hosts hand over a Node request/response pair, so the actual route logic
// only has to be written once and behaves identically in development and in
// production.

import { verify, cleanCity } from './verify.js';
import { readBoard, submitRun } from './board.js';

const MAX_BODY = 512 * 1024;

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
//
// Verification replays a whole run, which costs real CPU on a long submission.
// A token bucket keeps that from being a free denial of service.
//
// On a serverless host this is per-instance and therefore only approximate —
// it is a cost guard, not a security boundary. The thing actually protecting
// the leaderboard is that a score has to replay.

const buckets = new Map();

export function allow(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }
  return b.count <= limit;
}

export function clientKey(req) {
  // Behind a proxy the first hop of x-forwarded-for is the client. Used only
  // for rate limiting — never stored, never sent anywhere.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * A city label from the edge, if the host provides one.
 *
 * Only ever a city name. No coordinates, no address, and no IP is read for
 * this purpose or persisted — the leaderboard's "place" column is the only
 * consumer, and a town name is all it shows.
 */
export function cityFromHeaders(req) {
  const h = req.headers;
  const raw =
    h['x-vercel-ip-city'] || h['cf-ipcity'] || h['x-geo-city'] || h['fastly-geo-city'];
  if (!raw) return null;
  try {
    return cleanCity(decodeURIComponent(String(raw)));
  } catch {
    return cleanCity(String(raw));
  }
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  // Vercel may have parsed the body already.
  if (req.body !== undefined && req.body !== null) {
    return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function handleScore(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  if (!allow(`score:${clientKey(req)}`, 20, 60_000)) {
    return send(res, 429, { error: 'slow down' });
  }

  let record;
  try {
    record = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: 'bad request' });
  }

  // An edge-provided city wins over the client's guess when both exist.
  const edgeCity = cityFromHeaders(req);
  if (edgeCity) record.city = edgeCity;

  const result = verify(record);
  if (!result.ok) {
    // 4xx so the client stops retrying a run that will never be accepted.
    return send(res, 422, { error: result.reason });
  }

  const outcome = await submitRun(result);
  return send(res, 200, {
    ok: true,
    score: result.score,
    city: result.city,
    ...outcome,
  });
}

export async function handleLeaderboard(req, res, url) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  if (!allow(`read:${clientKey(req)}`, 120, 60_000)) {
    return send(res, 429, { error: 'slow down' });
  }

  const id = url.searchParams.get('id') || '';
  const city = cityFromHeaders(req) || cleanCity(url.searchParams.get('city'));

  return send(res, 200, await readBoard(id, city));
}
