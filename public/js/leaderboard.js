import { api, ApiError } from './api.js';
import { identity } from './identity.js';

const POLL_MS = 20_000;

/**
 * Bridges the local identity and the global board.
 *
 * The game must stay playable with no server at all — open `public/index.html`
 * straight off disk and you still get a callsign, a personal best and a working
 * run. Everything here therefore degrades to local-only instead of throwing.
 */
export class Session {
  record = null;
  board = null;
  offline = false;

  /**
   * Set once the server tells us it has no leaderboard store at all (a deploy
   * without a database binding). Unlike a flaky connection this will not fix
   * itself, so we stop asking entirely rather than retrying every 20 seconds
   * for the rest of the session.
   */
  #storeless = false;

  constructor({ onChange } = {}) {
    this.onChange = onChange ?? (() => {});
  }

  /** Note a failure, and remember if the server is permanently store-less. */
  #noteFailure(err) {
    if (err instanceof ApiError && err.code === 'no-store') {
      this.#storeless = true;
      this.stopPolling();
    }
    this.offline = !(err instanceof ApiError) || err.offline;
    return this.offline;
  }

  get id() {
    return this.record?.id ?? null;
  }

  get best() {
    return this.record?.best ?? 0;
  }

  /** @returns {boolean} whether a returning player was recognised. */
  async boot() {
    this.record = identity.load();
    if (!this.record) return false;

    try {
      const fresh = await api.touchSession(this.record);
      this.record = identity.save({
        ...this.record,
        callsign: fresh.callsign,
        best: Math.max(this.record.best ?? 0, fresh.best ?? 0),
        ...fresh.location
      });
      this.offline = false;
    } catch (err) {
      // A 401 means the server forgot us (fresh data file) — start over rather
      // than stranding the player with an identity nothing recognises.
      if (err instanceof ApiError && err.status === 401) {
        identity.clear();
        this.record = null;
        return false;
      }
      this.#noteFailure(err);
    }

    this.onChange(this);
    await this.refresh();
    return true;
  }

  async register(callsign) {
    try {
      const created = await api.createSession(callsign);
      this.record = identity.save({
        id: created.id,
        token: created.token,
        callsign: created.callsign,
        best: 0,
        ...created.location
      });
      this.offline = false;
    } catch (err) {
      if (!this.#noteFailure(err)) throw err;
      // No server: mint a local-only identity so play can start immediately.
      this.record = identity.save({
        id: `local-${crypto.randomUUID()}`,
        token: 'local',
        callsign,
        best: 0
      });
      this.offline = true;
    }

    this.onChange(this);
    await this.refresh();
    return this.record;
  }

  async rename(callsign) {
    if (!this.record) return null;
    this.record = identity.save({ ...this.record, callsign });
    if (!this.offline && !this.#storeless) {
      try {
        await api.touchSession({ ...this.record, callsign });
      } catch (err) {
        this.#noteFailure(err);
      }
    }
    this.onChange(this);
    return this.record;
  }

  /** Record a finished run. Always updates the local best, server or not. */
  async submit(score, durationMs) {
    const improvedLocally = score > this.best;
    if (improvedLocally && this.record) {
      this.record = identity.save({ ...this.record, best: score });
    }

    if (!this.record || this.offline || this.#storeless || this.record.token === 'local') {
      this.#localBoard();
      this.onChange(this);
      return { best: this.best, improved: improvedLocally, rank: null, offline: true };
    }

    try {
      const result = await api.postScore({
        id: this.record.id,
        token: this.record.token,
        score,
        durationMs
      });
      this.record = identity.save({ ...this.record, best: Math.max(this.best, result.best) });
      this.board = { top: result.top, you: result.you, local: result.local, totalPlayers: result.totalPlayers };
      this.offline = false;
      this.onChange(this);
      return { best: this.record.best, improved: result.improved, rank: result.you?.rank ?? null, offline: false };
    } catch (err) {
      this.#noteFailure(err);
      this.#localBoard();
      this.onChange(this);
      return { best: this.best, improved: improvedLocally, rank: null, offline: true, error: err.message };
    }
  }

  async refresh() {
    if (this.#storeless) {
      this.#localBoard();
      this.onChange(this);
      return this.board;
    }
    try {
      this.board = await api.leaderboard(this.id);
      this.offline = false;
    } catch (err) {
      this.#noteFailure(err);
      this.#localBoard();
    }
    this.onChange(this);
    return this.board;
  }

  /** Stand-in board built from just this device, used when the server is gone. */
  #localBoard() {
    if (!this.record) {
      this.board = { top: [], you: null, local: null, totalPlayers: 0 };
      return;
    }
    const you = {
      rank: this.best > 0 ? 1 : null,
      id: this.record.id,
      callsign: this.record.callsign,
      score: this.best,
      city: this.record.city ?? null,
      country: this.record.country ?? null,
      countryCode: this.record.countryCode ?? null,
      inTop: this.best > 0
    };
    this.board = {
      top: this.best > 0 ? [you] : [],
      you,
      local: null,
      totalPlayers: this.best > 0 ? 1 : 0
    };
  }

  startPolling() {
    this.stopPolling();
    if (this.#storeless) return;
    this.#timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh();
    }, POLL_MS);
  }

  stopPolling() {
    clearInterval(this.#timer);
    this.#timer = 0;
  }

  #timer = 0;
}
