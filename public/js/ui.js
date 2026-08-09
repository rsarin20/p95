/* ══ UI ═══════════════════════════════════════════════════
   The overlays are printed from the same two inks as the world:
   every frame the game hands its live palette to CSS custom
   properties, so when you cross into Nightfall the leaderboard
   changes ink too. One press, one artefact.
   ════════════════════════════════════════════════════════ */

import * as Net from './net.js';
import * as Snd from './audio.js';

const $ = s => document.querySelector(s);
const el = {};
let onStart = null, scope = 'all', lastResult = null, busy = false;

const fmt = n => (n ?? 0).toLocaleString('en-US');

/* Must run before the Game is constructed — its reset() fires hooks. */
export function init(startFn){
  onStart = startFn;
  for (const id of ['hud','bars','zone','score','best','gate','nameForm','nameInput','gateNote',
                    'title','startBtn','boardBtn','ticker','over','finalScore','ovBest','ovZone',
                    'ovRank','mini','againBtn','overBoardBtn','shareBtn','board','list','youRow',
                    'closeBoard','boardNote','overKicker'])
    el[id] = document.getElementById(id);

  el.nameForm.addEventListener('submit', e => {
    e.preventDefault();
    const n = Net.sanitize(el.nameInput.value);
    if (n.length < 2){
      el.gateNote.textContent = 'AT LEAST 2 CHARACTERS.';
      el.gateNote.classList.add('warn');
      el.nameInput.focus();
      return;
    }
    Net.setName(n);
    Snd.unlock();
    showTitle();
  });
  el.nameInput.addEventListener('input', () => {
    el.gateNote.classList.remove('warn');
    const v = Net.sanitize(el.nameInput.value);
    if (v !== el.nameInput.value.toUpperCase()) el.nameInput.value = v;
  });

  el.startBtn.addEventListener('click', () => onStart());
  el.againBtn.addEventListener('click', () => onStart());
  el.boardBtn.addEventListener('click', () => openBoard());
  el.overBoardBtn.addEventListener('click', () => openBoard());
  el.closeBoard.addEventListener('click', () => closeBoard());
  el.shareBtn.addEventListener('click', share);
  for (const t of document.querySelectorAll('.tab'))
    t.addEventListener('click', () => { scope = t.dataset.scope; markTabs(); loadBoard(); });

  boot();
}

function boot(){
  if (!Net.getName()){
    show(el.gate);
    setTimeout(() => el.nameInput.focus(), 60);
  } else {
    showTitle();
  }
  loadTicker();
}

/* ── palette bridge ─────────────────────────────────────── */
let lastPal = '';
export function palette(p){
  const key = p.paper + p.ink + p.duo;
  if (key === lastPal) return;
  lastPal = key;
  const r = document.documentElement.style;
  r.setProperty('--paper', p.paper);
  r.setProperty('--ink', p.ink);
  r.setProperty('--duo', p.duo);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', p.paper);
}

/* ── HUD ────────────────────────────────────────────────── */
let shownScore = -1;
export function score(s, best){
  if (s === shownScore) return;
  shownScore = s;
  el.score.textContent = fmt(s);
  el.best.textContent = 'BEST ' + fmt(best);
  if (s % 100 === 0 && s > 0){
    el.score.classList.remove('tick');
    void el.score.offsetWidth;
    el.score.classList.add('tick');
  }
}
let litCount = -1;
export function signal(fill, online){
  const lit = Math.round(fill * 8);
  if (lit !== litCount){
    litCount = lit;
    const bars = el.bars.children;
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('lit', i < lit);
  }
  el.hud.classList.toggle('online', !!online);
}
export function zone(name, animate){
  el.zone.textContent = name;
  if (animate){
    el.zone.classList.remove('flash');
    void el.zone.offsetWidth;
    el.zone.classList.add('flash');
  }
}

/* ── screens ────────────────────────────────────────────── */
const show = n => n.classList.remove('hidden');
const hide = n => n.classList.add('hidden');

export function showTitle(){
  hide(el.gate); hide(el.over); hide(el.hud);
  show(el.title);
}
export function playing(){
  hide(el.title); hide(el.over); hide(el.gate); hide(el.board);
  show(el.hud);
  shownScore = -1; litCount = -1;
}
export function isOverlayOpen(){
  return !el.gate.classList.contains('hidden')
      || !el.board.classList.contains('hidden');
}
export function canRestart(){
  return !el.over.classList.contains('hidden') && el.board.classList.contains('hidden');
}
export function atTitle(){
  return !el.title.classList.contains('hidden') && el.board.classList.contains('hidden');
}

/* ── game over ──────────────────────────────────────────── */
export async function gameOver(res){
  lastResult = res;
  el.finalScore.textContent = fmt(res.score);
  el.ovBest.textContent = fmt(res.best);
  el.ovZone.textContent = res.zone;
  el.ovRank.textContent = '…';
  el.overKicker.textContent = res.score >= res.best && res.score > 0 ? 'NEW PERSONAL BEST' : 'SIGNAL LOST';
  el.mini.innerHTML = '';
  show(el.over);
  hide(el.hud);

  if (busy) return;
  busy = true;
  const j = await Net.submit(res);
  busy = false;
  if (lastResult !== res) return;

  el.ovRank.textContent = j.offline ? 'OFFLINE'
    : j.rejected ? 'UNRANKED'
    : j.rank ? '#' + fmt(j.rank) : '—';
  el.mini.innerHTML = (j.top || []).map(r => `
    <div class="r ${r.uid === Net.me().uid ? 'me' : ''}">
      <span>${r.rank}</span>
      <span class="n">${esc(r.name)}</span>
      <span class="s">${fmt(r.score)}</span>
    </div>`).join('');
  lastResult.rank = j.rank;
  lastResult.city = j.city;
}

async function share(){
  const r = lastResult;
  if (!r) return;
  const url = location.origin + location.pathname;
  const txt = `PANGO — ${fmt(r.score)}M through ${r.zone}.`
    + (r.rank ? ` #${fmt(r.rank)} in the world.` : '')
    + ` Beat it: ${url}`;
  try {
    if (navigator.share) await navigator.share({ text: txt, url });
    else { await navigator.clipboard.writeText(txt); flash(el.shareBtn, 'COPIED ✓'); }
  } catch {
    try { await navigator.clipboard.writeText(txt); flash(el.shareBtn, 'COPIED ✓'); } catch {}
  }
}
function flash(node, msg){
  const old = node.textContent;
  node.textContent = msg;
  setTimeout(() => { node.textContent = old; }, 1400);
}

/* ── leaderboard ────────────────────────────────────────── */
export function openBoard(){ show(el.board); markTabs(); loadBoard(); }
export function closeBoard(){ hide(el.board); }

function markTabs(){
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.scope === scope);
}

async function loadBoard(){
  el.list.innerHTML = '<li class="empty">TUNING IN…</li>';
  hide(el.youRow);
  const { rows, you, offline } = await Net.board(scope);
  const mine = Net.me().uid;

  if (!rows.length){
    el.list.innerHTML = `<li class="empty">${offline ? 'NO SIGNAL' : 'NOBODY YET — GO FIRST'}</li>`;
  } else {
    el.list.innerHTML = rows.map(r => row(r, r.uid === mine)).join('');
  }
  const inList = rows.some(r => r.uid === mine);
  if (you && !inList){
    el.youRow.innerHTML = rowInner(you, true);
    show(el.youRow);
  }
  el.boardNote.textContent = offline
    ? 'NO CONNECTION — SHOWING THIS DEVICE ONLY'
    : `${rows.length} RUNNERS · CITY STAMPED AT THE EDGE`;
}

const rowInner = (r, me) => `
  <span class="rank">${r.rank ? '#' + r.rank : '—'}</span>
  <span class="who">${esc(r.name)}</span>
  <span class="city">${esc(r.city || 'SOMEWHERE')}</span>
  <span class="pts">${fmt(r.score)}</span>`;

const row = (r, me) =>
  `<li class="${me ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}">${rowInner(r, me)}</li>`;

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ── title ticker: social proof, one line ───────────────── */
async function loadTicker(){
  const { rows, offline } = await Net.board('today');
  if (offline || !rows.length){
    el.ticker.textContent = Net.getName() ? '' : '';
    return;
  }
  const t = rows[0];
  el.ticker.textContent = `TODAY'S BEST · ${t.name} · ${fmt(t.score)}M · ${t.city || 'SOMEWHERE'}`;
}
