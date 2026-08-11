// MOONHOP.
//
// Three states and one button.
//
//        MOONHOP  ──▶  PLAYING  ──▶  DEAD  ──▶  PLAYING
//                                      └────▶  LEADERBOARD
//
// The name is asked for once, ever. There is no home screen, no settings, no
// tutorial and no loading step. Everything below is the wiring between the
// simulation, the renderer and those few pieces of interface.

import { TICK, SPEED_MIN, SPEED_MAX, speedAtScore } from './core/config.js';
import { Sim } from './core/sim.js';
import { freshSeed } from './core/rng.js';
import { Scene } from './render/scene.js';
import { Renderer } from './render/renderer.js';
import { poseFor, strideFor } from './render/jerboa.js';
import * as store from './net/storage.js';
import * as api from './net/api.js';
import { renderBoard, rankLine } from './ui/leaderboard.js';

const STATE = {
  ATTRACT: 'attract',
  PLAYING: 'playing',
  DYING: 'dying',
  DEAD: 'dead',
};

/** How long the desert keeps moving after the jerboa stops. */
const DEATH_DRIFT_MS = 250;
/** Ambient scroll speed on the title screen — enough to feel awake. */
const ATTRACT_SPEED = 46;

const el = (id) => document.getElementById(id);

const dom = {
  stage: el('stage'),
  score: el('score'),
  lbBtn: el('lbBtn'),
  title: el('title'),
  hint: el('hint'),
  death: el('death'),
  deathScore: el('deathScore'),
  deathNote: el('deathNote'),
  deathRank: el('deathRank'),
  sheet: el('sheet'),
  nameView: el('nameView'),
  boardView: el('boardView'),
  nameInput: el('nameInput'),
  nameError: el('nameError'),
  nameEnter: el('nameEnter'),
  boardBody: el('boardBody'),
  scopeWorld: el('scopeWorld'),
  scopeCity: el('scopeCity'),
  changeName: el('changeName'),
  closeBoard: el('closeBoard'),
};

const scene = new Scene();
const renderer = new Renderer(dom.stage, scene);

const game = {
  state: STATE.ATTRACT,
  sim: null,
  seed: 0,
  dist: 0, // camera distance — runs ahead of the sim during the death drift
  score: 0,
  runPhase: 0,
  lastLandTick: -1,
  jumpTicks: [],
  checkpoints: [],
  startedAt: 0,
  dyingUntil: 0,
  pendingJump: false,
  paused: false,
  lastResult: null,
};

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

function startRun() {
  game.seed = freshSeed();
  game.sim = new Sim(game.seed);
  game.dist = 0;
  game.score = 0;
  game.runPhase = 0;
  game.lastLandTick = -1;
  game.jumpTicks = [];
  game.checkpoints = [];
  game.startedAt = performance.now();
  game.state = STATE.PLAYING;
  game.lastResult = null;

  dom.title.classList.add('is-hidden');
  dom.death.classList.remove('is-on');
  dom.score.classList.remove('is-quiet');
  if (store.hasJumped()) dom.hint.classList.add('is-hidden');
}

function die() {
  game.state = STATE.DYING;
  game.dyingUntil = performance.now() + DEATH_DRIFT_MS;
}

function settleDeath() {
  game.state = STATE.DEAD;

  const score = game.sim.score;
  const isBest = store.setBest(score);

  dom.deathScore.textContent = fmt(score);
  dom.deathNote.textContent = isBest ? 'NEW BEST' : '';
  dom.deathRank.textContent = '';
  dom.death.classList.add('is-on');

  submitRun(score);
}

async function submitRun(score) {
  const record = api.buildRecord({
    seed: game.seed,
    score,
    ticks: game.sim.deathTick >= 0 ? game.sim.deathTick : game.sim.tick,
    jumpTicks: game.jumpTicks,
    checkpoints: game.checkpoints,
    durationMs: performance.now() - game.startedAt,
  });

  // Queue first, always. Whether the network exists right now is not this
  // function's problem — the record is safe on disk either way.
  store.enqueue(record);
  if (!api.isOnline()) return;

  try {
    const best = await api.flushQueue();
    if (!best || game.state !== STATE.DEAD) return;

    const prev = store.getCityRank();
    if (best.cityRank) store.setCityRank(best.cityRank);

    const line = rankLine({
      cityRank: best.cityRank,
      prevCityRank: prev,
      city: best.city,
      worldRank: best.worldRank,
    });
    if (line) dom.deathRank.textContent = line;
  } catch {
    /* stays queued; it will go up on the next connection */
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function press() {
  if (game.paused || sheetOpen()) return;

  switch (game.state) {
    case STATE.ATTRACT:
      startRun();
      // The press that starts the run is also the first jump, so the very
      // first thing that ever happens is the animal leaving the ground.
      game.pendingJump = true;
      break;
    case STATE.PLAYING:
      game.pendingJump = true;
      break;
    case STATE.DYING:
      break;
    case STATE.DEAD:
      startRun();
      break;
    default:
      break;
  }
}

function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (document.activeElement === dom.nameInput) return;
    e.preventDefault();
    if (e.repeat) return; // holding is not a second jump
    press();
  } else if (e.code === 'Escape' && sheetOpen()) {
    closeSheet();
  }
}

window.addEventListener('keydown', onKey, { passive: false });
dom.stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press();
});
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 120));

document.addEventListener('visibilitychange', () => {
  // Freezing a hidden tab is the only honest option: resuming a runner after
  // an unknown gap would either teleport the desert or kill the player.
  game.paused = document.hidden || sheetOpen();
  last = performance.now();
  acc = 0;
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (!game.paused) {
    update(dt, now);
    draw();
  }
  requestAnimationFrame(frame);
}

function update(dt, now) {
  let moved = 0;

  if (game.state === STATE.PLAYING) {
    acc += dt;
    let steps = 0;
    const before = game.sim.dist;

    // A hard cap on catch-up steps. A stalled frame must not be able to
    // fast-forward the simulation through obstacles the player never saw.
    while (acc >= TICK && steps < 8 && !game.sim.dead) {
      const jump = game.pendingJump;
      game.pendingJump = false;

      if (game.sim.tick % 512 === 0) game.checkpoints.push(Math.round(game.sim.dist));
      if (jump) game.jumpTicks.push(game.sim.tick);

      game.sim.step(jump);
      acc -= TICK;
      steps++;
    }
    if (steps >= 8) acc = 0;

    moved = game.sim.dist - before;
    game.dist = game.sim.dist;
    game.score = game.sim.score;

    // The hint retires when the first jump actually leaves the ground — not
    // when a key is first pressed — and then never returns on any later run.
    if (game.sim.jumpCount > 0 && !store.hasJumped()) {
      store.markJumped();
      dom.hint.classList.add('is-hidden');
    }

    if (game.sim.dead) die();
  } else if (game.state === STATE.DYING) {
    // The jerboa has stopped; the world has not noticed yet.
    moved = speedAtScore(game.score) * dt;
    game.dist += moved;
    if (now >= game.dyingUntil) settleDeath();
  } else if (game.state === STATE.ATTRACT) {
    moved = ATTRACT_SPEED * dt;
    game.dist += moved;
  }

  // The run cycle is driven by distance, not by time, so the legs always match
  // the speed of the ground.
  const speedN = clamp01((speedAtScore(game.score) - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  const grounded = !game.sim || game.sim.onGround;
  if (grounded && game.state !== STATE.DEAD) {
    const stride = game.state === STATE.ATTRACT ? strideFor(0) : strideFor(speedN);
    game.runPhase = (game.runPhase + moved * stride) % 1;
  }

  if (game.sim && game.sim.lastLandTick !== game.lastLandTick) {
    game.lastLandTick = game.sim.lastLandTick;
    // Land, squash, and pick the cycle back up on the lean — so the landing
    // reads as the first beat of the next stride rather than an interruption.
    if (game.lastLandTick >= 0) game.runPhase = 0.04;
  }

  scene.update(dt, moved);
  dom.score.textContent = fmt(game.score);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function draw() {
  const sim = game.sim;
  const speedN = clamp01((speedAtScore(game.score) - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  const dying = game.state === STATE.DYING || game.state === STATE.DEAD;

  const pose = poseFor({
    onGround: sim ? sim.onGround : true,
    airTicks: sim ? sim.airTicks : 0,
    runPhase: game.runPhase,
    sinceLand: sim && sim.lastLandTick >= 0 ? sim.tick - sim.lastLandTick : 99,
    speedN: game.state === STATE.ATTRACT ? 0 : speedN,
    deadT: dying ? 1 : 0,
  });

  renderer.draw({
    dist: game.dist,
    score: game.score,
    obstacles: sim ? sim.obstacles : [],
    jerboaY: sim ? sim.y : 0,
    pose,
    showJerboa: true,
  });
}

// ---------------------------------------------------------------------------
// Sheets: name and leaderboard
// ---------------------------------------------------------------------------

function sheetOpen() {
  return dom.sheet.classList.contains('is-on');
}

function openSheet(view) {
  dom.nameView.classList.toggle('is-on', view === 'name');
  dom.boardView.classList.toggle('is-on', view === 'board');
  dom.sheet.classList.add('is-on');
  dom.sheet.setAttribute('aria-hidden', 'false');
  // A run in progress freezes rather than continuing behind the sheet.
  game.paused = true;
  if (view === 'name') setTimeout(() => dom.nameInput.focus(), 60);
}

function closeSheet() {
  dom.sheet.classList.remove('is-on');
  dom.sheet.setAttribute('aria-hidden', 'true');
  dom.nameView.classList.remove('is-on');
  dom.boardView.classList.remove('is-on');
  game.paused = false;
  // Drop the accumulated time so the desert resumes rather than catching up.
  last = performance.now();
  acc = 0;
}

// --- name -------------------------------------------------------------------

function askName(prefill) {
  dom.nameInput.value = prefill || '';
  dom.nameError.textContent = '';
  openSheet('name');
}

function confirmName() {
  const check = store.validateName(dom.nameInput.value || dom.nameInput.placeholder);
  if (!check.ok) {
    dom.nameError.textContent = check.reason;
    return;
  }
  store.setName(check.name);
  closeSheet();
}

dom.nameEnter.addEventListener('click', confirmName);
dom.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmName();
  }
  e.stopPropagation();
});

// --- board ------------------------------------------------------------------

let boardScope = 'world';
let boardData = null;

async function openBoard() {
  const city = store.detectCity();
  dom.scopeCity.textContent = (city || 'NEARBY').toUpperCase();
  dom.scopeCity.style.display = city ? '' : 'none';
  setScope(boardScope);
  openSheet('board');

  renderBoard(dom.boardBody, null, { empty: 'LOADING' });

  try {
    // Push anything still waiting before reading, so the board a player sees
    // right after a flight already includes the runs from the flight.
    if (api.isOnline()) await api.flushQueue();
    boardData = await api.fetchLeaderboard({ id: store.playerId(), city });
    setScope(boardScope);
  } catch {
    boardData = null;
    renderBoard(dom.boardBody, null, {
      error: api.isOnline()
        ? 'LEADERBOARD UNREACHABLE'
        : `OFFLINE · YOUR BEST IS ${fmt(store.getBest())}`,
    });
  }
}

function setScope(scope) {
  boardScope = scope;
  dom.scopeWorld.classList.toggle('is-on', scope === 'world');
  dom.scopeCity.classList.toggle('is-on', scope === 'city');
  if (!boardData) return;
  const board = scope === 'city' ? boardData.city : boardData.world;
  renderBoard(dom.boardBody, board, {
    empty: scope === 'city' ? 'NOBODY HERE YET. TAKE IT.' : 'NO RUNS YET. BE FIRST.',
    showPlace: scope !== 'city',
    // Deployed with no store attached, the board is real but does not survive.
    // Better to say so than to let people chase a rank that will evaporate.
    footer: boardData.durable === false ? 'TEMPORARY BOARD · SCORES RESET' : null,
  });
}

dom.lbBtn.addEventListener('click', openBoard);
dom.scopeWorld.addEventListener('click', () => setScope('world'));
dom.scopeCity.addEventListener('click', () => setScope('city'));
dom.closeBoard.addEventListener('click', closeSheet);
dom.changeName.addEventListener('click', () => askName(store.getName()));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  if (store.hasJumped()) dom.hint.classList.add('is-hidden');
  dom.score.classList.add('is-quiet');

  if (!store.getName()) askName('');

  // Anything left over from a previous session goes up as soon as we can.
  if (api.isOnline()) api.flushQueue().catch(() => {});
  api.onReconnect(() => api.flushQueue().catch(() => {}));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  requestAnimationFrame(frame);
}

boot();
