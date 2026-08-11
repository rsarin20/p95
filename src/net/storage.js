// Local persistence.
//
// localStorage is the primary and only client-side store. No cookie is set:
// nothing here needs to travel with a request, the server identifies a player
// by an id in the body, and localStorage survives configurations where
// third-party or restricted cookie policies would not.
//
// Every read is defensive. A player in private mode with storage disabled
// should still get a completely playable game — they simply get a fresh name
// prompt each session, which is a far better failure than a crash.

const KEY = {
  name: 'moonhop.name',
  id: 'moonhop.id',
  best: 'moonhop.best',
  jumped: 'moonhop.jumped',
  city: 'moonhop.city',
  queue: 'moonhop.queue',
  cityRank: 'moonhop.cityrank',
};

let memory = {};
let available = null;

function canStore() {
  if (available !== null) return available;
  try {
    localStorage.setItem('moonhop.probe', '1');
    localStorage.removeItem('moonhop.probe');
    available = true;
  } catch {
    available = false;
  }
  return available;
}

function read(key) {
  if (!canStore()) return memory[key] ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}

function write(key, value) {
  memory[key] = value;
  if (!canStore()) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* out of quota or blocked — memory copy stands in for the session */
  }
}

// --- name -------------------------------------------------------------------

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{2,13}$/;

/**
 * Names are lowercased and restricted to a small character set. Not to be
 * strict for its own sake — it keeps the leaderboard visually even, and it
 * removes the whole class of look-alike and control-character impersonation
 * without needing a moderation system on day one.
 */
export function normaliseName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 14);
}

export function validateName(raw) {
  const name = normaliseName(raw);
  if (name.length < 3) return { ok: false, reason: 'AT LEAST 3 CHARACTERS' };
  if (!NAME_RE.test(name)) return { ok: false, reason: 'LETTERS AND NUMBERS ONLY' };
  return { ok: true, name };
}

export const getName = () => read(KEY.name);
export const setName = (n) => write(KEY.name, n);

export function playerId() {
  let id = read(KEY.id);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    write(KEY.id, id);
  }
  return id;
}

// --- best score -------------------------------------------------------------

export function getBest() {
  return Number(read(KEY.best) || 0) || 0;
}

export function setBest(score) {
  if (score > getBest()) {
    write(KEY.best, String(score));
    return true;
  }
  return false;
}

// --- first-jump hint --------------------------------------------------------

export const hasJumped = () => read(KEY.jumped) === '1';
export const markJumped = () => write(KEY.jumped, '1');

// --- city -------------------------------------------------------------------

/**
 * The player's city, derived from their IANA time zone.
 *
 * Deliberately not geolocation and deliberately not an IP lookup. The time zone
 * already lives in the browser, needs no permission prompt, and resolves to a
 * city-sized label and nothing finer. The leaderboard only ever wants a place
 * name — so a place name is the only thing that is ever produced or sent.
 */
export function detectCity() {
  const cached = read(KEY.city);
  if (cached) return cached;

  let city = null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tail = tz.split('/').pop() || '';
    if (tail && tail !== 'UTC' && tail !== 'GMT' && /^[A-Za-z_]+$/.test(tail)) {
      city = tail.replace(/_/g, ' ');
    }
  } catch {
    city = null;
  }

  if (city) write(KEY.city, city);
  return city;
}

export const setCity = (c) => write(KEY.city, c);

// --- last known city rank, for the "you moved to #5" line -------------------

export function getCityRank() {
  const v = Number(read(KEY.cityRank) || 0);
  return v > 0 ? v : null;
}

export const setCityRank = (r) => write(KEY.cityRank, r ? String(r) : null);

// --- pending run queue ------------------------------------------------------
//
// A run finished on a plane is still a run. Records wait here until there is a
// network, then go up in order.

const MAX_QUEUE = 20;

export function queued() {
  try {
    const raw = read(KEY.queue);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function enqueue(record) {
  const list = queued();
  list.push(record);
  // Keep the best runs if the queue ever overflows — those are the ones that
  // matter to a leaderboard.
  if (list.length > MAX_QUEUE) {
    list.sort((a, b) => b.score - a.score);
    list.length = MAX_QUEUE;
  }
  write(KEY.queue, JSON.stringify(list));
}

export function setQueue(list) {
  write(KEY.queue, JSON.stringify(list.slice(0, MAX_QUEUE)));
}
