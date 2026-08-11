import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const MAX_CALLSIGN = 16;
export const TOP_N = 10;

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

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare of a presented token against a stored hash. */
export function tokenMatches(token, hash) {
  if (typeof token !== 'string' || !token) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(String(hash ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A brand new player plus the one and only time their raw token exists. */
export function newPlayer({ callsign, location }) {
  const token = randomBytes(24).toString('base64url');
  const player = {
    id: randomUUID(),
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
  return { player, token };
}

/** The subset of a player that is safe to put on a public leaderboard. */
export function publicRow(player, rank) {
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

export const cityKey = (city) => city.trim().toLowerCase();
