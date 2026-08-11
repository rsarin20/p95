import { hasStore } from './_api.js';

/** Deploy check: is a leaderboard store wired up, or is this local-only? */
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({ ok: true, store: hasStore ? 'redis' : 'none' });
}
