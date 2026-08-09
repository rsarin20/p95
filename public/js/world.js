/* ══ WORLD — the Deadzone ═════════════════════════════════
   The mistake worth not making here is putting the horizon and
   the play line in the same place: everything crushes into a
   strip and the frame goes empty above it. So there are three
   ground planes, receding:

     horizon   dunes, and the pole line the wires hang from
     middle    landmarks — dead masts, fallen dishes, NO SERVICE
     play      the hard printed rule the pangolin actually runs on

   All of it prints from the same two plates as everything else.
   ════════════════════════════════════════════════════════ */

import { R, halftoneFor, hatchFor, lerp, rand, clamp } from './render.js';

const dune = (x, a) =>
  Math.sin(x * .0042 + a) * 22 +
  Math.sin(x * .0111 + a * 1.7) * 11 +
  Math.sin(x * .0231 + a * .6) * 5;

export class World {
  constructor(){ this.reset(); }
  reset(){
    this.far = 0; this.mid = 0; this.near = 0; this.t = 0;
    this.decor = []; this.nextDecor = 380;
    this.markers = [];
  }

  update(dt, speed, zoneIdx){
    this.t += dt;
    this.far  += speed * dt * .05;
    this.mid  += speed * dt * .22;
    this.near += speed * dt;

    this.nextDecor -= speed * dt * .42;
    if (this.nextDecor <= 0){
      this.nextDecor = rand(300, 620);
      const pool = zoneIdx >= 3 ? ['dish','sign','tower','tower','mast'] : ['dish','sign','tower','mast'];
      this.decor.push({ kind: pool[(Math.random()*pool.length)|0], x: R.worldW + 140, s: rand(.85,1.2) });
    }
    for (let i = this.decor.length - 1; i >= 0; i--){
      this.decor[i].x -= speed * dt * .42;
      if (this.decor[i].x < -300) this.decor.splice(i,1);
    }
    for (let i = this.markers.length - 1; i >= 0; i--){
      this.markers[i].x -= speed * dt;
      if (this.markers[i].x < -60) this.markers.splice(i,1);
    }
  }

  addMarker(label){ this.markers.push({ x: R.worldW + 60, label }); }

  /* ── draw ─────────────────────────────────────────────── */
  draw(ctx, k, S){
    const gy = S.groundY, H = S.worldH, W = R.worldW;
    const hz  = S.horizonY;                       // far plane
    const mid = hz + (gy - hz) * .46;             // middle plane

    if (k === 1){
      // ── zone set large and faint in the sky: the poster's masthead,
      //    and the thing that keeps a tall portrait frame from reading empty
      if (S.zone){
        ctx.save();
        ctx.globalAlpha = S.dark ? .11 : .085;
        const fs = Math.min(R.viewH * .12, W * .085);
        ctx.font = `700 ${fs.toFixed(1)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.letterSpacing = (fs * .22).toFixed(1) + 'px';
        ctx.fillText(S.zone, W * .5 + fs * .11, R.viewTop + R.viewH * .13);
        ctx.restore();
      }

      // ── the sun that stopped transmitting ──
      const cy = hz - R.viewH * .30;
      const cx = ((W * .78 - this.far * .3) % (W * 2.4) + W * 2.4) % (W * 2.4) - W * .55;
      const rr = R.viewH * .14;
      ctx.save();
      ctx.globalAlpha = S.dark ? .95 : .85;
      ctx.fillStyle = halftoneFor(ctx, R.inkB, 1);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
      ctx.fillStyle = R.inkB;
      ctx.globalAlpha = S.dark ? .5 : .32;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke();
      ctx.globalAlpha = .26; ctx.lineWidth = 1.2;
      for (let i = 1; i <= 3; i++){
        const r2 = rr + i * rr * .42 + (this.t * 8 % (rr * .42));
        ctx.beginPath(); ctx.arc(cx, cy, r2, -.85, .85); ctx.stroke();
      }
      // dead air: interference drifting up through an empty sky
      ctx.save();
      const skyTop = Math.max(2, hz - R.viewH * 1.15);
      for (let i = 0; i < 7; i++){
        const u = ((i / 7) + this.t * .014) % 1;
        const y = hz - 24 - u * (hz - skyTop);
        const bw = 70 + ((i * 53) % 5) * 55;
        const bx = ((i * 233 - this.far * .18) % (W + 460) + W + 460) % (W + 460) - 230;
        ctx.globalAlpha = Math.sin(u * Math.PI) * (S.dark ? .20 : .13);
        ctx.fillRect(bx, y, bw, 1.4 + (i % 3));
        ctx.fillRect(bx + bw + 14, y, bw * .3, 1.4 + (i % 3));
      }
      ctx.restore();

      // ── dunes, sitting on the horizon ──
      ctx.save();
      // Crests that dip to the horizon between peaks — otherwise the
      // fill never thins and you get a stripe instead of dunes.
      ctx.globalAlpha = .38;
      ctx.fillStyle = halftoneFor(ctx, R.inkB, 1);
      this.ridge(ctx, this.far, hz - 24, hz + 3, 1.75);
      ctx.globalAlpha = .5; ctx.lineWidth = 1.7;
      this.ridge(ctx, this.far, hz - 24, hz + 3, 1.75, true);
      ctx.globalAlpha = .2;
      ctx.fillStyle = R.inkB;
      this.ridge(ctx, this.far * 2.1 + 430, hz - 8, hz + 3, .95);
      ctx.globalAlpha = .4; ctx.lineWidth = 1.4;
      this.ridge(ctx, this.far * 2.1 + 430, hz - 8, hz + 3, .95, true);
      ctx.restore();
    }

    if (k === 0){
      /* ── far plane: the pole line ── */
      ctx.save();
      ctx.globalAlpha = .30;
      ctx.translate(0, hz); ctx.scale(.62, .62); ctx.translate(0, -hz / .62);
      this.poles(ctx, hz / .62);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = .26;
      ctx.fillRect(-20, hz, W + 40, 1.1);          // the horizon itself
      ctx.restore();

      /* The desert floor is paper, not fill. Depth comes from rows of
         scattered marks that get larger, darker and faster as they
         come toward you — the plane is implied, never painted. */
      ctx.save();
      const span = gy - hz;
      for (let r = 1; r <= 8; r++){
        const v = Math.pow(r / 8, 1.7);
        const y = hz + span * v;
        const sz = .8 + v * 5.2, sp = .10 + v * .78;
        ctx.globalAlpha = .07 + v * .30;
        const off = (this.near * sp) % 190;
        for (let i = -1; i < Math.ceil(W / 190) + 2; i++){
          for (const [dx, , wq] of FLOOR){
            const x = i * 190 - off + dx;
            if (x < -14 || x > W + 14) continue;
            ctx.fillRect(x, y, sz * (.5 + wq * .12), Math.max(.7, sz * .30));
          }
        }
      }
      ctx.restore();

      /* ── middle plane: landmarks ── */
      ctx.save();
      ctx.globalAlpha = .58;
      for (const d of this.decor) this.landmark(ctx, d, mid);
      ctx.restore();

      /* ── play plane: one heavy rule, a short hatched shoulder, grit ──
         Hatch, not dots — the dot screen is spoken for by the sun and
         the dunes, and two screens at once turns to moiré. */
      const depth = Math.max(16, H - gy);
      const band = Math.min(depth, Math.max(46, depth * .55));
      ctx.globalAlpha = 1;
      ctx.fillRect(-20, gy, W + 40, 2.8);
      ctx.save();
      ctx.fillStyle = hatchFor(ctx, R.inkA);
      for (let i = 0; i < 4; i++){
        ctx.globalAlpha = .30 * Math.pow(1 - i / 4, 1.8);
        ctx.fillRect(-20, gy + 3 + band * i / 4, W + 40, band / 4 + 1);
      }
      ctx.restore();

      // grit spilling below the line, scrub clumps standing on it
      ctx.save();
      const o = this.near % 240, reps = Math.ceil(W / 240) + 2;
      for (let layer = 0; layer < 2; layer++){
        ctx.globalAlpha = layer ? .22 : .4;
        const lo = (this.near * (layer ? .55 : 1)) % 240;
        for (let i = -1; i < reps; i++){
          const b = i * 240 - lo + layer * 97;
          for (const [dx, dy, w] of GRIT){
            const x = b + dx;
            if (x < -10 || x > W + 20) continue;
            ctx.fillRect(x, gy + 5 + (dy + layer * 11) * (depth / 30), w, 1.5);
          }
        }
      }
      ctx.globalAlpha = .65; ctx.lineWidth = 1.4;
      for (let i = -1; i < reps; i++){
        const b = i * 240 - o;
        for (const [dx, hgt] of TUFT){
          const x = b + dx;
          if (x < -10 || x > W + 20) continue;
          ctx.beginPath();
          for (const a of [-.5, -.05, .42]){
            ctx.moveTo(x, gy);
            ctx.lineTo(x + Math.sin(a) * hgt, gy - Math.cos(a) * hgt);
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      // ── printed distance markers ──
      if (this.markers.length){
        ctx.save();
        ctx.globalAlpha = .45;
        ctx.font = '700 9px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        for (const m of this.markers){
          ctx.fillRect(m.x, gy - 16, 1.4, 16);
          ctx.fillText(m.label, m.x, gy - 21);
        }
        ctx.restore();
      }
    }
  }

  ridge(ctx, off, top, base, amp, crestOnly){
    const W = R.worldW;
    ctx.beginPath();
    if (!crestOnly) ctx.moveTo(-20, base);
    for (let x = -20; x <= W + 40; x += 12){
      const y = Math.min(base, top + dune(x + off, 0) * amp);
      (crestOnly && x === -20) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    if (crestOnly){ ctx.stroke(); return; }
    ctx.lineTo(W + 40, base);
    ctx.closePath();
    ctx.fill();
  }

  poles(ctx, gy){
    const gap = 250, o = this.mid % gap;
    const reps = Math.ceil(R.worldW / .62 / gap) + 2;
    ctx.lineWidth = 2.6;
    for (let i = -1; i < reps; i++){
      const x = i * gap - o;
      const idx = Math.round((this.mid + x) / gap);
      const h = 96 + ((idx * 37) % 5) * 9;
      const broken = ((idx * 7919) % 5) === 0;
      const top = gy - h;
      ctx.beginPath();
      ctx.moveTo(x, gy); ctx.lineTo(x, top);
      ctx.moveTo(x - 16, top + 13); ctx.lineTo(x + 16, top + 13);
      ctx.moveTo(x - 11, top + 26); ctx.lineTo(x + 11, top + 26);
      ctx.stroke();
      ctx.fillRect(x - 17.5, top + 10, 3.5, 3.5);
      ctx.fillRect(x + 14, top + 10, 3.5, 3.5);

      const nx = x + gap;
      const nh = 96 + (((idx + 1) * 37) % 5) * 9;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      if (broken){
        ctx.moveTo(x + 16, top + 13);
        ctx.quadraticCurveTo(x + 54, top + 48, x + 46, top + 88);
      } else {
        ctx.moveTo(x + 16, top + 13);
        ctx.quadraticCurveTo((x + nx) / 2, gy - Math.min(nh, h) + 52, nx - 16, gy - nh + 13);
      }
      ctx.stroke();
      ctx.lineWidth = 2.6;
    }
  }

  landmark(ctx, d, base){
    ctx.save();
    ctx.translate(d.x, base);
    ctx.scale(d.s * .86, d.s * .86);
    ctx.lineWidth = 2.4;
    switch (d.kind){
      case 'dish': {                       // a satellite dish, face in the dirt
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(2, -50); ctx.stroke();
        ctx.save(); ctx.translate(2, -50); ctx.rotate(-.5);
        ctx.beginPath(); ctx.arc(0, 0, 32, Math.PI * .15, Math.PI * 1.15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(21, -15); ctx.stroke();
        ctx.beginPath(); ctx.arc(23, -17, 4.2, 0, 7); ctx.fill();
        ctx.restore();
        break;
      }
      case 'sign': {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -44); ctx.stroke();
        ctx.strokeRect(-34, -76, 68, 33);
        ctx.font = '700 10px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO', 0, -62);
        ctx.fillText('SERVICE', 0, -50);
        break;
      }
      case 'mast': {                       // guyed mast, still standing, still dead
        ctx.beginPath();
        ctx.moveTo(-5, 0); ctx.lineTo(-5, -104);
        ctx.moveTo(5, 0);  ctx.lineTo(5, -104);
        for (let y = -8; y > -104; y -= 15){
          ctx.moveTo(-5, y); ctx.lineTo(5, y - 8);
          ctx.moveTo(5, y);  ctx.lineTo(-5, y - 8);
        }
        ctx.moveTo(0, -104); ctx.lineTo(38, 0);
        ctx.moveTo(0, -104); ctx.lineTo(-38, 0);
        ctx.stroke();
        ctx.fillRect(-2.5, -114, 5, 10);
        break;
      }
      default: {                           // lattice tower, snapped at the neck
        ctx.beginPath();
        ctx.moveTo(-18, 0); ctx.lineTo(-7, -70);
        ctx.moveTo(18, 0);  ctx.lineTo(7, -70);
        for (let i = 0; i < 5; i++){
          const y0 = -i * 14, y1 = -(i + 1) * 14;
          const w0 = 18 - i * 2.2, w1 = 18 - (i + 1) * 2.2;
          ctx.moveTo(-w0, y0); ctx.lineTo(w1, y1);
          ctx.moveTo(w0, y0);  ctx.lineTo(-w1, y1);
          ctx.moveTo(-w1, y1); ctx.lineTo(w1, y1);
        }
        ctx.stroke();
        ctx.save(); ctx.translate(0, -70); ctx.rotate(.6);
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(-4.5, -26); ctx.lineTo(4.5, -26); ctx.lineTo(7, 0);
        ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }
}

/* deterministic scatter so the floor doesn't shimmer */
const GRIT = [], TUFT = [], FLOOR = [];
(function seed(){
  let s = 20260809;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 22; i++) GRIT.push([rnd() * 240, 1 + rnd() * 20, 2 + rnd() * 7]);
  for (let i = 0; i < 3; i++)  TUFT.push([rnd() * 240, 5 + rnd() * 7]);
  for (let i = 0; i < 9; i++)  FLOOR.push([rnd() * 190, 0, rnd() * 6]);
})();
