#!/usr/bin/env node
/* ══ PANGO server ═════════════════════════════════════════
   Zero dependencies. Serves ./public and the leaderboard API,
   persisting to a JSON file. Fine for a few thousand runners
   and for local development; for the real thing deploy
   ./worker (Cloudflare + D1), which shares this exact API and
   gets the city from the edge for free.

     node server.js [--port 8080] [--data ./data]
   ════════════════════════════════════════════════════════ */

const http = require('node:http');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i+1] : d; };
const PORT   = +(process.env.PORT || arg('--port', 8080));
const DATA   = path.resolve(arg('--data', './data'));
const PUBLIC = path.resolve(__dirname, 'public');
const SECRET = process.env.PANGO_SECRET || 'pango-dev-secret-change-me';
const FILE   = path.join(DATA, 'scores.json');

const MAX_NAME = 12;
const MAX_SCORE = 2_000_000;

/* ── store ───────────────────────────────────────────────── */
let db = { all: {}, day: {} };          // all[uid] = row ; day["YYYY-MM-DD|uid"] = row
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
db.all ||= {}; db.day ||= {};

let dirty = false, writing = false;
setInterval(flush, 2000).unref?.();
async function flush(){
  if (!dirty || writing) return;
  writing = true; dirty = false;
  try {
    await fsp.mkdir(DATA, { recursive: true });
    const tmp = FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db));
    await fsp.rename(tmp, FILE);
  } catch (e) { console.error('[pango] write failed:', e.message); dirty = true; }
  writing = false;
}
process.on('SIGINT', async () => { await flush(); process.exit(0); });
process.on('SIGTERM', async () => { await flush(); process.exit(0); });

/* ── helpers ─────────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10);
const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 _.\-]/g, '').trim().slice(0, MAX_NAME) || 'RUNNER';

const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
function mintToken(){
  const p = Date.now().toString(36) + '.' + crypto.randomBytes(6).toString('base64url');
  return p + '.' + sign(p);
}
function readToken(tok){
  if (typeof tok !== 'string') return null;
  const i = tok.lastIndexOf('.');
  if (i < 0) return null;
  const p = tok.slice(0, i), mac = tok.slice(i + 1);
  const want = sign(p);
  if (mac.length !== want.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const ts = parseInt(p.split('.')[0], 36);
  return Number.isFinite(ts) ? { ts } : null;
}

function cityOf(req){
  const h = req.headers;
  const city = h['cf-ipcity'] || h['x-vercel-ip-city'] || h['x-city'] || '';
  const cc   = (h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country'] || '').toUpperCase();
  const name = decodeURIComponent(String(city)).trim();
  if (!name && !cc) return null;
  return (name ? name.toUpperCase() : 'SOMEWHERE') + (cc && cc !== 'XX' ? ', ' + cc : '');
}

const rank = (rows, uid) => {
  const i = rows.findIndex(r => r.uid === uid);
  return i < 0 ? null : i + 1;
};
const sorted = (scope) => {
  const src = scope === 'today'
    ? Object.entries(db.day).filter(([k]) => k.startsWith(today() + '|')).map(([, v]) => v)
    : Object.values(db.all);
  return src.sort((a, b) => b.score - a.score || a.ts - b.ts);
};
const publicRow = (r, i) => ({ rank: i + 1, uid: r.uid, name: r.name, city: r.city || 'SOMEWHERE', score: r.score });

const lastPost = new Map();

/* ── API ─────────────────────────────────────────────────── */
function json(res, code, body){
  const s = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(s),
  });
  res.end(s);
}

async function api(req, res, url){
  if (url.pathname === '/api/session' && req.method === 'POST')
    return json(res, 200, { token: mintToken() });

  if (url.pathname === '/api/score' && req.method === 'POST'){
    let body = '';
    for await (const c of req){
      body += c;
      if (body.length > 4096) { req.destroy(); return; }
    }
    let b; try { b = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }

    const uid = String(b.uid || '').slice(0, 40);
    const score = Math.floor(Number(b.score));
    const durMs = Math.max(0, Math.floor(Number(b.duration) || 0));
    if (!/^[a-z0-9]{6,40}$/i.test(uid)) return json(res, 400, { error: 'bad uid' });
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json(res, 400, { error: 'bad score' });

    // plausibility: you cannot outrun the clock
    const secs = durMs / 1000;
    if (score > 60 * secs + 300) return json(res, 422, { error: 'implausible' });

    // the run token must predate the run it claims to describe
    const t = readToken(b.token);
    if (!t) return json(res, 403, { error: 'no token' });
    const elapsed = (Date.now() - t.ts) / 1000;
    if (elapsed + 2 < secs || elapsed > 3 * 3600) return json(res, 403, { error: 'stale token' });

    const prev = lastPost.get(uid) || 0;
    if (Date.now() - prev < 3000) return json(res, 429, { error: 'slow down' });
    lastPost.set(uid, Date.now());
    if (lastPost.size > 20000) lastPost.clear();

    const row = {
      uid, name: clean(b.name), city: cityOf(req) || 'SOMEWHERE',
      score, ts: Date.now(), zone: String(b.zone || '').slice(0, 24),
    };
    const k = today() + '|' + uid;
    if (!db.all[uid] || db.all[uid].score < score) db.all[uid] = row;
    else db.all[uid].name = row.name;
    if (!db.day[k] || db.day[k].score < score) db.day[k] = row;
    dirty = true;

    // prune yesterday's daily rows lazily
    if (Math.random() < .02){
      const d = today();
      for (const key of Object.keys(db.day)) if (!key.startsWith(d + '|')) delete db.day[key];
    }

    const rows = sorted('all');
    return json(res, 200, {
      rank: rank(rows, uid), total: rows.length, city: row.city,
      top: rows.slice(0, 5).map(publicRow),
    });
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'GET'){
    const scope = url.searchParams.get('scope') === 'today' ? 'today' : 'all';
    const limit = Math.min(100, Math.max(1, +url.searchParams.get('limit') || 50));
    const rows = sorted(scope);
    return json(res, 200, { scope, total: rows.length, rows: rows.slice(0, limit).map(publicRow) });
  }

  json(res, 404, { error: 'not found' });
}

/* ── static ──────────────────────────────────────────────── */
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml',
  '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json',
};

async function serve(req, res, url){
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    const st = await fsp.stat(file);
    if (st.isDirectory()) throw 0;
    const ext = path.extname(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    const idx = path.join(PUBLIC, 'index.html');
    fs.readFile(idx, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
      res.end(buf);
    });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/'))
    return api(req, res, url).catch(e => { console.error(e); json(res, 500, { error: 'server' }); });
  serve(req, res, url);
}).listen(PORT, () => {
  console.log(`\n  PANGO — NO SIGNAL`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  data: ${FILE}\n`);
});
