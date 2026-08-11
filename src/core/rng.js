// Deterministic PRNG.
//
// Every operation here is integer (uint32) arithmetic, which is bit-identical
// across every JS engine. The simulation must produce the exact same run on the
// player's browser and on the server that re-verifies it, so nothing in the
// deterministic path is allowed to touch Math.random, Math.exp or Math.pow.

/** mulberry32 — small, fast, good enough distribution for obstacle placement. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [lo, hi). */
export function rangeOf(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

/** Integer in [0, n). */
export function intOf(rng, n) {
  return Math.floor(rng() * n) % n;
}

/**
 * Pick an entry from `items` using each item's `.weight`.
 * `skip` lets the caller re-draw without re-selecting a rejected candidate.
 */
export function pickWeighted(rng, items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].weight;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].weight;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** A seed suitable for a fresh run. Not part of the deterministic path. */
export function freshSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Math.random() * 4294967296) >>> 0;
}
