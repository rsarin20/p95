/* ══ PANGO — the character ════════════════════════════════
   Not a sprite sheet. The pangolin is a spine — a single arc
   whose total turn angle is driven by one number, `curl`.

        curl 0.0  →  0.75 rad   a gentle running arch
        curl 1.0  →  7.60 rad   past a full turn: the tail
                                wraps over the head, the inner
                                edges overlap, and the hole in
                                the middle closes into a ball

   Proportions are the animal's, not a generic critter's: the
   tail is nearly half the total length and stays thick, the
   body is widest at the hips, the head is a small cone carried
   low. Everything hangs off the spine — thickness rides a
   profile curve, the sawtooth back is added to the top edge
   only, plate seams are knocked out of the ink so paper shows
   through, and the legs solve two-bone IK to targets that
   collapse to nothing as the body closes.

   The fluoro plate carries the charge: as SIGNAL fills, the
   scales light up in the second ink, slightly off-register.
   ════════════════════════════════════════════════════════ */

import { lerp, clamp } from './render.js';

const SEG   = 56;     // spine samples
const LEN   = 84;     // nose-to-tail-tip along the spine
const MAXW  = 13;     // half-thickness at the hips
const TEETH = 12;     // scale rows
const T0 = .10, TSPAN = .86;          // the scaled stretch of the body
const CURL_SCALE = .56;

/* half-thickness, tail tip (0) → nose (1). Note how slowly it
   thins at the tail end — that's the pangolin read. */
const WPROF = [0.13,0.28,0.42,0.54,0.65,0.76,0.88,1.00,1.00,0.90,0.68,0.40,0.19];

/* How the spine's total turn is distributed. Nearly all of it
   lands over the hips and shoulders, so the back humps while the
   tail stays a straight, low-slung wedge. At full curl this
   flattens to uniform and the same spine closes into a circle. */
const TURNW = [0.10,0.12,0.18,0.30,0.55,1.05,1.85,2.20,1.90,0.95,0.40,0.20];

function widthAt(t){
  const f = clamp(t,0,1) * (WPROF.length - 1);
  const i = Math.min(WPROF.length - 2, f | 0);
  return MAXW * lerp(WPROF[i], WPROF[i+1], f - i);
}
function turnAt(t, curl){
  const f = clamp(t,0,1) * (TURNW.length - 1);
  const i = Math.min(TURNW.length - 2, f | 0);
  return lerp(lerp(TURNW[i], TURNW[i+1], f - i), 1, curl);
}
/* sawtooth on the top edge — one tooth per scale row, trailing edge sharp */
function toothAt(t){
  if (t < T0 || t > T0 + TSPAN) return 0;
  const u = (t - T0) / TSPAN * TEETH;
  return 1.5 * (1 - (u % 1));
}
const rowT = k => T0 + (k / TEETH) * TSPAN;

/* ── build the body in local space (feet on y = 0, facing +x) ── */
function build(p){
  const curl = p.curl;
  const theta = lerp(.75, 7.6, curl);
  const sc    = lerp(1, CURL_SCALE, curl);
  const ds    = LEN / SEG;

  let wsum = 0;
  const turn = new Array(SEG);
  for (let i = 0; i < SEG; i++){ turn[i] = turnAt((i + .5)/SEG, curl); wsum += turn[i]; }

  let phi = lerp(-.30, -theta/2, curl), x = 0, y = 0;
  const pts = new Array(SEG + 1);
  for (let i = 0; i <= SEG; i++){
    pts[i] = { x, y, phi };
    x += Math.cos(phi) * ds;
    y += Math.sin(phi) * ds;
    if (i < SEG) phi += theta * turn[i] / wsum;
  }

  // roll about the body's own centroid, but only once curled
  let cx = 0, cy = 0;
  for (const q of pts){ cx += q.x; cy += q.y; }
  cx /= pts.length; cy /= pts.length;
  const roll = p.roll * curl * curl;
  if (roll){
    const c = Math.cos(roll), s = Math.sin(roll);
    for (const q of pts){
      const dx = q.x - cx, dy = q.y - cy;
      q.x = cx + dx*c - dy*s;
      q.y = cy + dx*s + dy*c;
      q.phi += roll;
    }
  }

  // scale, then seat: a standing body rides above its legs,
  // a ball rests on the floor.
  let maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let i = 0; i <= SEG; i++){
    const q = pts[i];
    q.x *= sc; q.y *= sc;
    const w = (widthAt(i/SEG) + 3) * sc;
    if (q.y + w > maxY) maxY = q.y + w;
    if (q.x - w < minX) minX = q.x - w;
    if (q.x + w > maxX) maxX = q.x + w;
  }
  const dy = lerp(-13, -.5, curl) - maxY;
  const dx = lerp(14, 0, curl) - (minX + maxX) / 2;
  for (const q of pts){ q.x += dx; q.y += dy; }

  return { pts, sc, curl };
}

const nrm = q => [Math.sin(q.phi), -Math.cos(q.phi)];
const tan = q => [Math.cos(q.phi), Math.sin(q.phi)];

function outline(ctx, B){
  const { pts, sc } = B;
  ctx.beginPath();
  // armoured top edge, tail tip → head
  for (let i = 0; i <= SEG; i++){
    const q = pts[i], t = i/SEG;
    const w = (widthAt(t) + toothAt(t)) * sc;
    const [nx, ny] = nrm(q);
    i ? ctx.lineTo(q.x + nx*w, q.y + ny*w) : ctx.moveTo(q.x + nx*w, q.y + ny*w);
  }
  // snout: short cone off the head tangent, blunt tip
  const h = pts[SEG];
  const [tx, ty] = tan(h), [nx, ny] = nrm(h);
  const hw = widthAt(1) * sc;
  ctx.quadraticCurveTo(h.x + tx*5*sc + nx*2.4*sc, h.y + ty*5*sc + ny*2.4*sc,
                       h.x + tx*8*sc + nx*.4*sc,  h.y + ty*8*sc + ny*.4*sc);
  ctx.quadraticCurveTo(h.x + tx*7.4*sc - nx*2.2*sc, h.y + ty*7.4*sc - ny*2.2*sc,
                       h.x - nx*hw,                 h.y - ny*hw);
  // soft belly, head → tail
  for (let i = SEG; i >= 0; i--){
    const q = pts[i], t = i/SEG;
    const w = widthAt(t) * .90 * sc;
    const [bx, by] = nrm(q);
    ctx.lineTo(q.x - bx*w, q.y - by*w);
  }
  ctx.closePath();
}

/* Plate seams: one short cut per scale row, hanging off the tooth's
   trailing edge and angled back. Deliberately shallow — the read at
   speed comes from the serrated silhouette, and anything longer
   turns the body into a ribcage. */
function seams(ctx, B, wide){
  const { pts, sc } = B;
  ctx.lineWidth = wide;
  ctx.beginPath();
  for (let k = 1; k <= TEETH; k++){
    const t = rowT(k);
    if (t > .95) break;
    const q = pts[Math.round(t * SEG)];
    const w = widthAt(t) * sc;
    const [nx, ny] = nrm(q), [tx, ty] = tan(q);
    ctx.moveTo(q.x + nx*(w + .9*sc), q.y + ny*(w + .9*sc));
    ctx.quadraticCurveTo(
      q.x + nx*w*.88 - tx*1.5*sc, q.y + ny*w*.88 - ty*1.5*sc,
      q.x + nx*w*.58 - tx*3.4*sc, q.y + ny*w*.58 - ty*3.4*sc);
  }
  ctx.stroke();
}

/* two-bone IK; `flip` picks which way the joint folds */
function limb(ctx, hx, hy, fx, fy, l1, l2, flip, w, claw){
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy) || .001;
  const max = (l1 + l2) * .99;
  if (d > max){ dx *= max/d; dy *= max/d; fx = hx+dx; fy = hy+dy; d = max; }
  const a  = (d*d + l1*l1 - l2*l2) / (2*d);
  const hh = Math.sqrt(Math.max(0, l1*l1 - a*a)) * flip;
  const ux = dx/d, uy = dy/d;
  const kx = hx + ux*a - uy*hh, ky = hy + uy*a + ux*hh;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(hx,hy); ctx.lineTo(kx,ky); ctx.lineTo(fx,fy);
  ctx.stroke();
  ctx.lineWidth = w * .8;
  ctx.beginPath();
  ctx.moveTo(fx - 1.6, fy); ctx.lineTo(fx + (claw ? 4.6 : 3), fy);
  ctx.stroke();
}

const HIPS = [ .575, .845 ];   // rear, front — as t along the spine

function legPose(B, p, L, near){
  const { pts, sc, curl } = B;
  const t = HIPS[L];
  const q = pts[Math.round(t * SEG)];
  const w = widthAt(t) * sc;
  const [nx, ny] = nrm(q);
  const hx = q.x - nx*w*.5, hy = q.y - ny*w*.5;

  const shrink = Math.pow(1 - curl, 1.3);
  const ph = p.phase + (L ? Math.PI : 0) + (near ? 0 : Math.PI);
  const stride = 10 * shrink;
  let fx = hx + Math.cos(ph) * stride + (L ? 2 : -3) * shrink;
  let fy = -Math.max(0, Math.sin(ph)) * 7 * shrink;

  if (p.air > 0){
    const ax = hx + (L ? 9 : -10) * shrink;
    const ay = -(L ? 8 : 13) * shrink - clamp(p.vy, -400, 400) * .006;
    fx = lerp(fx, ax, p.air); fy = lerp(fy, ay, p.air);
  }
  if (p.dead){ fx = hx + (L ? 12 : -13); fy = -15 - (L ? 3 : 0); }

  fx = lerp(hx, fx, shrink);
  fy = lerp(hy, fy, shrink);
  // canvas y grows downward, so the foot sits at a *larger* y than the hip
  const span = Math.abs(fy - hy);
  return { hx, hy, fx, fy, l1: span*.56 + 1.2, l2: span*.56 + .9,
           flip: L ? -1 : 1, shrink, ph, sc };
}

function legs(ctx, B, p, near, carve, onStrike){
  if (Math.pow(1 - B.curl, 1.3) < .05) return;
  for (let L = 0; L < 2; L++){
    const k = legPose(B, p, L, near);
    const w = (near ? 5.2 : 4.2) * k.sc;
    // carve a paper gap first so a near leg reads against the body
    if (carve){
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      limb(ctx, k.hx, k.hy, k.fx, k.fy, k.l1, k.l2, k.flip, w + 1.2, L === 1);
      ctx.restore();
    }
    limb(ctx, k.hx, k.hy, k.fx, k.fy, k.l1, k.l2, k.flip, w, L === 1);
    if (onStrike && near && p.air <= 0 && !p.dead){
      const s = Math.sin(k.ph);
      if (s < 0 && s > -.32) onStrike(k.fx, k.fy);
    }
  }
}

/* ── public draw ─────────────────────────────────────────
   p = { x, y, curl, phase, vy, air, roll, signal, dead, tilt } */
export function drawPango(ctx, k, p, opts = {}){
  const B = build(p);
  const { sc, pts } = B;
  const h = pts[SEG];
  const [tx, ty] = tan(h), [nx, ny] = nrm(h);
  const ex = h.x - tx*3.2*sc + nx*3.6*sc;
  const ey = h.y - ty*3.2*sc + ny*3.6*sc;

  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.tilt) ctx.rotate(p.tilt);

  if (k === 0){
    /* ── dark plate: structure ── */
    ctx.globalAlpha = .42;
    legs(ctx, B, p, false, false, null);          // far pair, behind the body
    ctx.globalAlpha = 1;

    outline(ctx, B);
    ctx.fill();

    legs(ctx, B, p, true, true, opts.onStrike);   // near pair, carved out

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    seams(ctx, B, 1.7 * sc);
    ctx.beginPath(); ctx.arc(ex, ey, 2.7*sc, 0, 7); ctx.fill();          // eye
    ctx.beginPath(); ctx.arc(ex - 7.5*sc, ey - 2.6*sc, 1.15*sc, 0, 7); ctx.fill(); // ear
    ctx.restore();

    if (p.dead){
      ctx.lineWidth = 1.6*sc;
      ctx.beginPath();
      ctx.moveTo(ex-2.2*sc, ey-2.2*sc); ctx.lineTo(ex+2.2*sc, ey+2.2*sc);
      ctx.moveTo(ex+2.2*sc, ey-2.2*sc); ctx.lineTo(ex-2.2*sc, ey+2.2*sc);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex + .5*sc, ey + .3*sc, 1.25*sc, 0, 7); ctx.fill();
    }
  } else {
    /* ── fluoro plate: the charge ── */
    const s = clamp(p.signal, 0, 1);
    ctx.save();
    ctx.translate(-1.9 - s*1.4, 1.3 + s*.9);
    ctx.globalAlpha = .12 + s * .5;
    outline(ctx, B);
    ctx.fill();
    ctx.restore();

    if (s > .04){
      ctx.globalAlpha = Math.min(1, s * 1.2);
      seams(ctx, B, 2.1 * sc);
    }
    ctx.globalAlpha = .85;
    ctx.beginPath(); ctx.arc(ex + .5*sc, ey + .3*sc, 1.1*sc, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* Rolling radius — drives the roll rate and the ball's hitbox. */
export const ballRadius = () => (LEN / 7.6 + MAXW) * CURL_SCALE;
