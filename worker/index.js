/* ══ PANGO — Cloudflare Worker ════════════════════════════
   Same API as server.js, backed by D1, with one advantage that
   matters: `request.cf.city` is already on every request. The
   client never asks for a location, never sends one, and never
   sees a permission prompt — the board's third column is
   stamped at the edge and can't be spoofed by the player.
   ════════════════════════════════════════════════════════ */

const MAX_SCORE = 2_000_000;
const enc = new TextEncoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const today = () => new Date().toISOString().slice(0, 10);
const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 _.\-]/g, '').trim().slice(0, 12) || 'RUNNER';

/* ── HMAC run tokens ─────────────────────────────────────── */
let keyP = null;
function key(secret){
  keyP ||= crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return keyP;
}
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

async function mint(secret){
  const p = Date.now().toString(36) + '.' + b64u(crypto.getRandomValues(new Uint8Array(6)));
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(p));
  return p + '.' + b64u(mac);
}
async function verify(tok, secret){
  if (typeof tok !== 'string') return null;
  const i = tok.lastIndexOf('.');
  if (i < 0) return null;
  const p = tok.slice(0, i);
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(p));
  if (b64u(mac) !== tok.slice(i + 1)) return null;
  const ts = parseInt(p.split('.')[0], 36);
  return Number.isFinite(ts) ? { ts } : null;
}

function cityOf(request){
  const cf = request.cf || {};
  const city = (cf.city || '').toString().trim();
  const cc = (request.headers.get('cf-ipcountry') || cf.country || '').toString().toUpperCase();
  if (!city && !cc) return 'SOMEWHERE';
  return (city ? city.toUpperCase() : 'SOMEWHERE') + (cc && cc !== 'XX' && cc !== 'T1' ? ', ' + cc : '');
}

const publicRow = (r, i) => ({ rank: i + 1, uid: r.uid, name: r.name, city: r.city || 'SOMEWHERE', score: r.score });

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')){
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
    }
    const secret = env.PANGO_SECRET || 'pango-dev-secret-change-me';

    try {
      /* ── session ── */
      if (url.pathname === '/api/session' && request.method === 'POST')
        return json({ token: await mint(secret) });

      /* ── submit ── */
      if (url.pathname === '/api/score' && request.method === 'POST'){
        const b = await request.json().catch(() => null);
        if (!b) return json({ error: 'bad json' }, 400);

        const uid = String(b.uid || '');
        const score = Math.floor(Number(b.score));
        const secs = Math.max(0, Number(b.duration) || 0) / 1000;

        if (!/^[a-z0-9]{6,40}$/i.test(uid))                       return json({ error: 'bad uid' }, 400);
        if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: 'bad score' }, 400);
        if (score > 60 * secs + 300)                              return json({ error: 'implausible' }, 422);

        const t = await verify(b.token, secret);
        if (!t)                                                   return json({ error: 'no token' }, 403);
        const elapsed = (Date.now() - t.ts) / 1000;
        if (elapsed + 2 < secs || elapsed > 3 * 3600)             return json({ error: 'stale token' }, 403);

        const name = clean(b.name);
        const city = cityOf(request);
        const now = Date.now();
        const day = today();

        await env.DB.batch([
          env.DB.prepare(`INSERT INTO best (uid,name,city,score,zone,ts) VALUES (?,?,?,?,?,?)
                          ON CONFLICT(uid) DO UPDATE SET
                            name=excluded.name, city=excluded.city,
                            score=MAX(best.score, excluded.score),
                            zone=CASE WHEN excluded.score>best.score THEN excluded.zone ELSE best.zone END,
                            ts=CASE WHEN excluded.score>best.score THEN excluded.ts ELSE best.ts END`)
            .bind(uid, name, city, score, String(b.zone || '').slice(0, 24), now),
          env.DB.prepare(`INSERT INTO daily (day,uid,name,city,score,ts) VALUES (?,?,?,?,?,?)
                          ON CONFLICT(day,uid) DO UPDATE SET
                            name=excluded.name, city=excluded.city,
                            score=MAX(daily.score, excluded.score),
                            ts=CASE WHEN excluded.score>daily.score THEN excluded.ts ELSE daily.ts END`)
            .bind(day, uid, name, city, score, now),
        ]);

        const best = await env.DB.prepare('SELECT score FROM best WHERE uid=?').bind(uid).first();
        const useScore = best ? best.score : score;
        const ahead = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE score > ?').bind(useScore).first();
        const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM best').first();
        const top = await env.DB.prepare('SELECT uid,name,city,score FROM best ORDER BY score DESC, ts ASC LIMIT 5').all();

        ctx.waitUntil(env.DB.prepare('DELETE FROM daily WHERE day < ?').bind(day).run().catch(() => {}));

        return json({
          rank: (ahead?.n ?? 0) + 1,
          total: total?.n ?? 0,
          city,
          top: (top.results || []).map(publicRow),
        });
      }

      /* ── board ── */
      if (url.pathname === '/api/leaderboard' && request.method === 'GET'){
        const scope = url.searchParams.get('scope') === 'today' ? 'today' : 'all';
        const limit = Math.min(100, Math.max(1, +url.searchParams.get('limit') || 50));
        const q = scope === 'today'
          ? env.DB.prepare('SELECT uid,name,city,score FROM daily WHERE day=? ORDER BY score DESC, ts ASC LIMIT ?').bind(today(), limit)
          : env.DB.prepare('SELECT uid,name,city,score FROM best ORDER BY score DESC, ts ASC LIMIT ?').bind(limit);
        const rows = await q.all();
        return json({ scope, rows: (rows.results || []).map(publicRow) });
      }

      return json({ error: 'not found' }, 404);
    } catch (e){
      return json({ error: 'server', detail: String(e && e.message || e) }, 500);
    }
  },
};
