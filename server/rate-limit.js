/** Fixed-window counter keyed by IP. Enough to blunt a script, not a botnet. */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();

  return function allow(key) {
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10000) sweep(hits, now);
      return { ok: true, remaining: max - 1, retryAfter: 0 };
    }

    entry.count += 1;
    if (entry.count > max) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.reset - now) / 1000) };
    }
    return { ok: true, remaining: max - entry.count, retryAfter: 0 };
  };
}

function sweep(hits, now) {
  for (const [key, entry] of hits) {
    if (now > entry.reset) hits.delete(key);
  }
}
