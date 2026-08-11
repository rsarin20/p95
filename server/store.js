import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_CALLSIGN = 16;
const TOP_N = 10;

/** Strip anything that would let a callsign impersonate UI chrome or smuggle markup. */
export function sanitizeCallsign(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CALLSIGN);
  return cleaned.length >= 2 ? cleaned : null;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token, hash) {
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(String(hash ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Flat-file player store. The whole leaderboard lives in memory; the JSON file
 * is a durability backstop written out on a debounce so a burst of score posts
 * costs one write instead of one write each.
 */
export class Store {
  #players = new Map();
  #file;
  #saveTimer = null;
  #saving = null;
  #dirty = false;

  constructor(file) {
    this.#file = file;
  }

  async load() {
    try {
      const raw = await readFile(this.#file, 'utf8');
      const parsed = JSON.parse(raw);
      for (const player of parsed.players ?? []) {
        if (player?.id) this.#players.set(player.id, player);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[store] could not read ${this.#file}: ${err.message} — starting empty`);
      }
    }
    return this;
  }

  createPlayer({ callsign, location }) {
    const id = randomUUID();
    const token = randomBytes(24).toString('base64url');
    const player = {
      id,
      tokenHash: hashToken(token),
      callsign,
      city: location?.city ?? null,
      country: location?.country ?? null,
      countryCode: location?.countryCode ?? null,
      best: 0,
      runs: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.#players.set(id, player);
    this.#scheduleSave();
    return { player, token };
  }

  authenticate(id, token) {
    const player = this.#players.get(id);
    if (!player || typeof token !== 'string' || !token) return null;
    return tokenMatches(token, player.tokenHash) ? player : null;
  }

  renamePlayer(player, callsign) {
    player.callsign = callsign;
    player.updatedAt = Date.now();
    this.#scheduleSave();
    return player;
  }

  /** Records a run. Returns whether it beat the player's previous best. */
  submitScore(player, score) {
    player.runs += 1;
    player.updatedAt = Date.now();
    const improved = score > player.best;
    if (improved) player.best = score;
    this.#scheduleSave();
    return improved;
  }

  /** Refresh a player's location if geo lookup was slow or previously failed. */
  updateLocation(player, location) {
    if (!location?.city || player.city) return;
    player.city = location.city;
    player.country = location.country ?? null;
    player.countryCode = location.countryCode ?? null;
    this.#scheduleSave();
  }

  #ranked() {
    return [...this.#players.values()]
      .filter((p) => p.best > 0)
      .sort((a, b) => b.best - a.best || a.updatedAt - b.updatedAt);
  }

  static #publicRow(player, rank) {
    return {
      rank,
      id: player.id,
      callsign: player.callsign,
      score: player.best,
      city: player.city,
      country: player.country,
      countryCode: player.countryCode
    };
  }

  /**
   * Leaderboard view: global top 10, the requesting player's standing, and the
   * best player in their city so local rivalry has a face.
   */
  leaderboard(viewerId) {
    const ranked = this.#ranked();
    const top = ranked.slice(0, TOP_N).map((p, i) => Store.#publicRow(p, i + 1));

    let you = null;
    let local = null;
    const viewer = viewerId ? this.#players.get(viewerId) : null;

    if (viewer) {
      const index = ranked.findIndex((p) => p.id === viewer.id);
      you = {
        ...Store.#publicRow(viewer, index >= 0 ? index + 1 : null),
        runs: viewer.runs,
        inTop: index >= 0 && index < TOP_N
      };

      if (viewer.city) {
        const cityKey = viewer.city.toLowerCase();
        const localRanked = ranked.filter((p) => p.city?.toLowerCase() === cityKey);
        const localIndex = localRanked.findIndex((p) => p.id === viewer.id);
        if (localRanked.length) {
          local = {
            city: viewer.city,
            countryCode: viewer.countryCode,
            players: localRanked.length,
            champion: Store.#publicRow(localRanked[0], 1),
            yourRank: localIndex >= 0 ? localIndex + 1 : null
          };
        }
      }
    }

    return { top, you, local, totalPlayers: ranked.length };
  }

  #scheduleSave() {
    this.#dirty = true;
    if (this.#saveTimer) return;
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.flush().catch((err) => console.error('[store] save failed:', err.message));
    }, 750);
    this.#saveTimer.unref?.();
  }

  /** Serialise writes so two overlapping flushes can't interleave onto one temp file. */
  async flush() {
    if (this.#saving) return this.#saving.then(() => (this.#dirty ? this.flush() : undefined));
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#saving = this.#write();
    try {
      await this.#saving;
    } finally {
      this.#saving = null;
    }
  }

  async #write() {
    const payload = JSON.stringify({ version: 1, players: [...this.#players.values()] });
    await mkdir(dirname(this.#file), { recursive: true });
    const tmp = join(dirname(this.#file), `.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, this.#file);
  }
}
