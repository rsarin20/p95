// POST /api/score — verify a run by replaying it, then record it.
import { handleScore, send } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    await handleScore(req, res);
  } catch (err) {
    console.error('score failed:', err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
}
