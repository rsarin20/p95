/* ══ NET ══════════════════════════════════════════════════
   Identity lives in a cookie (asked once, ever). Scores go to a
   global board that stamps your city server-side from the edge
   — the client never sees or sends a location, so there's
   nothing to spoof and nothing to prompt for.

   If the API is unreachable the whole thing degrades to a local
   board, which for this particular game is thematically ideal.
   ════════════════════════════════════════════════════════ */

const API = '/api';
const YEAR = 60 * 60 * 24 * 365;

export const state = { online: true, city: null };

/* ── cookie ─────────────────────────────────────────────── */
function setCookie(k, v){
  document.cookie = `${k}=${encodeURIComponent(v)};path=/;max-age=${YEAR};SameSite=Lax`;
}
function getCookie(k){
  const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function uid(){
  let v = getCookie('pango_id') || localStorage.getItem('pango.id');
  if (!v){
    v = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  setCookie('pango_id', v);
  localStorage.setItem('pango.id', v);
  return v;
}

export function getName(){
  return getCookie('pango_name') || localStorage.getItem('pango.name') || null;
}
export function setName(n){
  n = sanitize(n);
  setCookie('pango_name', n);
  localStorage.setItem('pango.name', n);
  return n;
}
export function sanitize(n){
  return (n || '').toUpperCase().replace(/[^A-Z0-9 _.\-]/g, '').trim().slice(0, 12);
}
export const me = () => ({ uid: uid(), name: getName() });

/* ── run token ──────────────────────────────────────────── */
let token = null;
export async function beginRun(){
  token = null;
  try {
    const r = await fetch(`${API}/session`, { method: 'POST' });
    if (r.ok){ token = (await r.json()).token; state.online = true; }
  } catch { state.online = false; }
}

/* ── submit ─────────────────────────────────────────────── */
export async function submit(run){
  const { uid: id, name } = me();
  localBest(run.score);
  try {
    const r = await fetch(`${API}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uid: id, name, token,
        score: run.score, duration: Math.round(run.duration * 1000),
        zone: run.zone, smashes: run.smashes, packets: run.packets,
      }),
    });
    if (r.status >= 400 && r.status < 500){
      // the server reachable and saying no — a rejected run, not a dead link
      state.online = true;
      return { rank: null, rejected: true, top: localBoard('all').slice(0, 5) };
    }
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    state.online = true;
    if (j.city) state.city = j.city;
    return j;                                  // { rank, total, top:[], city }
  } catch {
    state.online = false;
    return { rank: null, total: null, top: localBoard('all').slice(0, 5), offline: true };
  }
}

export async function board(scope = 'all'){
  try {
    const r = await fetch(`${API}/leaderboard?scope=${scope}&limit=100`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    state.online = true;
    return { rows: j.rows || [], you: j.you || null, offline: false };
  } catch {
    state.online = false;
    return { rows: localBoard(scope), you: null, offline: true };
  }
}

/* ── local fallback board ───────────────────────────────── */
const LKEY = 'pango.localboard';
function localAll(){
  try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch { return []; }
}
function localBest(score){
  const { uid: id, name } = me();
  const rows = localAll();
  const day = new Date().toISOString().slice(0, 10);
  rows.push({ uid: id, name: name || 'YOU', city: state.city || 'THIS DEVICE', score, day });
  rows.sort((a, b) => b.score - a.score);
  localStorage.setItem(LKEY, JSON.stringify(rows.slice(0, 200)));
}
function localBoard(scope){
  const day = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  return localAll()
    .filter(r => scope !== 'today' || r.day === day)
    .filter(r => { const k = r.uid + r.name; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 50)
    .map((r, i) => ({ ...r, rank: i + 1, me: true }));
}
