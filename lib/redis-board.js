// Leaderboard storage backed by Redis over HTTP (Upstash / Vercel KV).
//
// Speaks the Upstash REST protocol directly with fetch, so there is no package
// to install and nothing to bundle — the whole client is the twenty lines of
// `pipeline` below. Works unchanged with a Vercel KV store, an Upstash
// database, or anything else exposing that REST shape.
//
// Layout:
//   mh:p            hash   playerId -> JSON {name, city, score, ticks, at}
//   mh:world        zset   playerId scored by best score
//   mh:c:<city>     zset   the same, per city
//
// A sorted set is the right shape here: ranking a player among a million others
// is O(log n) rather than a scan, which is the one operation this has to do on
// every single submission.

const TOP_KEY = 'mh:world';
const META_KEY = 'mh:p';

export function redisConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

const cityKey = (city) => `mh:c:${String(city).toLowerCase().replace(/\s+/g, '-')}`;

export class RedisBoard {
  constructor({ url, token }) {
    this.url = url;
    this.token = token;
    this.durable = true;
  }

  async pipeline(commands) {
    if (!commands.length) return [];
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`redis http ${res.status}`);
    const out = await res.json();
    return out.map((r) => {
      if (r.error) throw new Error(`redis: ${r.error}`);
      return r.result;
    });
  }

  async one(command) {
    const [result] = await this.pipeline([command]);
    return result;
  }

  async load() {
    return this;
  }

  // --- the interface shared with the local backend -------------------------

  async submit({ id, name, city, score, ticks }) {
    const raw = await this.one(['HGET', META_KEY, id]);
    const existing = raw ? safeParse(raw) : null;
    const improved = !existing || score > existing.score;

    const best = improved ? score : existing.score;
    const meta = {
      name,
      city,
      score: best,
      ticks: improved ? ticks : existing.ticks,
      at: improved ? Date.now() : existing.at,
    };

    const commands = [['HSET', META_KEY, id, JSON.stringify(meta)]];

    // GT means the score only ever moves up, so a late-arriving lower run —
    // one that sat in an offline queue for two hours — can never demote a
    // player's best.
    if (improved) {
      commands.push(['ZADD', TOP_KEY, 'GT', 'CH', String(score), id]);
      if (city) commands.push(['ZADD', cityKey(city), 'GT', 'CH', String(score), id]);
    }
    // If they have moved city, drop them from the old one's board.
    if (existing && existing.city && existing.city !== city) {
      commands.push(['ZREM', cityKey(existing.city), id]);
      if (city) commands.push(['ZADD', cityKey(city), 'GT', 'CH', String(best), id]);
    }

    await this.pipeline(commands);
    return { improved, best };
  }

  async hydrate(flat) {
    // ZREVRANGE ... WITHSCORES returns [member, score, member, score, ...]
    const ids = [];
    const scores = [];
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i]);
      scores.push(Number(flat[i + 1]));
    }
    if (!ids.length) return [];
    const metas = await this.one(['HMGET', META_KEY, ...ids]);
    return ids.map((id, i) => {
      const m = safeParse(metas[i]) || {};
      return { id, score: scores[i], name: m.name || 'anon', city: m.city || '' };
    });
  }

  async scope(city, playerId, topN, spread) {
    const key = city ? cityKey(city) : TOP_KEY;

    const [flatTop, total, rank] = await this.pipeline([
      ['ZREVRANGE', key, '0', String(topN - 1), 'WITHSCORES'],
      ['ZCARD', key],
      ['ZREVRANK', key, playerId || '__none__'],
    ]);

    const top = (await this.hydrate(flatTop)).map((e, i) => ({ ...e, rank: i + 1 }));

    let you = null;
    let window = [];

    if (rank !== null && rank !== undefined) {
      const idx = Number(rank); // zero-based
      if (idx < topN) {
        you = top[idx] || null;
      } else {
        const from = Math.max(topN, idx - spread);
        const to = idx + spread;
        const flat = await this.one(['ZREVRANGE', key, String(from), String(to), 'WITHSCORES']);
        window = (await this.hydrate(flat)).map((e, i) => ({ ...e, rank: from + i + 1 }));
        you = window.find((e) => e.id === playerId) || null;
      }
    }

    return { top, you, window, total: Number(total) || 0 };
  }

  async ranks(id, city) {
    const commands = [['ZREVRANK', TOP_KEY, id]];
    if (city) commands.push(['ZREVRANK', cityKey(city), id]);
    const [world, local] = await this.pipeline(commands);
    return {
      worldRank: world === null || world === undefined ? null : Number(world) + 1,
      cityRank: local === null || local === undefined ? null : Number(local) + 1,
    };
  }

  async size() {
    return Number(await this.one(['ZCARD', TOP_KEY])) || 0;
  }
}

function safeParse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
