import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Store, sanitizeCallsign } from './store.js';
import { clientIp, lookup } from './geo.js';
import { rateLimiter } from './rate-limit.js';
import { maxPlausibleScore } from './scoring.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_FILE = process.env.DATA_FILE ?? join(ROOT, 'data', 'leaderboard.json');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY_BYTES = 4 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const store = await new Store(DATA_FILE).load();
const limitSession = rateLimiter({ windowMs: 60_000, max: 12 });
const limitScore = rateLimiter({ windowMs: 60_000, max: 40 });
const limitBoard = rateLimiter({ windowMs: 60_000, max: 120 });

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function fail(res, status, message, headers) {
  send(res, status, { error: message }, headers);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('payload too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('malformed JSON body');
    err.status = 400;
    throw err;
  }
}

function bearer(req) {
  const header = String(req.headers.authorization ?? '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** POST /api/session — mint an identity, resolving a coarse city from the IP. */
async function createSession(req, res, ip) {
  const gate = limitSession(ip);
  if (!gate.ok) return fail(res, 429, 'Slow down a moment.', { 'retry-after': String(gate.retryAfter) });

  const body = await readJsonBody(req);
  const callsign = sanitizeCallsign(body.callsign);
  if (!callsign) return fail(res, 400, 'Callsign must be 2-16 visible characters.');

  const location = await lookup(ip);
  const { player, token } = store.createPlayer({ callsign, location });

  send(res, 201, {
    id: player.id,
    token,
    callsign: player.callsign,
    location: { city: player.city, country: player.country, countryCode: player.countryCode }
  });
}

/** PATCH /api/session — rename, and backfill location if the first lookup missed. */
async function updateSession(req, res, ip) {
  const gate = limitSession(ip);
  if (!gate.ok) return fail(res, 429, 'Slow down a moment.', { 'retry-after': String(gate.retryAfter) });

  const body = await readJsonBody(req);
  const player = store.authenticate(body.id, bearer(req));
  if (!player) return fail(res, 401, 'Unknown or expired identity.');

  if (body.callsign !== undefined) {
    const callsign = sanitizeCallsign(body.callsign);
    if (!callsign) return fail(res, 400, 'Callsign must be 2-16 visible characters.');
    store.renamePlayer(player, callsign);
  }
  if (!player.city) store.updateLocation(player, await lookup(ip));

  send(res, 200, {
    id: player.id,
    callsign: player.callsign,
    best: player.best,
    location: { city: player.city, country: player.country, countryCode: player.countryCode }
  });
}

/** POST /api/score — record a finished run. */
async function postScore(req, res, ip) {
  const gate = limitScore(ip);
  if (!gate.ok) return fail(res, 429, 'Too many runs, too fast.', { 'retry-after': String(gate.retryAfter) });

  const body = await readJsonBody(req);
  const player = store.authenticate(body.id, bearer(req));
  if (!player) return fail(res, 401, 'Unknown or expired identity.');

  const score = Number(body.score);
  const durationMs = Number(body.durationMs);
  if (!Number.isFinite(score) || score < 0 || score > 100_000_000) {
    return fail(res, 400, 'Score out of range.');
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return fail(res, 400, 'Run duration missing.');
  }
  if (Math.floor(score) > maxPlausibleScore(durationMs)) {
    return fail(res, 422, 'Score is not achievable in that run length.');
  }

  const improved = store.submitScore(player, Math.floor(score));
  if (!player.city) store.updateLocation(player, await lookup(ip));

  send(res, 200, { best: player.best, improved, ...store.leaderboard(player.id) });
}

/** GET /api/leaderboard?id= — top 10, your standing, and your city's champion. */
function getLeaderboard(req, res, url, ip) {
  const gate = limitBoard(ip);
  if (!gate.ok) return fail(res, 429, 'Too many requests.', { 'retry-after': String(gate.retryAfter) });
  send(res, 200, store.leaderboard(url.searchParams.get('id') ?? null));
}

async function serveStatic(req, res, url) {
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const target = relative === '/' || relative === sep ? 'index.html' : relative.replace(/^[/\\]+/, '');
  const filePath = resolve(PUBLIC_DIR, target);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    return fail(res, 403, 'Forbidden');
  }

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return fail(res, 404, 'Not found');
  }
  if (info.isDirectory()) return fail(res, 404, 'Not found');

  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag });
    return res.end();
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': info.size,
    etag,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff'
  });

  if (req.method === 'HEAD') return res.end();
  createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const ip = clientIp(req, { trustProxy: TRUST_PROXY });

  try {
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/session' && req.method === 'POST') return await createSession(req, res, ip);
      if (url.pathname === '/api/session' && req.method === 'PATCH') return await updateSession(req, res, ip);
      if (url.pathname === '/api/score' && req.method === 'POST') return await postScore(req, res, ip);
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') return getLeaderboard(req, res, url, ip);
      if (url.pathname === '/api/health') return send(res, 200, { ok: true });
      return fail(res, 404, 'No such endpoint.');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500) console.error('[server]', err);
    if (!res.headersSent) fail(res, status, status >= 500 ? 'Internal error' : err.message);
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🦫  Capy River Run — http://localhost:${PORT}`);
  console.log(`    data: ${DATA_FILE}${TRUST_PROXY ? '  (trusting X-Forwarded-For)' : ''}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    store.flush().finally(() => process.exit(0));
  });
}
