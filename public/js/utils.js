export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

/** Frame-rate independent easing — approaches `to` at the same rate at any dt. */
export const approach = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));

/** Weighted choice over `[{ weight, ... }]`. */
export function weightedPick(entries) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

export const padScore = (value, width = 5) => String(Math.max(0, Math.floor(value))).padStart(width, '0');

/** 14320 -> "14.3k" for tight leaderboard columns. */
export function compactScore(value) {
  const n = Math.floor(value);
  if (n < 10_000) return n.toLocaleString('en-US');
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

// ── Colour helpers ────────────────────────────────────────────────────
// Palettes are stored as [r, g, b] triples so phases can be blended per frame.

export const rgb = ([r, g, b], alpha = 1) =>
  alpha >= 1 ? `rgb(${r | 0} ${g | 0} ${b | 0})` : `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`;

const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Blend every colour of two palettes; both must share the same keys. */
export function mixPalette(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    out[key] = typeof a[key] === 'number' ? lerp(a[key], b[key], t) : mix(a[key], b[key], t);
  }
  return out;
}
