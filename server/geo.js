import { isIP } from 'node:net';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2500;
const EMPTY = Object.freeze({ city: null, country: null, countryCode: null });

const cache = new Map();

/**
 * Pull the caller's IP out of the proxy chain. `trustProxy` gates this because
 * X-Forwarded-For is caller-controlled when nothing in front of us rewrites it.
 */
export function clientIp(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = String(forwarded ?? '').split(',')[0].trim();
    if (first && isIP(normalize(first))) return normalize(first);
    const real = String(req.headers['x-real-ip'] ?? '').trim();
    if (real && isIP(normalize(real))) return normalize(real);
  }
  return normalize(req.socket.remoteAddress ?? '');
}

function normalize(ip) {
  // ::ffff:203.0.113.7 -> 203.0.113.7
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Loopback / RFC1918 / CGNAT / link-local — nothing a geo service can resolve. */
export function isPrivateIp(ip) {
  if (!ip || !isIP(ip)) return true;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  return false;
}

/**
 * Coarse location for a request.
 *
 * Prefers the edge network's own geo headers — Vercel and Cloudflare both
 * resolve the city before the request reaches us, which is faster, free, and
 * saves handing a user's IP to a third party at all. Falls back to an IP
 * lookup when running somewhere that doesn't provide them.
 */
export async function resolveLocation({ ip, headers }) {
  const fromEdge = locationFromHeaders(headers);
  if (fromEdge.city) return fromEdge;
  return lookup(ip);
}

/** Vercel / Cloudflare geo headers, or an empty location. */
export function locationFromHeaders(headers) {
  if (!headers) return EMPTY;
  const get = (name) => {
    const value = typeof headers.get === 'function' ? headers.get(name) : headers[name];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  // Vercel percent-encodes these, so "S%C3%A3o%20Paulo" arrives intact.
  const city = decode(get('x-vercel-ip-city') ?? get('cf-ipcity'));
  if (!city) return EMPTY;

  const countryCode = decode(get('x-vercel-ip-country') ?? get('cf-ipcountry'));
  return {
    city: trim(city, 28),
    country: null, // edge headers carry the code only; the UI shows the code
    countryCode: countryCode ? trim(countryCode, 2).toUpperCase() : null
  };
}

function decode(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readCache(ip) {
  const hit = cache.get(ip);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(ip);
    return null;
  }
  return hit.value;
}

function writeCache(ip, value, ttl) {
  if (cache.size > 5000) cache.clear();
  cache.set(ip, { value, expires: Date.now() + ttl });
}

/**
 * Coarse city-level geo from the client IP — no browser permission dialog, and
 * deliberately nothing finer than a city name. Failures are non-fatal: an
 * unlocatable player just shows up on the board without a location.
 */
export async function lookup(ip, { endpoint = process.env.GEO_ENDPOINT ?? 'https://ipwho.is/{ip}' } = {}) {
  if (isPrivateIp(ip)) return EMPTY;

  const cached = readCache(ip);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.replace('{ip}', encodeURIComponent(ip)), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`geo service returned ${res.status}`);
    const data = await res.json();

    // Tolerate the field naming used by the common free providers.
    const city = pick(data, ['city', 'region', 'regionName', 'state']);
    const country = pick(data, ['country', 'country_name', 'countryName']);
    const countryCode = pick(data, ['country_code', 'countryCode', 'country_code2']);

    const value = city
      ? {
          city: trim(city, 28),
          country: country ? trim(country, 32) : null,
          countryCode: countryCode ? trim(countryCode, 2).toUpperCase() : null
        }
      : EMPTY;

    writeCache(ip, value, value.city ? CACHE_TTL_MS : NEGATIVE_TTL_MS);
    return value;
  } catch (err) {
    if (process.env.GEO_DEBUG) console.warn(`[geo] lookup failed for ${ip}: ${err.message}`);
    writeCache(ip, EMPTY, NEGATIVE_TTL_MS);
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function trim(value, max) {
  return value.replace(/[\p{C}]/gu, '').slice(0, max);
}
