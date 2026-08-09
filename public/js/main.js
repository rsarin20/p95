/* ══ MAIN ═════════════════════════════════════════════════
   Boot, loop, input. Two verbs, three ways to reach each one.
   ════════════════════════════════════════════════════════ */

import * as Rr from './render.js';
import * as UI from './ui.js';
import * as Net from './net.js';
import * as Snd from './audio.js';
import { Game } from './game.js';

Rr.setup(document.getElementById('stage'));
UI.init(() => startRun());          // wire the DOM before Game's first hook fires

const game = new Game({
  onScore:   (s, b) => UI.score(s, b),
  onSignal:  (f, o) => UI.signal(f, o),
  onZone:    (n, a) => UI.zone(n, a),
  onPalette: p => UI.palette(p),
  onDeath:   r => UI.gameOver(r),
});

function startRun(){
  if (game.state === 'run') return;
  Snd.unlock();
  UI.playing();
  Net.beginRun();
  game.start();
}

// handle for tooling / tuning sessions
window.PANGO = { game, start: startRun, render: Rr };

/* ── keyboard ───────────────────────────────────────────── */
const JUMP = new Set(['Space','ArrowUp','KeyW','Enter','NumpadEnter']);
const CURL = new Set(['ArrowDown','KeyS','ShiftLeft','ShiftRight']);

addEventListener('keydown', e => {
  if (e.repeat) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

  if (e.code === 'KeyM'){ Snd.toggleMute(); return; }
  if (e.code === 'Escape'){ UI.closeBoard(); return; }

  if (JUMP.has(e.code)){
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (UI.isOverlayOpen()) return;
    if (game.state === 'run')      game.jumpDown();
    else if (UI.canRestart())      startRun();
    else if (UI.atTitle())         startRun();
    return;
  }
  if (CURL.has(e.code)){
    e.preventDefault();
    if (UI.isOverlayOpen()) return;
    if (game.state === 'run') game.setCurl(true);
    return;
  }
}, { passive: false });

addEventListener('keyup', e => {
  if (JUMP.has(e.code)) game.jumpUp();
  if (CURL.has(e.code)) game.setCurl(false);
});

/* ── pointer / touch ────────────────────────────────────
   Upper 68% of the screen jumps, the strip along the bottom
   curls. Multi-touch works, so you can dive out of a jump.  */
const zoneOf = y => (y > innerHeight * .68 ? 'curl' : 'jump');
const held = new Map();

function onDown(e){
  if (e.target && e.target.closest && e.target.closest('.veil')) return;
  e.preventDefault();
  Snd.unlock();
  if (game.state !== 'run'){
    if (UI.isOverlayOpen()) return;
    if (UI.canRestart() || UI.atTitle()) startRun();
    return;
  }
  const z = zoneOf(e.clientY);
  held.set(e.pointerId, z);
  if (z === 'jump') game.jumpDown(); else game.setCurl(true);
}
function onUp(e){
  const z = held.get(e.pointerId);
  if (!z) return;
  held.delete(e.pointerId);
  if (z === 'jump') game.jumpUp();
  else if (![...held.values()].includes('curl')) game.setCurl(false);
}

addEventListener('pointerdown', onDown, { passive: false });
addEventListener('pointerup', onUp);
addEventListener('pointercancel', onUp);
addEventListener('contextmenu', e => { if (game.state === 'run') e.preventDefault(); });

/* ── loop ───────────────────────────────────────────────── */
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > .05) dt = .05;             // a stalled tab must never teleport you into a tower
  game.update(dt);
  game.render();
}
requestAnimationFrame(frame);

addEventListener('visibilitychange', () => {
  last = performance.now();
  if (document.hidden && game.state === 'run') game.setCurl(false);
});
addEventListener('blur', () => game.setCurl(false));
