// The leaderboard.
//
// Three columns: name, score, place. No avatars, no badges, no achievements,
// no feed. The only piece of interface cleverness is that if you are 48th, the
// board shows you 47th, 48th and 49th — because "one place to climb" is a much
// stronger reason to play again than a list of five strangers you will never
// catch.

const TOP_ROWS = 10;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function rowEl(entry, isYou, showPlace) {
  const el = document.createElement('div');
  el.className = 'row' + (isYou ? ' is-you' : '');
  el.innerHTML = `
    <div class="rank">${entry.rank}</div>
    <div class="who"></div>
    <div class="pts"></div>
    <div class="place"></div>`;
  el.querySelector('.who').textContent = isYou ? 'YOU' : entry.name;
  el.querySelector('.pts').textContent = fmt(entry.score);
  // On a city board every row is the same city, so printing it nine times says
  // nothing. The column stays in the grid to keep the scores aligned.
  el.querySelector('.place').textContent = showPlace ? entry.city || '' : '';
  return el;
}

function gapEl() {
  const el = document.createElement('div');
  el.className = 'gap';
  return el;
}

function noteEl(text) {
  const el = document.createElement('div');
  el.className = 'board-note';
  el.textContent = text;
  return el;
}

/**
 * @param {HTMLElement} host
 * @param {object|null} board  { top, you, window, total }
 * @param {object} opts        { playerId, empty, error }
 */
export function renderBoard(host, board, opts = {}) {
  host.textContent = '';

  if (opts.error) {
    host.appendChild(noteEl(opts.error));
    return;
  }
  if (!board || !board.top || !board.top.length) {
    host.appendChild(noteEl(opts.empty || 'NO RUNS YET. BE FIRST.'));
    return;
  }

  const showPlace = opts.showPlace !== false;
  const you = board.you;
  const top = board.top.slice(0, TOP_ROWS);
  const shownRanks = new Set();

  for (const entry of top) {
    const isYou = !!you && entry.id === you.id;
    shownRanks.add(entry.rank);
    host.appendChild(rowEl(entry, isYou, showPlace));
  }

  // Only stitch on the surrounding window when the player is off the top of
  // the board — otherwise they are already visible above.
  if (you && !shownRanks.has(you.rank)) {
    const around = (board.window || []).filter((e) => !shownRanks.has(e.rank));
    if (around.length) {
      const firstRank = around[0].rank;
      if (firstRank > (top[top.length - 1]?.rank ?? 0) + 1) host.appendChild(gapEl());
      for (const entry of around) {
        host.appendChild(rowEl(entry, entry.id === you.id, showPlace));
      }
    }
  }

  if (!you) {
    host.appendChild(noteEl('FINISH A RUN TO TAKE A PLACE'));
  }
  if (opts.footer) {
    host.appendChild(noteEl(opts.footer));
  }
}

/**
 * The line under the score on the death screen. This is the retention loop in
 * one sentence, so it stays one sentence.
 */
export function rankLine({ cityRank, prevCityRank, city, worldRank }) {
  if (cityRank && city) {
    if (prevCityRank && cityRank < prevCityRank) return `YOU MOVED TO #${cityRank} IN ${city.toUpperCase()}`;
    return `YOU ARE #${cityRank} IN ${city.toUpperCase()}`;
  }
  if (worldRank) return `#${worldRank} IN THE WORLD`;
  return '';
}
