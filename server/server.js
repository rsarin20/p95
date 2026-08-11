import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { clientIp } from './geo.js';
import { createApi, defaultLimits, kvLimits } from './handlers.js';
import { kvFromEnv } from './kv.js';
import { KvStore } from './kv-store.js';
import { Store } from './store.js';

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

// Redis if it's configured, otherwise the local JSON file. Same API either way.
const kv = kvFromEnv();
const store = kv ? new KvStore(kv) : await new Store(DATA_FILE).load();
const api = createApi({ store, limits: kv ? kvLimits(kv) : defaultLimits() });

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
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
      const ctx = {
        ip,
        headers: req.headers,
        token: bearer(req),
        query: Object.fromEntries(url.searchParams)
      };

      let result = null;
      if (url.pathname === '/api/session' && req.method === 'POST') {
        result = await api.createSession({ ...ctx, body: await readJsonBody(req) });
      } else if (url.pathname === '/api/session' && req.method === 'PATCH') {
        result = await api.updateSession({ ...ctx, body: await readJsonBody(req) });
      } else if (url.pathname === '/api/score' && req.method === 'POST') {
        result = await api.postScore({ ...ctx, body: await readJsonBody(req) });
      } else if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        result = await api.getLeaderboard(ctx);
      } else if (url.pathname === '/api/health') {
        result = { status: 200, body: { ok: true, store: kv ? 'redis' : 'file' } };
      }

      if (!result) return fail(res, 404, 'No such endpoint.');
      return send(res, result.status, result.body, result.headers);
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
  console.log(`    store: ${kv ? 'redis' : DATA_FILE}${TRUST_PROXY ? '  (trusting X-Forwarded-For)' : ''}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    store.flush?.().finally(() => process.exit(0));
  });
}
