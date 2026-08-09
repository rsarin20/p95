/* ══ OBSTACLES ════════════════════════════════════════════
   One rule the player must be able to read at 900 units/sec:

     SOLID INK  = hard. It will kill you, curled or not.
     HOLLOW     = brittle. Curl into it and it explodes.

   Nothing else in the world is drawn hollow, so the language
   stays unambiguous for the whole run.
   ════════════════════════════════════════════════════════ */

import { R, rrect, rand, lerp } from './render.js';

/* w/h/top are relative to the ground line. `brittle` = smashable while rolling. */
export const KINDS = {
  tower_s:  { w:22, h:44,  brittle:false, lead:1.00 },
  tower_m:  { w:26, h:62,  brittle:false, lead:1.10 },
  tower_l:  { w:30, h:86,  brittle:false, lead:1.30 },
  cluster:  { w:56, h:52,  brittle:false, lead:1.35 },
  routers:  { w:36, h:46,  brittle:true,  lead:1.00 },
  routers_t:{ w:36, h:70,  brittle:true,  lead:1.15 },
  drone_mid:{ w:52, h:26,  brittle:false, lead:1.15, top:96 },
  drone_low:{ w:50, h:26,  brittle:false, lead:1.25, top:60 },
  swooper:  { w:48, h:24,  brittle:false, lead:1.55, top:110 },
};

/* what unlocks when — difficulty is authored, not random */
const POOLS = [
  ['tower_s','tower_s','tower_m','cluster'],
  ['tower_s','tower_m','tower_m','cluster','routers','tower_l'],
  ['tower_s','tower_m','cluster','routers','routers_t','tower_l','drone_mid'],
  ['tower_m','cluster','routers','routers_t','tower_l','drone_mid','drone_low'],
  ['tower_m','cluster','routers_t','tower_l','drone_mid','drone_low','swooper'],
  ['tower_m','tower_l','cluster','routers_t','drone_mid','drone_low','swooper','swooper'],
];

let uid = 0;

export function makeObstacle(kind, x, groundY){
  const K = KINDS[kind];
  const o = {
    id: ++uid, kind, x, w: K.w, h: K.h,
    brittle: K.brittle, seed: Math.random() * 100,
    minGap: 999, scored: false, dead: false,
  };
  o.y = groundY - (K.top !== undefined ? K.top : K.h);
  if (kind === 'swooper'){ o.base = groundY; o.ph = rand(0, 7); }
  if (kind === 'cluster'){ o.parts = [0, rand(17,21), rand(34,38)].map(dx => ({ dx, h: rand(34,54) })); o.h = 54; o.y = groundY - 54; }
  if (kind === 'routers')   o.boxes = 2;
  if (kind === 'routers_t') o.boxes = 3;
  return o;
}

export function updateObstacle(o, dt, t){
  if (o.kind === 'swooper'){
    o.y = o.base - 76 - Math.sin(t * 2.1 + o.ph) * 40;
  }
}

/* ── the director ─────────────────────────────────────────
   Picks the next obstacle and, crucially, how much room to
   leave. Gap is measured in *time* at the current speed so the
   game stays fair as it accelerates — a jump always fits.     */
export function nextKind(zoneIdx, prev){
  const pool = POOLS[Math.min(zoneIdx, POOLS.length - 1)];
  for (let tries = 0; tries < 6; tries++){
    const k = pool[(Math.random() * pool.length) | 0];
    // never ask for "don't jump" immediately after "must jump"
    if (prev && prev.startsWith('tower') && k === 'drone_mid') continue;
    if (prev === k && Math.random() < .55) continue;
    return k;
  }
  return 'tower_s';
}

/* Gaps are measured in seconds, not pixels, so the game stays fair as
   it accelerates. The floor is the important number: a jump is airborne
   for ~0.68s, and you cannot react to something you're still falling
   toward, so no gap may ever be shorter than one full arc plus a
   reaction window. Get this wrong and the game is unplayable at speed
   in a way that reads as "unfair" rather than "hard". */
export const AIR_TIME = .72;
export const REACT    = .34;

export function gapFor(kind, speed, pressure){
  const lead = KINDS[kind].lead;
  const floor = (AIR_TIME + REACT) * lead;
  const secs = Math.max(floor, lerp(1.75, 1.16, pressure) * lead * rand(.92, 1.4));
  return speed * secs;
}

/* ── signal packets ──────────────────────────────────────
   Formations are placed along the *actual* jump parabola, so a
   greedy line is always physically collectible — the risk is
   what's underneath it, never the geometry.                   */
export function formation(x, groundY, speed, phys){
  const out = [];
  const roll = Math.random();
  if (roll < .42){
    // along a jump arc
    const T = (2 * -phys.jumpV) / phys.g;
    for (let i = 1; i <= 5; i++){
      const u = i / 6, tt = u * T;
      const y = groundY - 26 - (-phys.jumpV * tt - .5 * phys.g * tt * tt);
      out.push({ x: x + u * T * speed, y, r: 8, got: false });
    }
  } else if (roll < .78){
    const h = [60, 96, 128][(Math.random()*3)|0];
    for (let i = 0; i < 4; i++) out.push({ x: x + i * 42, y: groundY - h, r: 8, got: false });
  } else {
    // a crown — sits right on top of trouble
    for (let i = 0; i < 3; i++)
      out.push({ x: x + i * 34, y: groundY - 104 + Math.abs(i - 1) * 16, r: 8, got: false });
  }
  return out;
}

/* ── drawing ─────────────────────────────────────────────── */
export function drawObstacle(ctx, k, o, groundY, t){
  const x = o.x, y = o.y;
  switch (o.kind){
    case 'tower_s': case 'tower_m': case 'tower_l':
      pylon(ctx, k, x, groundY, o.w, o.h, o.seed); break;
    case 'cluster':
      for (const p of o.parts) pylon(ctx, k, x + p.dx, groundY, 19, p.h, o.seed + p.dx); break;
    case 'routers': case 'routers_t':
      stack(ctx, k, x, groundY, o.w, o.boxes, t, o.seed); break;
    case 'drone_mid': case 'drone_low': case 'swooper':
      drone(ctx, k, x, y, o.w, o.h, t, o.seed, o.kind === 'swooper'); break;
  }
}

/* SOLID — a snapped antenna stump */
function pylonPath(ctx, x, gy, w, h){
  const top = gy - h;
  ctx.beginPath();
  ctx.moveTo(x, gy);
  ctx.lineTo(x + w * .18, top + 4);
  ctx.lineTo(x + w * .5,  top - 3);
  ctx.lineTo(x + w * .82, top + 5);
  ctx.lineTo(x + w, gy);
  ctx.closePath();
}
function pylon(ctx, k, x, gy, w, h, seed){
  if (k === 1){
    // the fluoro plate lands a hair off-register — same shape, not a box
    ctx.globalAlpha = .45;
    pylonPath(ctx, x - 3, gy, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const top = gy - h;
  pylonPath(ctx, x, gy, w, h);
  ctx.fill();

  // knock the lattice out of the ink
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0, yy = gy - 8; yy > top + 6; i++, yy -= 13){
    const sw = w * .30 * (1 - (gy - yy) / (h * 2.4));
    ctx.moveTo(x + w/2 - sw, yy);      ctx.lineTo(x + w/2 + sw, yy - 9);
    ctx.moveTo(x + w/2 + sw, yy);      ctx.lineTo(x + w/2 - sw, yy - 9);
  }
  ctx.stroke();
  ctx.restore();

  // sheared cap
  ctx.fillRect(x + w*.30, top - 7, w*.40, 4);
}

/* HOLLOW — a stack of dead routers. Curl and go through it. */
function stack(ctx, k, x, gy, w, n, t, seed){
  const bh = 22, wob = Math.sin(t * 3 + seed) * 1.1;
  for (let i = 0; i < n; i++){
    const yy = gy - (i + 1) * bh - i * 1.5;
    const off = wob * (i / n) * (i % 2 ? 1 : -1);
    if (k === 0){
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 4]);
      rrect(ctx, x + off, yy, w, bh, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      // crack lines — it wants to break
      ctx.globalAlpha = .5; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + off + w*.3, yy + 3); ctx.lineTo(x + off + w*.44, yy + bh - 4);
      ctx.moveTo(x + off + w*.7, yy + 4); ctx.lineTo(x + off + w*.58, yy + bh - 3);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.globalAlpha = .32;
      rrect(ctx, x + off, yy, w, bh, 3); ctx.fill();
      ctx.globalAlpha = 1;
      // status LEDs, all dead but one
      for (let d = 0; d < 3; d++){
        const on = ((seed | 0) + i + d) % 4 === 0;
        ctx.globalAlpha = on ? (.4 + .6 * (Math.sin(t*6 + d) > 0 ? 1 : .2)) : .22;
        ctx.beginPath(); ctx.arc(x + off + 8 + d*8, yy + bh - 6, 2.1, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // stubby dead aerial
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x + off + w - 6, yy); ctx.lineTo(x + off + w - 3, yy - 8); ctx.stroke();
    }
  }
}

/* SOLID — a survey drone that stopped surveying */
function drone(ctx, k, x, y, w, h, t, seed, swoop){
  const bob = Math.sin(t * 5 + seed) * 1.6;
  const cy = y + h/2 + bob;
  if (k === 0){
    rrect(ctx, x + 8, y + bob, w - 16, h, 7);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 12, cy - 2); ctx.lineTo(x + 2, cy - 9);
    ctx.moveTo(x + w - 12, cy - 2); ctx.lineTo(x + w - 2, cy - 9);
    ctx.stroke();
    // rotor blur
    const s = Math.sin(t * 30 + seed) * 7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2 - 7, cy - 10); ctx.lineTo(x + 2 + 7, cy - 10);
    ctx.moveTo(x + w - 2 - 7, cy - 10); ctx.lineTo(x + w - 2 + 7, cy - 10);
    ctx.stroke();
    ctx.globalAlpha = .35;
    ctx.beginPath();
    ctx.moveTo(x + 2 - s, cy - 10.5); ctx.lineTo(x + 2 + s, cy - 10.5);
    ctx.moveTo(x + w - 2 - s, cy - 10.5); ctx.lineTo(x + w - 2 + s, cy - 10.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // knockout eye slit
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    rrect(ctx, x + 14, cy - 3, w - 28, 5, 2.5); ctx.fill();
    ctx.restore();
  } else {
    ctx.globalAlpha = .8;
    rrect(ctx, x + 15, cy - 3, w - 30, 5, 2.5); ctx.fill();
    // downward scan cone
    ctx.globalAlpha = swoop ? .30 : .18;
    ctx.beginPath();
    ctx.moveTo(x + w/2 - 5, cy + h/2);
    ctx.lineTo(x + w/2 + 5, cy + h/2);
    ctx.lineTo(x + w/2 + 22, cy + 66);
    ctx.lineTo(x + w/2 - 22, cy + 66);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* a floating bar of signal */
export function drawPacket(ctx, k, p, t){
  const bob = Math.sin(t * 3.4 + p.x * .02) * 3;
  if (k === 1){
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.globalAlpha = .9;
    // three ascending bars — reception, floating in a dead zone
    for (let i = 0; i < 3; i++){
      const bh = 4 + i * 3.4;
      ctx.fillRect(-6.5 + i * 4.6, -bh/2 + 2, 3.2, bh);
    }
    ctx.globalAlpha = .35 + Math.sin(t * 5 + p.x * .03) * .18;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
    ctx.save();
    ctx.globalAlpha = .22;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 7, 0, 7); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
