// The night, as a function of how long you have survived.
//
// Three rules hold across every phase: the background is almost black, there is
// exactly one luminous accent, and nothing is ever fully still. The phases do
// not change the rules — they only rotate the hue and let the moon move.

import { PHASES } from '../core/config.js';

export const KEYS = {
  dusk: {
    top: '#150c26',
    mid: '#2a1338',
    bot: '#43204a',
    accent: '#e6c2ff',
    star: '#cbb8ea',
    starAlpha: 0.22,
    dune: ['#120a20', '#0a0616', '#05030c'],
    ground: '#04020a',
    glow: 0.42,
  },
  moonrise: {
    top: '#0c0a20',
    mid: '#161230',
    bot: '#251b3d',
    accent: '#cfe0ff',
    star: '#cfdcf5',
    starAlpha: 0.5,
    dune: ['#0d0b1e', '#080714', '#04030b'],
    ground: '#03030a',
    glow: 0.5,
  },
  midnight: {
    top: '#04050f',
    mid: '#080a1a',
    bot: '#0e1226',
    accent: '#dceaff',
    star: '#eaf2ff',
    starAlpha: 1,
    dune: ['#080b18', '#050710', '#020308'],
    ground: '#010208',
    glow: 0.62,
  },
  deepnight: {
    top: '#020309',
    mid: '#050710',
    bot: '#090c1a',
    accent: '#cfe2ff',
    star: '#dbe8ff',
    starAlpha: 0.82,
    dune: ['#06080f', '#03050b', '#010206'],
    ground: '#000106',
    glow: 0.72,
  },
  dawn: {
    top: '#0a1128',
    mid: '#241f3e',
    bot: '#5c3346',
    accent: '#ffcb9a',
    star: '#ffe4cf',
    starAlpha: 0.26,
    dune: ['#170f22', '#0d0814', '#05030a'],
    ground: '#06030a',
    glow: 0.55,
  },
};

const ORDER = PHASES.map((p) => p.key);
const STOPS = PHASES.map((p) => p.from);

/** Where the cross-fade to the next phase begins, as a fraction of the era. */
const FADE_START = 0.55;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The palette at a given score. Each era holds its own look for most of its
 * length and then cross-fades, so the change reads as the night moving on
 * rather than as a slider being dragged.
 */
export function paletteAtScore(score) {
  let i = 0;
  while (i < STOPS.length - 1 && score >= STOPS[i + 1]) i++;

  const a = KEYS[ORDER[i]];
  if (i >= STOPS.length - 1) return { ...a, phase: ORDER[i], next: ORDER[i], t: 0 };

  const b = KEYS[ORDER[i + 1]];
  const local = (score - STOPS[i]) / (STOPS[i + 1] - STOPS[i]);
  const t = local < FADE_START ? 0 : smoothstep((local - FADE_START) / (1 - FADE_START));

  return {
    phase: ORDER[i],
    next: ORDER[i + 1],
    t,
    top: mixHex(a.top, b.top, t),
    mid: mixHex(a.mid, b.mid, t),
    bot: mixHex(a.bot, b.bot, t),
    accent: mixHex(a.accent, b.accent, t),
    star: mixHex(a.star, b.star, t),
    starAlpha: lerp(a.starAlpha, b.starAlpha, t),
    ground: mixHex(a.ground, b.ground, t),
    glow: lerp(a.glow, b.glow, t),
    dune: [
      mixHex(a.dune[0], b.dune[0], t),
      mixHex(a.dune[1], b.dune[1], t),
      mixHex(a.dune[2], b.dune[2], t),
    ],
  };
}

/**
 * The moon's altitude (0 = sitting on the horizon, 1 = high), horizontal
 * position across the sky, and size.
 *
 * It is absent through dusk, rises across moonrise, holds through midnight,
 * and then spends the whole of deep night falling back toward the horizon —
 * which is what makes a long run feel like a night actually passing.
 */
export function moonAtScore(score) {
  let alt;
  if (score < 500) alt = -0.25;
  else if (score < 1500) alt = -0.25 + 1.25 * smoothstep((score - 500) / 1000);
  else if (score < 3000) alt = 1;
  else if (score < 10000) alt = 1 - 0.92 * smoothstep((score - 3000) / 7000);
  else alt = 0.08 - 0.4 * Math.min(1, (score - 10000) / 6000);

  // A slow drift across the sky over the whole run.
  const travel = Math.min(1, score / 16000);
  const x = 0.78 - 0.56 * travel;

  // Low moons read as larger. A cheap trick, and it works.
  const size = 22 + 9 * (1 - Math.max(0, Math.min(1, alt)));

  return { alt, x, size, visible: alt > -0.22 };
}
