import { compactScore, padScore } from './utils.js';

const $ = (id) => document.getElementById(id);

/** `Zurich, CH` / `Zurich` / `—`. */
export function placeLabel(row) {
  if (!row?.city) return '—';
  return row.countryCode ? `${row.city}, ${row.countryCode}` : row.city;
}

/**
 * Every DOM write in the app lives here. Text goes in through `textContent`
 * only — callsigns are player-supplied and must never reach the page as markup.
 */
export class UI {
  constructor() {
    this.el = {
      overlay: $('overlay'),
      form: $('callsignForm'),
      input: $('callsignInput'),
      hint: $('callsignHint'),
      submit: $('callsignSubmit'),
      readyCallsign: $('readyCallsign'),
      readyLocation: $('readyLocation'),
      startButton: $('startButton'),
      overScore: $('overScore'),
      overMeta: $('overMeta'),
      retryButton: $('retryButton'),
      shareButton: $('shareButton'),
      shareToast: $('shareToast'),
      railIdentity: $('railIdentity'),
      score: $('scoreValue'),
      best: $('bestValue'),
      miniScore: $('miniScore'),
      miniBest: $('miniBest'),
      chill: $('chillBanner'),
      boardList: $('boardList'),
      boardStatus: $('boardStatus'),
      boardYou: $('boardYou'),
      localPride: $('localPride'),
      localBody: $('localBody')
    };

    this.#shownScore = -1;
    this.#chillTimer = 0;
    this.#toastTimer = 0;
  }

  #shownScore;
  #chillTimer;
  #toastTimer;

  setScreen(state) {
    this.el.overlay.dataset.screen = state;
    // Autofocus on desktop only — on touch it would slam the keyboard open
    // over the river before the player has seen anything.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (state === 'boot' && !coarse) queueMicrotask(() => this.el.input.focus());
  }

  setScore(value) {
    const rounded = Math.floor(value);
    if (rounded === this.#shownScore) return;
    this.#shownScore = rounded;
    const text = padScore(rounded);
    this.el.score.textContent = text;
    this.el.miniScore.textContent = text;
  }

  setBest(value, { flash = false } = {}) {
    this.el.best.textContent = padScore(value);
    this.el.miniBest.textContent = `BEST ${padScore(value)}`;
    if (!flash) return;
    this.el.best.dataset.flash = '1';
    setTimeout(() => delete this.el.best.dataset.flash, 420);
  }

  setIdentity(record) {
    const node = this.el.railIdentity;
    node.textContent = '';
    if (!record?.callsign) {
      node.textContent = 'drifting anonymously';
      return;
    }
    const name = document.createElement('strong');
    name.textContent = record.callsign;
    node.append(name);
    const place = placeLabel(record);
    if (place !== '—') node.append(` · ${place}`);
  }

  setReady(record) {
    this.el.readyCallsign.textContent = (record?.callsign ?? 'capy').toUpperCase();
    const place = placeLabel(record);
    this.el.readyLocation.textContent = place === '—' ? '' : `drifting out of ${place}`;
  }

  showChill({ bonus, streak }) {
    const node = this.el.chill;
    node.textContent = streak > 1 ? `Chill moment ×${streak} · +${bonus}` : `Chill moment · +${bonus}`;
    node.dataset.show = '1';
    clearTimeout(this.#chillTimer);
    this.#chillTimer = setTimeout(() => delete node.dataset.show, 1400);
  }

  clearChill() {
    clearTimeout(this.#chillTimer);
    delete this.el.chill.dataset.show;
  }

  showGameOver({ score, best, improved, rank }) {
    this.el.overScore.textContent = padScore(score);
    this.el.overMeta.textContent = '';

    if (improved) {
      const tag = document.createElement('strong');
      tag.textContent = 'New personal best';
      this.el.overMeta.append(tag);
    } else {
      this.el.overMeta.append(`Personal best ${padScore(best)}`);
    }
    if (rank) this.el.overMeta.append(` · global #${rank}`);

    this.el.shareToast.textContent = '';
    delete this.el.shareToast.dataset.show;
  }

  toast(message) {
    const node = this.el.shareToast;
    node.textContent = message;
    node.dataset.show = '1';
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => delete node.dataset.show, 2600);
  }

  setBoardStatus(text, state = 'ok') {
    this.el.boardStatus.textContent = text;
    this.el.boardStatus.dataset.state = state;
  }

  // ── Leaderboard ─────────────────────────────────────────────────────

  renderBoard(data, { youId, localChampionId } = {}) {
    const list = this.el.boardList;
    list.textContent = '';

    if (!data?.top?.length) {
      const empty = document.createElement('li');
      empty.className = 'board__empty';
      empty.textContent = 'No scores on the board yet. Be the first one downstream.';
      list.append(empty);
    } else {
      for (const row of data.top) {
        list.append(
          buildRow(row, {
            you: row.id === youId,
            local: row.id === localChampionId && row.id !== youId
          })
        );
      }
    }

    this.#renderYou(data, youId);
    this.#renderLocal(data?.local, youId);
  }

  #renderYou(data, youId) {
    const you = data?.you;
    const box = this.el.boardYou;
    box.textContent = '';

    if (!you || you.inTop || !you.score) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.append(buildRow(you, { you: true, id: youId }));
  }

  #renderLocal(local, youId) {
    const section = this.el.localPride;
    if (!local?.champion) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const body = this.el.localBody;
    body.textContent = '';

    const isYou = local.champion.id === youId;
    const champ = document.createElement('strong');
    champ.textContent = isYou ? 'You' : local.champion.callsign;
    const city = document.createElement('strong');
    city.textContent = local.city;

    body.append(champ, ` ${isYou ? 'hold' : 'holds'} `, city, ` with ${compactScore(local.champion.score)}.`);

    if (!isYou && local.yourRank) {
      body.append(` You're #${local.yourRank} of ${local.players} locally.`);
    } else if (isYou && local.players > 1) {
      body.append(` ${local.players - 1} rival${local.players === 2 ? '' : 's'} in town.`);
    }
  }

  // ── Callsign form ───────────────────────────────────────────────────

  setFormBusy(busy) {
    this.el.submit.disabled = busy;
    this.el.submit.textContent = busy ? 'Casting off…' : 'Start drifting';
  }

  setFormError(message) {
    this.el.hint.textContent = message ?? '2–16 characters. Your city is detected automatically.';
    this.el.hint.dataset.state = message ? 'error' : 'ok';
    this.el.input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

function buildRow(row, { you = false, local = false } = {}) {
  const li = document.createElement('li');
  li.className = `row${you ? ' row--you' : ''}${local ? ' row--local' : ''}`;

  const rank = document.createElement('span');
  rank.className = `row__rank${row.rank && row.rank <= 3 ? ' row__rank--medal' : ''}`;
  rank.textContent = row.rank ? `#${String(row.rank).padStart(2, '0')}` : '—';

  const who = document.createElement('span');
  who.className = 'row__who';
  const name = document.createElement('span');
  name.className = 'row__name';
  name.textContent = you ? `${row.callsign} (you)` : row.callsign;
  const place = document.createElement('span');
  place.className = 'row__place';
  place.textContent = placeLabel(row);
  who.append(name, place);

  const score = document.createElement('span');
  score.className = 'row__score';
  score.textContent = compactScore(row.score);

  li.append(rank, who, score);
  return li;
}
