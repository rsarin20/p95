// Leaderboard storage.
//
// A JSON file and an in-memory index. That is genuinely enough to launch with —
// it will hold a few hundred thousand entries comfortably, and the shape of the
// interface below (one best score per player, ranked reads) is the same shape a
// real database would expose later, so swapping it out touches this file only.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_PATH = join(process.cwd(), 'data', 'leaderboard.json');

export class Board {
  constructor(path = DEFAULT_PATH) {
    this.path = path;
    /** @type {Map<string, {id,name,city,score,ticks,at}>} keyed by player id */
    this.players = new Map();
    this.sorted = null; // lazily rebuilt ranking
    this.dirty = false;
    this.writing = null;
  }

  async load() {
    try {
      const raw = await readFile(this.path, 'utf8');
      const data = JSON.parse(raw);
      for (const e of data.players || []) this.players.set(e.id, e);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.sorted = null;
    return this;
  }

  async save() {
    if (!this.dirty) return;
    // Coalesce concurrent saves — the whole file is rewritten each time, so
    // there is no value in doing it twice at once.
    if (this.writing) return this.writing;

    this.dirty = false;
    const payload = JSON.stringify({
      version: 1,
      players: [...this.players.values()],
    });

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

  /**
   * Record a verified run. Only a player's best score is kept — the
   * leaderboard is a list of people, not a list of attempts.
   */
  submit({ id, name, city, score, ticks }) {
    const existing = this.players.get(id);
    const improved = !existing || score > existing.score;

    if (improved) {
      this.players.set(id, { id, name, city, score, ticks, at: Date.now() });
      this.sorted = null;
      this.dirty = true;
    } else if (existing.name !== name || existing.city !== city) {
      // Keep the identity current even when the run did not beat their best.
      existing.name = name;
      existing.city = city;
      this.sorted = null;
      this.dirty = true;
    }

    return { improved, best: this.players.get(id).score };
  }

  ranking() {
    if (!this.sorted) {
      this.sorted = [...this.players.values()].sort(
        // Ties go to whoever got there first.
        (a, b) => b.score - a.score || a.at - b.at,
      );
      this.rankById = new Map();
      this.sorted.forEach((e, i) => this.rankById.set(e.id, i + 1));
    }
    return this.sorted;
  }

  cityRanking(city) {
    const key = String(city || '').toLowerCase();
    return this.ranking().filter((e) => (e.city || '').toLowerCase() === key);
  }

  rankOf(id) {
    this.ranking();
    return this.rankById.get(id) || null;
  }

  cityRankOf(id, city) {
    if (!city) return null;
    const list = this.cityRanking(city);
    const i = list.findIndex((e) => e.id === id);
    return i < 0 ? null : i + 1;
  }
}

const view = (e, rank) => ({
  rank,
  id: e.id,
  name: e.name,
  score: e.score,
  city: e.city || '',
});

/**
 * Top rows, plus — if the player sits outside them — the two entries either
 * side of their own. Being 48th should show you 47th, so there is always
 * exactly one person to catch.
 */
export function boardSlice(list, playerId, topN = 10, around = 1) {
  const top = list.slice(0, topN).map((e, i) => view(e, i + 1));

  let you = null;
  let windowRows = [];

  const idx = list.findIndex((e) => e.id === playerId);
  if (idx >= 0) {
    you = view(list[idx], idx + 1);
    if (idx >= topN) {
      const from = Math.max(topN, idx - around);
      const to = Math.min(list.length, idx + around + 1);
      windowRows = list.slice(from, to).map((e, i) => view(e, from + i + 1));
    }
  }

  return { top, you, window: windowRows, total: list.length };
}
