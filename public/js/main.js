import { Game } from './game.js';
import { Input } from './input.js';
import { Session } from './leaderboard.js';
import { buildShareCard, shareCard } from './share.js';
import { UI } from './ui.js';

const RESTART_LOCKOUT_MS = 420; // don't let the fatal keypress restart the run

const ui = new UI();
const input = new Input(document.getElementById('canvasWrap')).attach();
const session = new Session({ onChange: syncRail });

let lastRun = { score: 0, chillMoments: 0 };

const game = new Game(document.getElementById('game'), input, {
  onState: (state) => ui.setScreen(state),
  onScore: (score) => ui.setScore(score),
  onChill: (event) => ui.showChill(event),
  onGameOver: handleGameOver
});

// ── Rail ──────────────────────────────────────────────────────────────

function syncRail() {
  ui.setIdentity(session.record);
  ui.setReady(session.record);
  ui.setBest(session.best);
  ui.renderBoard(session.board, {
    youId: session.id,
    localChampionId: session.board?.local?.champion?.id
  });
  ui.setBoardStatus(
    session.offline ? 'offline · local only' : `live · ${session.board?.totalPlayers ?? 0} drifting`,
    session.offline ? 'offline' : 'ok'
  );
}

// ── Run lifecycle ─────────────────────────────────────────────────────

async function handleGameOver({ score, durationMs, chillMoments }) {
  lastRun = { score, chillMoments };
  ui.clearChill();
  ui.setScore(score);
  ui.showGameOver({ score, best: session.best, improved: score > session.best, rank: null });

  const result = await session.submit(score, durationMs);
  ui.setBest(result.best, { flash: result.improved });
  ui.showGameOver({ score, best: result.best, improved: result.improved, rank: result.rank });
  if (result.offline && result.error) ui.setBoardStatus('offline · local only', 'offline');
}

function startRun() {
  ui.clearChill();
  game.start();
}

/** A hop press means something different on every screen. */
function routeHop() {
  switch (game.state) {
    case 'boot':
      ui.el.input.focus();
      break;
    case 'ready':
      startRun();
      break;
    case 'playing':
      game.hop();
      break;
    case 'over':
      if (performance.now() - game.overAt > RESTART_LOCKOUT_MS) startRun();
      break;
  }
}

async function doShare() {
  if (!lastRun.score) return;
  const card = buildShareCard({ score: lastRun.score, session, chillMoments: lastRun.chillMoments });
  const outcome = await shareCard(card);

  if (outcome === 'copied') ui.toast('Share card copied to clipboard');
  else if (outcome === 'shared') ui.toast('Shared');
  else if (outcome === 'failed') ui.toast('Copy blocked by your browser');
}

// ── Wiring ────────────────────────────────────────────────────────────

input.on('hop', routeHop);
input.on('action', (code) => {
  if (code === 'KeyC' && game.state === 'over') doShare();
  if ((code === 'Enter' || code === 'KeyR') && game.state === 'over') routeHop();
});

ui.el.startButton.addEventListener('click', startRun);
ui.el.retryButton.addEventListener('click', startRun);
ui.el.shareButton.addEventListener('click', doShare);

ui.el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const callsign = ui.el.input.value.trim();

  if (callsign.length < 2 || callsign.length > 16) {
    ui.setFormError('Give me 2 to 16 characters to put on the board.');
    ui.el.input.focus();
    return;
  }

  ui.setFormBusy(true);
  ui.setFormError(null);
  try {
    await session.register(callsign);
    game.setState('ready');
  } catch (err) {
    ui.setFormError(err.message ?? 'Could not claim that callsign.');
  } finally {
    ui.setFormBusy(false);
  }
});

ui.el.input.addEventListener('input', () => ui.setFormError(null));

// Refresh the board whenever the player comes back to the tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && game.state !== 'playing') session.refresh();
});

// ── Boot ──────────────────────────────────────────────────────────────

game.run();
ui.setScreen('boot');
syncRail();
ui.setBoardStatus('syncing…');

session
  .boot()
  .then((recognised) => game.setState(recognised ? 'ready' : 'boot'))
  .catch(() => game.setState('boot'))
  .finally(() => session.startPolling());
