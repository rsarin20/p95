// MOONHOP server.
//
// Two API routes and a static file handler, no dependencies. The game is
// entirely playable without any of this — the server exists only so that a
// global leaderboard can exist, which is the one thing a purely offline game
// cannot do for itself.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Board, boardSlice } from './store.js';
import { verify, cleanCity } from './verify.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const board = new Board(process.env.MOONHOP_DATA || join(ROOT, 'data', 'leaderboard.json'));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
//
// Verification replays a run, which costs real CPU on a long submission. A
// simple per-address token bucket keeps that from being a free denial of
// service, and incidentally makes brute-forcing the leaderboard tedious.

const buckets = new Map();

function allow(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return b.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientKey(req) {
  // Behind a proxy the first hop of x-forwarded-for is the client. Trusted
  // only for rate limiting — never stored, never sent anywhere.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/**
 * A city label from the edge, if the deployment provides one.
 *
 * Only ever a city name. No coordinates, no address, no IP is read for this
 * purpose or persisted anywhere — the leaderboard's "place" column is the only
 * consumer, and a town name is all it displays.
 */
function cityFromHeaders(req) {
  const h = req.headers;
  const raw =
    h['cf-ipcity'] || h['x-vercel-ip-city'] || h['x-geo-city'] || h['fastly-geo-city'];
  if (!raw) return null;
  try {
    return cleanCity(decodeURIComponent(String(raw)));
  } catch {
    return cleanCity(String(raw));
  }
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

const MAX_BODY = 512 * 1024;

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
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
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function postScore(req, res) {
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

  board.submit(result);
  board.save().catch((err) => console.error('save failed:', err.message));

  const worldRank = board.rankOf(result.id);
  const cityRank = board.cityRankOf(result.id, result.city);

  return send(res, 200, {
    ok: true,
    score: result.score,
    best: board.players.get(result.id).score,
    worldRank,
    cityRank,
    city: result.city,
  });
}

function getLeaderboard(req, res, url) {
  if (!allow(`read:${clientKey(req)}`, 120, 60_000)) {
    return send(res, 429, { error: 'slow down' });
  }

  const id = url.searchParams.get('id') || '';
  const city = cityFromHeaders(req) || cleanCity(url.searchParams.get('city'));

  const world = boardSlice(board.ranking(), id);
  const cityBoard = city
    ? { name: city, ...boardSlice(board.cityRanking(city), id) }
    : null;

  return send(res, 200, { world, city: cityBoard });
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel);

  // Never serve outside the project root, whatever the path claims to be.
  if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
  // The leaderboard file lives under the project root but is not public.
  if (file.startsWith(join(ROOT, 'data'))) return send(res, 404, { error: 'not found' });

  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file);
    }
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': info.size,
      // The service worker is what handles caching; keeping the server honest
      // avoids stale modules during development.
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
    });
    res.end(body);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/api/score' && req.method === 'POST') {
      return await postScore(req, res);
    }
    if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
      return getLeaderboard(req, res, url);
    }
    if (url.pathname.startsWith('/api/')) {
      return send(res, 404, { error: 'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { error: 'method not allowed' });
    }
    return await serveStatic(req, res, url.pathname === '/' ? '/index.html' : url.pathname);
  } catch (err) {
    console.error('request failed:', err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});

await board.load();

server.listen(PORT, HOST, () => {
  console.log(`moonhop listening on http://${HOST}:${PORT}`);
  console.log(`${board.players.size} players on the board`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await board.save().catch(() => {});
    server.close(() => process.exit(0));
  });
}
