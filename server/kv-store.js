import { TOP_N, cityKey, newPlayer, publicRow, tokenMatches } from './player.js';

const PLAYER = (id) => `capy:p:${id}`;
const BOARD = 'capy:board';
const CITY = (city) => `capy:city:${cityKey(city)}`;

/**
 * Redis-backed player store, for hosts where the process is disposable.
 *
 * Same surface as the file-backed `Store`, but every method is async and hits
 * the network. Player records are JSON strings; ranking rides on two sorted
 * sets (global and per-city) keyed by best score, which is what makes "your
 * rank" a single O(log n) command instead of a full scan.
 *
 * One difference worth knowing: the file store breaks ties on who got there
 * first, while a sorted set breaks them on member id. Exact-score ties are rare
 * enough that paying for a composite score key isn't worth the precision risk.
 */
export class KvStore {
  constructor(kv) {
    this.kv = kv;
  }

  async createPlayer({ callsign, location }) {
    const { player, token } = newPlayer({ callsign, location });
    await this.kv.run('SET', PLAYER(player.id), JSON.stringify(player));
    return { player, token };
  }

  async #read(id) {
    if (typeof id !== 'string' || !id) return null;
    const raw = await this.kv.run('GET', PLAYER(id));
    return parse(raw);
  }

  async #write(player) {
    await this.kv.run('SET', PLAYER(player.id), JSON.stringify(player));
  }

  async authenticate(id, token) {
    const player = await this.#read(id);
    if (!player) return null;
    return tokenMatches(token, player.tokenHash) ? player : null;
  }

  async renamePlayer(player, callsign) {
    player.callsign = callsign;
    player.updatedAt = Date.now();
    await this.#write(player);
    return player;
  }

  async updateLocation(player, location) {
    if (!location?.city || player.city) return;
    player.city = location.city;
    player.country = location.country ?? null;
    player.countryCode = location.countryCode ?? null;
    await this.#write(player);
    // A player who already had scores needs backfilling into their city board.
    if (player.best > 0) await this.kv.run('ZADD', CITY(player.city), player.best, player.id);
  }

  async submitScore(player, score) {
    player.runs += 1;
    player.updatedAt = Date.now();
    const improved = score > player.best;
    if (improved) player.best = score;

    const commands = [['SET', PLAYER(player.id), JSON.stringify(player)]];
    if (improved) {
      commands.push(['ZADD', BOARD, player.best, player.id]);
      if (player.city) commands.push(['ZADD', CITY(player.city), player.best, player.id]);
    }
    await this.kv.pipeline(commands);
    return improved;
  }

  async leaderboard(viewerId) {
    const wantsViewer = typeof viewerId === 'string' && viewerId.length > 0;

    const [topRaw, totalPlayers, viewerRaw, viewerRank] = await this.kv.pipeline([
      ['ZREVRANGE', BOARD, 0, TOP_N - 1],
      ['ZCARD', BOARD],
      ...(wantsViewer ? [['GET', PLAYER(viewerId)], ['ZREVRANK', BOARD, viewerId]] : [])
    ]);

    const topIds = Array.isArray(topRaw) ? topRaw : [];
    const viewer = wantsViewer ? parse(viewerRaw) : null;

    // Fetch the top ten's records and the viewer's city standing together.
    const cityCommands = viewer?.city
      ? [
          ['ZREVRANGE', CITY(viewer.city), 0, 0],
          ['ZCARD', CITY(viewer.city)],
          ['ZREVRANK', CITY(viewer.city), viewer.id]
        ]
      : [];

    const results = await this.kv.pipeline([
      ...topIds.map((id) => ['GET', PLAYER(id)]),
      ...cityCommands
    ]);

    const records = new Map();
    const top = [];
    topIds.forEach((id, i) => {
      const player = parse(results[i]);
      if (!player) return;
      records.set(id, player);
      top.push(publicRow(player, top.length + 1));
    });

    let you = null;
    if (viewer) {
      const rank = Number.isInteger(viewerRank) ? viewerRank + 1 : null;
      you = {
        ...publicRow(viewer, rank),
        runs: viewer.runs,
        inTop: rank !== null && rank <= TOP_N
      };
    }

    let local = null;
    if (cityCommands.length) {
      const [championIds, cityCount, cityRank] = results.slice(topIds.length);
      const championId = Array.isArray(championIds) ? championIds[0] : null;
      if (championId && cityCount > 0) {
        const champion = records.get(championId) ?? (await this.#read(championId));
        if (champion) {
          local = {
            city: viewer.city,
            countryCode: viewer.countryCode,
            players: Number(cityCount) || 0,
            champion: publicRow(champion, 1),
            yourRank: Number.isInteger(cityRank) ? cityRank + 1 : null
          };
        }
      }
    }

    return { top, you, local, totalPlayers: Number(totalPlayers) || 0 };
  }

  /** No-op: writes are already durable. Kept so callers can treat stores alike. */
  async flush() {}
}

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw; // some KV tiers pre-decode JSON
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
