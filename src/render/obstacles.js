// Obstacle silhouettes.
//
// Each one is drawn from its own visual seed, so no two thornbrushes are quite
// the same shape while every thornbrush is still instantly readable as a
// thornbrush. Readability is the constraint that matters: at 660 units/second
// the player has a fraction of a second to recognise what is coming, so the
// silhouettes are distinguished by profile — round, angular, thin, long, low —
// rather than by detail they will never have time to see.
//
// Drawn in local space: origin at the obstacle's left edge on the horizon
// line, +x right, +y up.

import { makeRng } from '../core/rng.js';
import { rgba } from './palette.js';

const BODY = '#04050b';

export function drawObstacle(ctx, o, accent, glow) {
  const rng = makeRng(o.vs);
  // Obstacles are lit harder than anything else in the scene, deliberately.
  // Everything else here is atmosphere and is allowed to sink into the dark;
  // these are the only objects that can end a run, so they are the one thing
  // that must never be ambiguous against the dunes behind them.
  const rim = rgba(accent, 0.62 * glow + 0.38);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = BODY;
  ctx.strokeStyle = rim;

  switch (o.type) {
    case 'thornbrush':
      drawThornbrush(ctx, o, rng, rim);
      break;
    case 'stone':
      drawStone(ctx, o, rng, rim);
      break;
    case 'branch':
      drawBranch(ctx, o, rng, rim);
      break;
    case 'ridge':
    case 'longridge':
      drawRidge(ctx, o, rng, rim, accent, glow);
      break;
    case 'scorpion':
      drawScorpion(ctx, o, rng, rim);
      break;
    default:
      break;
  }
}

// --- thornbrush -------------------------------------------------------------
// A low tangle. Spiky enough to look like it would hurt.

function drawThornbrush(ctx, o, rng, rim) {
  const w = o.w;
  const h = o.h;

  // Low mass at the base.
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(w * 0.18, h * 0.5, w * 0.5, h * 0.42);
  ctx.quadraticCurveTo(w * 0.84, h * 0.52, w, 0);
  ctx.closePath();
  ctx.fill();

  // Spikes fan outward from a narrow base. The splay is what separates a bush
  // from a picket fence: leaning each spike by a fraction of the bush's *width*
  // rather than a fixed amount makes the outer ones rake out at roughly forty
  // degrees, so the shape reads as a tangle even at two pixels tall.
  const spikes = 8 + Math.floor(rng() * 4);
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 1.5;
  const tips = [];
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1);
    const bx = w * (0.3 + 0.4 * t) + (rng() - 0.5) * 2.5;
    const lean = (t - 0.5) * w * 1.05 + (rng() - 0.5) * w * 0.16;
    const len = h * (0.5 + rng() * 0.55);
    const tx = bx + lean;
    const ty = Math.min(h, len + h * 0.2);
    // Bowed rather than straight, and bowed away from the middle.
    const cx = bx + lean * 0.25;
    const cy = ty * 0.62;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    tips.push([bx, cx, cy, tx, ty]);
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.7;
  for (const [bx, cx, cy, tx, ty] of tips) {
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
  }
}

// --- stone ------------------------------------------------------------------
// Angular, planted, unmistakably solid.

function drawStone(ctx, o, rng, rim) {
  const w = o.w;
  const h = o.h;
  const pts = [[0, 0]];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = w * (0.06 + 0.88 * t);
    const bulge = Math.sin(t * Math.PI);
    const y = h * (0.35 + 0.65 * bulge) * (0.78 + rng() * 0.34);
    pts.push([x, Math.min(y, h)]);
  }
  pts.push([w, 0]);

  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();

  // Rim only along the lit upper edge — never all the way round the base.
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// --- dead branch ------------------------------------------------------------
// Tall and thin. It reads as further away than it is, which is the point.

function drawBranch(ctx, o, rng, rim) {
  const w = o.w;
  const h = o.h;
  const lean = (rng() - 0.5) * 4;
  const midX = w * 0.5;

  const strokes = [
    { pts: [[midX, 0], [midX + lean * 0.4, h * 0.55], [midX + lean, h]], lw: 1.7 },
    {
      pts: [
        [midX + lean * 0.35, h * 0.48],
        [midX + lean - 4.5 - rng() * 2, h * 0.72],
        [midX + lean - 6 - rng() * 2, h * 0.86],
      ],
      lw: 1.1,
    },
    {
      pts: [
        [midX + lean * 0.6, h * 0.66],
        [midX + lean + 4 + rng() * 2, h * 0.8],
        [midX + lean + 5.5 + rng() * 2, h * 0.95],
      ],
      lw: 1,
    },
  ];

  for (const pass of [BODY, rim]) {
    ctx.strokeStyle = pass;
    for (const s of strokes) {
      ctx.lineWidth = pass === BODY ? s.lw : Math.max(0.6, s.lw * 0.45);
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      ctx.quadraticCurveTo(s.pts[1][0], s.pts[1][1], s.pts[2][0], s.pts[2][1]);
      ctx.stroke();
    }
  }
}

// --- sand ridge -------------------------------------------------------------
// Long, low, and the only obstacle wide enough to spend most of a jump.
// Given a moonlit crest so the player can read its full length at a glance —
// this is the one shape that must be legible before it arrives.

function drawRidge(ctx, o, rng, rim, accent, glow) {
  const w = o.w;
  const h = o.h;
  const wobble = 0.6 + rng() * 0.5;

  const path = new Path2D();
  path.moveTo(0, 0);
  const steps = 26;
  const crest = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = w * t;
    const base = Math.sin(t * Math.PI);
    const y =
      h * (base * 0.94 + 0.06) * (1 + 0.12 * Math.sin(t * 7.3 * wobble + wobble * 5));
    crest.push([x, y]);
    path.lineTo(x, y);
  }
  path.lineTo(w, 0);
  path.closePath();

  ctx.fillStyle = BODY;
  ctx.fill(path);

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, rgba(accent, 0.08 * glow));
  grad.addColorStop(0.5, rgba(accent, 0.7 * glow + 0.36));
  grad.addColorStop(1, rgba(accent, 0.08 * glow));
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(crest[0][0], crest[0][1]);
  for (let i = 1; i < crest.length; i++) ctx.lineTo(crest[i][0], crest[i][1]);
  ctx.stroke();
  void rim;
}

// --- scorpion ---------------------------------------------------------------
// Rare. It does not attack, it does not move, it is simply in the way. The
// restraint is what makes it land.

function drawScorpion(ctx, o, rng, rim) {
  const w = o.w;
  const h = o.h;
  const bodyY = h * 0.28;
  const cx = w * 0.46;

  ctx.fillStyle = BODY;
  ctx.strokeStyle = BODY;
  ctx.lineCap = 'round';

  // legs
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) {
    const lx = cx - 5 + i * 3.4;
    const spread = 2.6 + rng() * 1.6;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(lx, bodyY);
      ctx.quadraticCurveTo(lx + dir * spread, bodyY * 0.55, lx + dir * (spread + 1.4), 0);
      ctx.stroke();
    }
  }

  // body
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, 6.2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // pincers, forward
  ctx.lineWidth = 1.1;
  for (const dy of [-1.1, 1.1]) {
    ctx.beginPath();
    ctx.moveTo(cx + 5, bodyY + dy * 0.4);
    ctx.quadraticCurveTo(cx + 10, bodyY + dy * 1.6, cx + 13.5, bodyY + dy * 0.6);
    ctx.stroke();
  }

  // tail, curled over the back — the whole reason it is recognisable
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, bodyY + 0.6);
  ctx.bezierCurveTo(cx - 12, bodyY + 3, cx - 12.5, h * 0.95, cx - 6, h * 0.98);
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.65;
  ctx.stroke();

  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(cx - 5.2, h * 0.97, 1.5, 1.2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.55;
  ctx.stroke();

  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, 6.2, 2.5, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}
