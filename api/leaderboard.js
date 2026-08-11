// GET /api/leaderboard — the world board, and the caller's city board.
import { handleLeaderboard, send } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    await handleLeaderboard(req, res, url);
  } catch (err) {
    console.error('leaderboard failed:', err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
}
