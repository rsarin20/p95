// Obstacle patterns.
//
// A pattern is a small cluster meant to be cleared by a *single* jump. All
// multi-jump difficulty comes from the gap between clusters, which tightens
// with score. This split is deliberate: it means the player is only ever
// solving one problem at a time — "when do I leave the ground" — and the game
// gets harder by shortening the answer, not by complicating the question.
//
// Offsets (`dx`) are fractions of the current jump span, so a cluster keeps its
// shape relative to the jump as the world speeds up.
//
// Each pattern also has a lifespan. `unlock` is where it starts appearing;
// `retire` is where it starts fading out. Fading matters as much as unlocking:
// a lone thornbrush is a ~780ms timing window at any speed, so if it kept full
// weight forever the late game would stay accidentally easy no matter how fast
// the desert moved. Retired patterns never vanish entirely — they settle to a
// low weight and become the breathing room between the demanding clusters.

const RAMP_IN = 400;
const RAMP_OUT = 3000;
const RESIDUAL = 0.15;

export const PATTERNS = [
  // --- Dusk: one obstacle, plenty of room ---------------------------------
  { id: 'thorn', unlock: 0, retire: 1500, weight: 10, items: [{ type: 'thornbrush' }] },
  { id: 'stone', unlock: 0, retire: 2000, weight: 8, items: [{ type: 'stone' }] },

  // --- The deceptive one ---------------------------------------------------
  // Thin enough to read as further away than it is.
  { id: 'branch', unlock: 350, retire: 3000, weight: 7, items: [{ type: 'branch' }] },
  {
    id: 'thorn-pair',
    unlock: 350,
    retire: 4000,
    weight: 6,
    items: [{ type: 'thornbrush' }, { type: 'thornbrush', dx: 0.3 }],
  },

  // --- The sand ridge: the first obstacle you cannot cheat -----------------
  { id: 'ridge', unlock: 1100, weight: 7, items: [{ type: 'ridge' }] },
  {
    id: 'stone-branch',
    unlock: 1100,
    retire: 7000,
    weight: 5,
    items: [{ type: 'stone' }, { type: 'branch', dx: 0.34 }],
  },
  {
    id: 'thorn-stone',
    unlock: 1100,
    retire: 6000,
    weight: 5,
    items: [{ type: 'thornbrush' }, { type: 'stone', dx: 0.28 }],
  },

  // --- Midnight: clusters that use most of the arc -------------------------
  {
    id: 'thorn-triple',
    unlock: 2200,
    weight: 6,
    items: [
      { type: 'thornbrush' },
      { type: 'thornbrush', dx: 0.26 },
      { type: 'thornbrush', dx: 0.52 },
    ],
  },
  {
    id: 'branch-pair',
    unlock: 2200,
    weight: 5,
    items: [{ type: 'branch' }, { type: 'branch', dx: 0.3 }],
  },
  {
    id: 'ridge-thorn',
    unlock: 2200,
    weight: 6,
    items: [{ type: 'ridge' }, { type: 'thornbrush', dx: 0.68 }],
  },

  // --- Deep night ----------------------------------------------------------
  // The scorpion is rare on purpose. It should register as an event.
  { id: 'scorpion', unlock: 3600, weight: 2, items: [{ type: 'scorpion' }] },
  {
    id: 'stone-thorn-branch',
    unlock: 3600,
    weight: 5,
    items: [
      { type: 'stone' },
      { type: 'thornbrush', dx: 0.25 },
      { type: 'branch', dx: 0.5 },
    ],
  },
  {
    id: 'ridge-stone',
    unlock: 3600,
    weight: 5,
    items: [{ type: 'ridge' }, { type: 'stone', dx: 0.72 }],
  },
  {
    id: 'branch-ridge',
    unlock: 6000,
    weight: 5,
    items: [{ type: 'branch' }, { type: 'ridge', dx: 0.28 }],
  },
  {
    id: 'stone-triple',
    unlock: 6000,
    weight: 5,
    items: [
      { type: 'stone' },
      { type: 'stone', dx: 0.22 },
      { type: 'stone', dx: 0.44 },
    ],
  },

  // --- Elite: the arc is nearly fully spent on a single cluster -------------
  { id: 'longridge', unlock: 9000, weight: 6, items: [{ type: 'longridge' }] },
  {
    id: 'ridge-branch',
    unlock: 8000,
    weight: 5,
    items: [{ type: 'ridge' }, { type: 'branch', dx: 0.7 }],
  },
];

/**
 * A pattern's weight at a given score, ramped in at unlock and faded out after
 * retire. Linear on both edges — nothing here needs a curve.
 */
export function weightAtScore(p, score) {
  if (score < p.unlock) return 0;

  let w = p.weight;
  const inAge = score - p.unlock;
  if (inAge < RAMP_IN) w *= inAge / RAMP_IN;

  if (p.retire != null && score > p.retire) {
    const outAge = score - p.retire;
    const t = Math.min(1, outAge / RAMP_OUT);
    w *= 1 - (1 - RESIDUAL) * t;
  }
  return w;
}

/** Patterns available at a given score, with their current weights applied. */
export function eligiblePatterns(score) {
  const out = [];
  for (const p of PATTERNS) {
    const weight = weightAtScore(p, score);
    if (weight > 0) out.push({ ...p, weight });
  }
  return out.length ? out : [{ ...PATTERNS[0], weight: 1 }];
}
