// Leaderboard storage backed by memory, optionally persisted to a JSON file.
//
// Used for local development (with a file) and as the zero-config fallback on a
// serverless host (without one). It keeps one best score per player and ranks
// by sorting, which is entirely adequate up to a few hundred thousand entries.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class LocalBoard {
  /** @param {string|null} path  a JSON file to persist to, or null for memory only */
  constructor(path = null) {
    this.path = path;
    this.durable = !!path;
    /** @type {Map<string, {id,name,city,score,ticks,at}>} */
    this.players = new Map();
    this.sorted = null;
    this.rankById = null;
    this.dirty = false;
    this.writing = null;
  }

  async load() {
    if (!this.path) return this;
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      for (const e of data.players || []) this.players.set(e.id, e);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.invalidate();
    return this;
  }

  invalidate() {
    this.sorted = null;
    this.rankById = null;
  }

  async save() {
    if (!this.path || !this.dirty) return;
    // Coalesce concurrent saves — the whole file is rewritten each time.
    if (this.writing) return this.writing;

    this.dirty = false;
    const payload = JSON.stringify({ version: 1, players: [...this.players.values()] });

    this.writing = (async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, payload, 'utf8');
      await rename(tmp, this.path); // atomic: never a half-written board
    })().finally(() => {
      this.writing = null;
    });

    return this.writing;
  }

  ranking(city) {
    if (!this.sorted) {
      this.sorted = [...this.players.values()].sort(
        // Ties go to whoever got there first.
        (a, b) => b.score - a.score || a.at - b.at,
      );
      this.rankById = new Map();
      this.sorted.forEach((e, i) => this.rankById.set(e.id, i + 1));
    }
    if (!city) return this.sorted;
    const key = city.toLowerCase();
    return this.sorted.filter((e) => (e.city || '').toLowerCase() === key);
  }

  // --- the interface shared with the Redis backend -------------------------

  async submit({ id, name, city, score, ticks }) {
    const existing = this.players.get(id);
    const improved = !existing || score > existing.score;

    if (improved) {
      this.players.set(id, { id, name, city, score, ticks, at: Date.now() });
      this.invalidate();
      this.dirty = true;
    } else if (existing.name !== name || existing.city !== city) {
      // Keep the identity current even when the run did not beat their best.
      existing.name = name;
      existing.city = city;
      this.invalidate();
      this.dirty = true;
    }

    await this.save();
    return { improved, best: this.players.get(id).score };
  }

  async scope(city, playerId, topN, spread) {
    const list = this.ranking(city);
    const top = list.slice(0, topN).map((e, i) => entry(e, i + 1));

    let you = null;
    let window = [];
    const idx = list.findIndex((e) => e.id === playerId);
    if (idx >= 0) {
      you = entry(list[idx], idx + 1);
      if (idx >= topN) {
        const from = Math.max(topN, idx - spread);
        const to = Math.min(list.length, idx + spread + 1);
        window = list.slice(from, to).map((e, i) => entry(e, from + i + 1));
      }
    }
    return { top, you, window, total: list.length };
  }

  async ranks(id, city) {
    const world = this.ranking(null).findIndex((e) => e.id === id);
    const local = city ? this.ranking(city).findIndex((e) => e.id === id) : -1;
    return {
      worldRank: world < 0 ? null : world + 1,
      cityRank: local < 0 ? null : local + 1,
    };
  }

  async size() {
    return this.players.size;
  }
}

function entry(e, rank) {
  return { rank, id: e.id, name: e.name, score: e.score, city: e.city || '' };
}
