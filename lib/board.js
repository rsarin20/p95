// Picking a leaderboard backend.
//
// The rule is that the game must deploy and be playable with no configuration
// at all. So storage degrades rather than failing:
//
//   KV credentials present   → Redis. Durable, ranks a million players.
//   running locally          → a JSON file next to the source.
//   neither (fresh deploy)   → memory, which resets. The board says so.
//
// The last case is the one that matters: someone should be able to deploy this
// and share the link in the same minute, and only think about a database when
// they care that the scores stick.

import { join } from 'node:path';
import { LocalBoard } from './local-board.js';
import { RedisBoard, redisConfig } from './redis-board.js';

const TOP_ROWS = 10;
const SPREAD = 1;

let cached = null;

export function getBoard() {
  if (cached) return cached;

  const cfg = redisConfig();
  if (cfg) {
    cached = Promise.resolve(new RedisBoard(cfg));
    return cached;
  }

  // A serverless filesystem is read-only apart from a per-instance /tmp, so
  // there is nothing worth persisting to there.
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const path = serverless ? null : process.env.MOONHOP_DATA || join(process.cwd(), 'data', 'leaderboard.json');

  cached = new LocalBoard(path).load();
  return cached;
}

/**
 * The whole leaderboard read: the world board, and the player's city board if
 * they have one. Both come back already sliced to the rows worth showing.
 */
export async function readBoard(playerId, city) {
  const board = await getBoard();
  const world = await board.scope(null, playerId, TOP_ROWS, SPREAD);
  const cityBoard = city
    ? { name: city, ...(await board.scope(city, playerId, TOP_ROWS, SPREAD)) }
    : null;
  return { world, city: cityBoard, durable: board.durable };
}

export async function submitRun(result) {
  const board = await getBoard();
  const { improved, best } = await board.submit(result);
  const { worldRank, cityRank } = await board.ranks(result.id, result.city);
  return { improved, best, worldRank, cityRank, durable: board.durable };
}
