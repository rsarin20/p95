// The desert at night.
//
// The central visual trick: there is no ground plane. The horizon *is* the
// running surface — a single thin luminous line — and everything below it is
// very nearly black. Dunes pass behind it, the moon crosses above it, and the
// jerboa runs along it. That is the whole set.
//
// The other rule is that nothing is ever completely still. Stars drift, dunes
// creep, the moon moves, dust crosses. The quiet is what makes the running
// feel fast.

import { makeRng } from '../core/rng.js';
import { rgba } from './palette.js';

const STAR_COUNT = 170;
const DUST_COUNT = 16;
const STREAK_COUNT = 90;
const STREAK_WRAP = 2000;

export class Scene {
  constructor(seed = 0x5eed) {
    const rng = makeRng(seed);

    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const depth = 0.25 + rng() * 0.75;
      this.stars.push({
        u: rng(),
        // Biased toward the upper sky so the horizon stays clean.
        v: rng() * rng(),
        r: 0.35 + rng() * rng() * 1.5,
        depth,
        phase: rng() * Math.PI * 2,
        rate: 0.4 + rng() * 1.6,
      });
    }

    // Three dune layers, each a small sum of sines. Cheap, endless, and it
    // never repeats visibly because the periods do not divide each other.
    this.dunes = [];
    for (let layer = 0; layer < 3; layer++) {
      // Four octaves, each roughly triple the frequency of the last. The long
      // one does the real work — it decides which dunes are big and which are
      // barely there — while the short ones only break up the edge. Without a
      // dominant long period every crest comes out the same height and the
      // horizon reads as a row of identical bumps.
      const waves = [
        { freq: 0.0020 + rng() * 0.0016, amp: 0.85 },
        { freq: 0.0075 + rng() * 0.0055, amp: 0.42 },
        { freq: 0.0185 + rng() * 0.0115, amp: 0.23 },
        { freq: 0.0420 + rng() * 0.0220, amp: 0.11 },
      ];
      let total = 0;
      for (const wv of waves) {
        wv.freq *= 1 + layer * 0.35;
        wv.phase = rng() * Math.PI * 2;
        total += wv.amp;
      }
      this.dunes.push({ waves, total });
    }

    this.streaks = [];
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streaks.push({
        x: rng() * STREAK_WRAP,
        depth: rng(),
        len: 10 + rng() * 34,
        a: 0.04 + rng() * 0.1,
      });
    }

    this.dust = [];
    for (let i = 0; i < DUST_COUNT; i++) this.dust.push(this.newDust(rng, true));
    this.rng = rng;

    this.t = 0;
    this.starDrift = 0;
  }

  newDust(rng, anywhere) {
    return {
      u: anywhere ? rng() : 1 + rng() * 0.3,
      v: rng(),
      speed: 0.25 + rng() * 0.9,
      r: 0.3 + rng() * 0.7,
      a: 0.05 + rng() * 0.14,
      wob: rng() * Math.PI * 2,
    };
  }

  /**
   * @param {number} dt      seconds since last frame (real time, not sim time)
   * @param {number} moved   world units travelled this frame
   */
  update(dt, moved) {
    this.t += dt;
    // Stars are effectively at infinity, so they creep rather than scroll.
    this.starDrift += moved * 0.012;

    for (const d of this.dust) {
      d.u -= (moved * d.speed) / 5200 + dt * 0.012 * d.speed;
      d.wob += dt * 0.7;
      if (d.u < -0.1) Object.assign(d, this.newDust(this.rng, false));
    }
  }

  // -------------------------------------------------------------------------

  drawSky(ctx, L, pal) {
    const g = ctx.createLinearGradient(0, 0, 0, L.groundY);
    g.addColorStop(0, pal.top);
    g.addColorStop(0.62, pal.mid);
    g.addColorStop(1, pal.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.w, L.groundY);
  }

  drawStars(ctx, L, pal) {
    if (pal.starAlpha <= 0.01) return;
    const skyH = L.groundY;
    ctx.fillStyle = pal.star;
    for (const s of this.stars) {
      let u = (s.u + this.starDrift * s.depth * 0.0006) % 1;
      if (u < 0) u += 1;
      const x = u * L.w;
      const y = 12 + s.v * (skyH - 40);
      const tw = 0.62 + 0.38 * Math.sin(this.t * s.rate + s.phase);
      ctx.globalAlpha = pal.starAlpha * tw * (0.35 + s.depth * 0.65);
      ctx.beginPath();
      ctx.arc(x, y, s.r * L.starScale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMoon(ctx, L, pal, moon) {
    if (!moon.visible) return;

    const x = moon.x * L.w;
    // alt 0 sits the moon on the horizon; alt 1 lifts it near the top.
    const y = L.groundY - moon.alt * (L.groundY - 46) - 8;
    const r = moon.size * L.scale;

    // Halo first — a soft bloom, not a lens flare.
    const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 6.5);
    halo.addColorStop(0, rgba(pal.accent, 0.16));
    halo.addColorStop(0.35, rgba(pal.accent, 0.055));
    halo.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 6.5, 0, Math.PI * 2);
    ctx.fill();

    const disc = ctx.createLinearGradient(x, y - r, x, y + r);
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(1, pal.accent);
    ctx.fillStyle = disc;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    return { x, y, r };
  }

  duneHeight(layer, x) {
    const { waves, total } = this.dunes[layer];
    let sum = 0;
    for (const wv of waves) sum += wv.amp * Math.sin(x * wv.freq + wv.phase);
    // Keep it positive and mostly low, with occasional real peaks.
    return 0.16 + 0.84 * (0.5 + (0.5 * sum) / total);
  }

  drawDunes(ctx, L, pal, dist, moonScreenX) {
    const PARALLAX = [0.05, 0.11, 0.22];
    const AMP = [16, 27, 41];

    for (let layer = 0; layer < 3; layer++) {
      const off = dist * PARALLAX[layer];
      const amp = AMP[layer] * L.scale;
      const step = 7;

      ctx.beginPath();
      ctx.moveTo(-step, L.groundY);
      const crest = [];
      for (let px = -step; px <= L.w + step; px += step) {
        const wx = off + px / L.scale;
        const y = L.groundY - this.duneHeight(layer, wx) * amp;
        crest.push([px, y]);
        ctx.lineTo(px, y);
      }
      ctx.lineTo(L.w + step, L.groundY);
      ctx.closePath();
      ctx.fillStyle = pal.dune[layer];
      ctx.fill();

      // Moonlight catches the crests, and only near the moon.
      if (moonScreenX != null) {
        ctx.beginPath();
        ctx.moveTo(crest[0][0], crest[0][1]);
        for (let i = 1; i < crest.length; i++) ctx.lineTo(crest[i][0], crest[i][1]);
        const falloff = ctx.createLinearGradient(
          moonScreenX - L.w * 0.55,
          0,
          moonScreenX + L.w * 0.55,
          0,
        );
        const strength = (0.2 - layer * 0.05) * pal.glow;
        falloff.addColorStop(0, rgba(pal.accent, 0));
        falloff.addColorStop(0.5, rgba(pal.accent, strength));
        falloff.addColorStop(1, rgba(pal.accent, 0));
        ctx.strokeStyle = falloff;
        ctx.lineWidth = Math.max(0.6, L.scale * 0.35);
        ctx.stroke();
      }
    }
  }

  drawGround(ctx, L, pal) {
    const g = ctx.createLinearGradient(0, L.groundY, 0, L.h);
    g.addColorStop(0, pal.ground);
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.groundY, L.w, L.h - L.groundY);
  }

  /**
   * The horizon: a thin bright line with a short bloom above and a shorter one
   * below. This single element carries most of the game's identity, so it is
   * the one place the drawing is allowed to be indulgent.
   */
  drawHorizon(ctx, L, pal) {
    const y = L.groundY;
    const up = 22 * L.scale;
    const down = 13 * L.scale;

    const above = ctx.createLinearGradient(0, y - up, 0, y);
    above.addColorStop(0, rgba(pal.accent, 0));
    above.addColorStop(1, rgba(pal.accent, 0.16 * pal.glow));
    ctx.fillStyle = above;
    ctx.fillRect(0, y - up, L.w, up);

    const below = ctx.createLinearGradient(0, y, 0, y + down);
    below.addColorStop(0, rgba(pal.accent, 0.2 * pal.glow));
    below.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = below;
    ctx.fillRect(0, y, L.w, down);

    ctx.strokeStyle = rgba(pal.accent, 0.42 + 0.45 * pal.glow);
    ctx.lineWidth = Math.max(1, Math.min(2.4, L.scale * 0.75));
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(L.w, y + 0.5);
    ctx.stroke();
  }

  /** Faint streaks just below the line, to sell the speed without clutter. */
  drawStreaks(ctx, L, pal, dist) {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = Math.max(0.6, L.scale * 0.3);
    const band = 26 * L.scale;
    for (const s of this.streaks) {
      let x = s.x - dist * (0.55 + s.depth * 0.45);
      x = ((x % STREAK_WRAP) + STREAK_WRAP) % STREAK_WRAP;
      const px = x * L.scale - (STREAK_WRAP * L.scale - L.w) * 0;
      if (px > L.w + 60 || px < -60) continue;
      const y = L.groundY + 3 * L.scale + s.depth * band;
      const fade = 1 - s.depth;
      ctx.globalAlpha = s.a * fade * pal.glow;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + s.len * L.scale * (0.5 + s.depth), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawDust(ctx, L, pal) {
    ctx.fillStyle = pal.accent;
    for (const d of this.dust) {
      const x = d.u * L.w;
      if (x < -20 || x > L.w + 20) continue;
      const y =
        L.groundY - (6 + d.v * 54) * L.scale + Math.sin(d.wob) * 2.4 * L.scale;
      ctx.globalAlpha = d.a * pal.glow;
      ctx.beginPath();
      ctx.arc(x, y, d.r * L.starScale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
