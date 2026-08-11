// Local development server.
//
// In production the game is static files on a CDN and the two API routes are
// serverless functions (see `api/`). This server exists so that `npm start`
// gives you exactly the same thing on one port without needing any of that —
// it shares the route handlers in `lib/http.js`, so local and deployed
// behaviour cannot drift apart.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleScore, handleLeaderboard, send } from '../lib/http.js';
import { getBoard } from '../lib/board.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

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
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'content-length': info.size,
      // The service worker handles caching; keeping the server honest avoids
      // stale modules during development.
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/api/score') return await handleScore(req, res);
    if (url.pathname === '/api/leaderboard') return await handleLeaderboard(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { error: 'method not allowed' });
    }
    return await serveStatic(req, res, url.pathname === '/' ? '/index.html' : url.pathname);
  } catch (err) {
    console.error('request failed:', err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});

const board = await getBoard();

server.listen(PORT, HOST, () => {
  console.log(`moonhop listening on http://localhost:${PORT}`);
  console.log(
    `${board.durable ? 'leaderboard persisting to disk' : 'leaderboard in memory only'}`,
  );
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (board.save) await board.save().catch(() => {});
    server.close(() => process.exit(0));
  });
}
