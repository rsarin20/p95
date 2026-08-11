import { rgb } from './utils.js';

// Every actor is cut from the same sheet of paper: one flat silhouette fill,
// optionally a second lighter "cut layer" offset a pixel or two for depth.

/** roundRect landed in all evergreen browsers in 2023; keep a cheap fallback. */
function rr(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, style) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
}

// ── The capybara ──────────────────────────────────────────────────────

/** Head height in body-local units; the head top sits at `8 - HEAD_H`. */
export const HEAD_H = 29;

/**
 * Stoic capybara, facing downstream. Drawn from the body's bottom-left corner
 * so the caller only tracks one anchor point.
 */
export function drawCapybara(ctx, capy, palette) {
  const { x, y, w, h, tilt, legPhase, airborne, blink } = capy;
  const ink = rgb(palette.silhouette);

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);

  // Legs — tucked in the air, paddling at the surface. Mostly under water.
  ctx.fillStyle = ink;
  for (let i = 0; i < 3; i++) {
    const swing = airborne ? 0 : Math.sin(legPhase + i * 1.9) * 2.6;
    fillRR(ctx, w * (0.16 + i * 0.25) + swing, h - 6, 9, airborne ? 7 : 12, 4, ink);
  }

  // Body — a loaf. Rump hump first, then the barrel over it, so the two read
  // as one cut shape with a rising back.
  fillRR(ctx, w * 0.06, 0, w * 0.7, h * 0.55, h * 0.26, ink);
  fillRR(ctx, 0, h * 0.1, w, h * 0.9, h * 0.36, ink);

  // Head — blunt brick with the snout pushed out front, overlapping the
  // shoulders so there is no seam to give the cutout away.
  const hx = w * 0.55;
  const hy = -HEAD_H + 8;
  const hw = w * 0.55;
  fillRR(ctx, hx, hy, hw, HEAD_H, 9, ink);

  // Blunt muzzle, stepped out past the brow — the capybara's whole profile.
  fillRR(ctx, hx + hw - 14, hy + HEAD_H * 0.34, 18, HEAD_H * 0.66, 6, ink);

  // Ears — small, round, set well back. The only thing on this animal that
  // ever looks alert, and even they don't.
  for (const ex of [hx + w * 0.07, hx + w * 0.21]) {
    ctx.beginPath();
    ctx.arc(ex, hy + 1.5, 4.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // The one point of light: a flat, expressionless eye set high and far back.
  if (!blink) {
    const eye = rgb(palette.foam, 0.9);
    fillRR(ctx, hx + w * 0.22, hy + HEAD_H * 0.28, 5, 4.2, 2, eye);
  }

  ctx.restore();
}

// The yuzu keeps its own colour in every lighting phase. It is the one thing
// on screen that must never blend into the sky — it's how you read the physics.
const YUZU_SKIN = [246, 201, 60];
const YUZU_SHADE = [206, 148, 32];

/** The yuzu — a citrus with a stubby leaf, tracked independently of the head. */
export function drawYuzu(ctx, x, y, r, palette, spin = 0, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  if (squash) ctx.scale(1 + squash * 0.4, 1 - squash * 0.4);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rgb(YUZU_SKIN);
  ctx.fill();

  // Shadowed underside keeps it from reading as a flat dot.
  ctx.beginPath();
  ctx.arc(0, r * 0.2, r * 0.9, 0.2, Math.PI - 0.2);
  ctx.fillStyle = rgb(YUZU_SHADE, 0.75);
  ctx.fill();

  // Leaf
  ctx.beginPath();
  ctx.ellipse(r * 0.4, -r * 0.92, r * 0.52, r * 0.2, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = rgb(palette.silhouette, 0.9);
  ctx.fill();

  ctx.restore();
}

// ── Obstacles ─────────────────────────────────────────────────────────

export function drawDriftwood(ctx, o, palette) {
  const ink = rgb(palette.silhouette);
  fillRR(ctx, o.x, o.y, o.w, o.h, o.h / 2, ink);

  // A branch stub and two knots — enough to read as wood, not a pill.
  ctx.beginPath();
  ctx.moveTo(o.x + o.w * 0.62, o.y + 2);
  ctx.lineTo(o.x + o.w * 0.78, o.y - o.h * 0.75);
  ctx.lineTo(o.x + o.w * 0.86, o.y - o.h * 0.72);
  ctx.lineTo(o.x + o.w * 0.7, o.y + 3);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();

  ctx.fillStyle = rgb(palette.waterDeep, 0.5);
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * (0.28 + i * 0.3), o.y + o.h * 0.45, o.h * 0.2, o.h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGator(ctx, o, palette) {
  const ink = rgb(palette.silhouette);
  const { x, y, w, h } = o;

  // Low, long back with a tapering tail
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.08, y + h * 0.45);
  ctx.lineTo(x + w * 0.62, y + h * 0.3);
  ctx.quadraticCurveTo(x + w * 0.82, y + h * 0.28, x + w * 0.86, y + h * 0.52);
  ctx.lineTo(x + w, y + h * 0.62);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();

  // Snout tip, laid flat on the surface
  fillRR(ctx, x + w * 0.84, y + h * 0.5, w * 0.18, h * 0.5, 3, ink);

  // Eye ridge — the part you clear on a near miss
  fillRR(ctx, x + w * 0.66, y, w * 0.09, h * 0.4, 3, ink);
  ctx.fillStyle = rgb(palette.shimmer, 0.9);
  ctx.beginPath();
  ctx.arc(x + w * 0.705, y + h * 0.12, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Dorsal scutes — the ridged back you skim on a near miss
  ctx.fillStyle = ink;
  for (let i = 0; i < 5; i++) {
    const sx = x + w * (0.12 + i * 0.105);
    const peak = 1 - Math.abs(i - 1.6) * 0.16;
    ctx.beginPath();
    ctx.moveTo(sx, y + h * 0.42);
    ctx.lineTo(sx + w * 0.04, y + h * (0.3 - 0.28 * peak));
    ctx.lineTo(sx + w * 0.08, y + h * 0.42);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawDuck(ctx, o, palette) {
  const ink = rgb(palette.silhouette);
  const { x, y, w, h } = o;

  fillRR(ctx, x, y + h * 0.42, w, h * 0.58, h * 0.3, ink); // body
  fillRR(ctx, x + w * 0.5, y, w * 0.42, h * 0.55, h * 0.24, ink); // head

  ctx.beginPath(); // bill
  ctx.moveTo(x + w * 0.9, y + h * 0.2);
  ctx.lineTo(x + w * 1.16, y + h * 0.3);
  ctx.lineTo(x + w * 0.9, y + h * 0.42);
  ctx.closePath();
  ctx.fillStyle = rgb(palette.sunGlow);
  ctx.fill();

  ctx.fillStyle = rgb(palette.shimmer, 0.9);
  ctx.beginPath();
  ctx.arc(x + w * 0.78, y + h * 0.24, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/** Rogue duck — airborne, wings out. The one obstacle you dive under. */
export function drawRogueDuck(ctx, o, palette, t) {
  drawDuck(ctx, o, palette);
  const flap = Math.sin(t * 18) * 0.55;
  const ink = rgb(palette.silhouette);

  ctx.save();
  ctx.translate(o.x + o.w * 0.42, o.y + o.h * 0.52);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.ellipse(-o.w * 0.1, 0, o.w * 0.52, o.h * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}

export function drawKayak(ctx, o, palette) {
  const ink = rgb(palette.silhouette);
  const { x, y, w, h } = o;
  const hullY = y + h * 0.55;

  ctx.beginPath(); // hull, both ends lifted
  ctx.moveTo(x, hullY + h * 0.16);
  ctx.quadraticCurveTo(x + w * 0.5, hullY + h * 0.62, x + w, hullY + h * 0.1);
  ctx.quadraticCurveTo(x + w * 0.5, hullY - h * 0.14, x, hullY + h * 0.16);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();

  // Paddler: torso, head, and a paddle mid-stroke
  fillRR(ctx, x + w * 0.4, y + h * 0.14, w * 0.16, h * 0.42, 4, ink);
  ctx.beginPath();
  ctx.arc(x + w * 0.48, y + h * 0.1, h * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x + w * 0.48, y + h * 0.28);
  ctx.rotate(-0.5);
  fillRR(ctx, -w * 0.34, -2, w * 0.68, 4, 2, ink);
  ctx.restore();
}

// ── Scenery ───────────────────────────────────────────────────────────

/** One continuous ridge line; `seed` keeps each parallax layer distinct. */
export function drawRidge(ctx, { y, height, width, offset, step, seed, color, jitter = 1 }) {
  ctx.beginPath();
  ctx.moveTo(-step, y + height);

  for (let x = -step; x <= width + step; x += step) {
    const world = x + offset;
    const n =
      Math.sin(world * 0.0042 + seed) * 0.5 +
      Math.sin(world * 0.011 + seed * 2.3) * 0.28 +
      Math.sin(world * 0.026 + seed * 4.1) * 0.14;
    ctx.lineTo(x, y - n * height * jitter);
  }

  ctx.lineTo(width + step, y + height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Conifer bank: simple triangle cutouts marching along a baseline. */
export function drawTreeline(ctx, { y, width, offset, spacing, color, scale }) {
  ctx.fillStyle = color;
  const first = Math.floor(offset / spacing);
  const count = Math.ceil(width / spacing) + 2;

  for (let i = 0; i < count; i++) {
    const index = first + i;
    const x = index * spacing - offset;
    // Deterministic per-tree variation so trees don't shimmer between frames.
    const variance = (Math.sin(index * 12.9898) * 43758.5453) % 1;
    const h = (26 + Math.abs(variance) * 30) * scale;
    const w = h * 0.46;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w / 2, y - h);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Reeds on the near bank, bending with the flow. */
export function drawReeds(ctx, { y, width, offset, spacing, color, sway, scale }) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const first = Math.floor(offset / spacing);
  const count = Math.ceil(width / spacing) + 2;

  for (let i = 0; i < count; i++) {
    const index = first + i;
    const x = index * spacing - offset;
    const variance = Math.abs((Math.sin(index * 78.233) * 43758.5453) % 1);
    const h = (18 + variance * 26) * scale;
    const bend = Math.sin(sway + index) * 5 * scale;

    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bend * 0.5, y - h * 0.6, x + bend, y - h);
    ctx.stroke();
  }
}
