import { CFG, PHASES, PHASE_SCORE } from './config.js';
import { mixPalette, rgb } from './utils.js';
import { drawReeds, drawRidge, drawTreeline } from './shapes.js';

const STAR_FIELD_W = 1600;
const STAR_COUNT = 90;

/**
 * Paints the river. Everything is flat fills over a single sky gradient — the
 * only depth cue is layering and parallax, which is what sells the cut-paper
 * look. The renderer owns the canvas transform (device pixels → world units)
 * and the camera shake; nothing else needs to think in pixels.
 */
export class Renderer {
  #dpr = 1;
  #vignetteCache = null;
  #skyGradient = null;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = { w: CFG.MIN_W, h: CFG.BASE_H, waterY: CFG.BASE_H * CFG.WATER_RATIO, scale: 1 };
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * STAR_FIELD_W,
      y: Math.random() * 0.62,
      r: 0.6 + Math.random() * 1.3,
      twinkle: Math.random() * Math.PI * 2
    }));
  }

  /**
   * Fit the world to the element. Height is the fixed axis at desktop sizes; on
   * narrow screens width takes over so the playfield never gets too cramped to
   * read an incoming obstacle.
   */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    let scale = cssH / CFG.BASE_H;
    if (cssW / scale < CFG.MIN_W) scale = cssW / CFG.MIN_W;

    this.view.scale = scale;
    this.view.w = cssW / scale;
    this.view.h = cssH / scale;
    this.view.waterY = Math.round(this.view.h * CFG.WATER_RATIO);

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.#dpr = dpr;

    return this.view;
  }

  /** Blend the four lighting phases into one palette for the current score. */
  static paletteFor(score) {
    const position = (score / PHASE_SCORE) % PHASES.length;
    const index = Math.floor(position);
    return mixPalette(PHASES[index], PHASES[(index + 1) % PHASES.length], position - index);
  }

  /** Where the sun (or moon) sits, as a 0→1 trip through the day. */
  static celestial(score, view) {
    const dayT = ((score / PHASE_SCORE) % PHASES.length) / PHASES.length;
    const isNight = dayT >= 0.5;
    const legT = isNight ? (dayT - 0.5) * 2 : dayT * 2;
    const altitude = Math.sin(legT * Math.PI);
    return {
      x: view.w * (0.14 + 0.72 * legT),
      y: view.waterY - altitude * view.waterY * 0.66,
      r: isNight ? 20 : 27,
      altitude,
      isNight
    };
  }

  render(scene) {
    const { ctx, view } = this;
    const { palette, scroll, worldTime, shake, player, spawner, particles, score, flash } = scene;

    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(view.scale * this.#dpr, 0, 0, view.scale * this.#dpr, 0, 0);

    this.#sky(palette, view);
    this.#celestial(palette, view, score);
    this.#stars(palette, view, worldTime);

    // Camera shake shifts only the world, never the sky — it reads as impact
    // rather than the whole screen coming loose.
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.rotate(shake.rot);

    this.#banks(palette, view, scroll, worldTime);
    this.#waterBase(palette, view);

    spawner.draw(ctx, palette, worldTime, view);
    player.draw(ctx, palette);

    this.#waterOverlay(palette, view);
    this.#surface(palette, view, scroll, worldTime, score);
    particles.draw(ctx, palette);

    ctx.restore();

    if (flash > 0.001) {
      ctx.fillStyle = rgb(palette.sun, flash * 0.5);
      ctx.fillRect(0, 0, view.w, view.h);
    }

    this.#vignette(view);
  }

  // ── Layers ──────────────────────────────────────────────────────────

  #sky(palette, view) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, view.waterY);
    grad.addColorStop(0, rgb(palette.skyTop));
    grad.addColorStop(0.58, rgb(palette.skyMid));
    grad.addColorStop(1, rgb(palette.skyLow));
    // Kept so the moon's crescent can be cut with real sky rather than a hole.
    this.#skyGradient = grad;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.waterY + 1);
  }

  #celestial(palette, view, score) {
    const body = Renderer.celestial(score, view);
    if (body.altitude < -0.02) return;
    const { ctx } = this;

    const glow = ctx.createRadialGradient(body.x, body.y, body.r * 0.5, body.x, body.y, body.r * 7);
    glow.addColorStop(0, rgb(palette.sunGlow, 0.5));
    glow.addColorStop(1, rgb(palette.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r * 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgb(palette.sun);
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, Math.PI * 2);
    ctx.fill();

    if (body.isNight) {
      // Bite a crescent out of the moon by painting sky back over it — erasing
      // instead would punch through to the canvas and read as an eclipse.
      ctx.fillStyle = this.#skyGradient;
      ctx.beginPath();
      ctx.arc(body.x + body.r * 0.44, body.y - body.r * 0.32, body.r * 0.94, 0, Math.PI * 2);
      ctx.fill();
    }

    this.celestialX = body.x;
    this.celestialAlt = body.altitude;
  }

  #stars(palette, view, worldTime) {
    if (palette.starAlpha < 0.02) return;
    const { ctx } = this;
    ctx.fillStyle = rgb(palette.foam);

    for (const star of this.stars) {
      const x = ((star.x - worldTime * 3) % STAR_FIELD_W + STAR_FIELD_W) % STAR_FIELD_W;
      if (x > view.w) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(worldTime * 1.8 + star.twinkle);
      ctx.globalAlpha = palette.starAlpha * twinkle * (1 - star.y * 0.5);
      ctx.beginPath();
      ctx.arc(x, star.y * view.waterY, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #banks(palette, view, scroll, worldTime) {
    const { ctx } = this;
    const horizon = view.waterY;

    drawRidge(ctx, {
      y: horizon - 12,
      height: 78,
      width: view.w,
      offset: scroll * 0.08,
      step: 26,
      seed: 1.7,
      color: rgb(palette.far),
      jitter: 0.8
    });

    drawRidge(ctx, {
      y: horizon - 4,
      height: 54,
      width: view.w,
      offset: scroll * 0.17,
      step: 20,
      seed: 4.4,
      color: rgb(palette.mid)
    });

    drawTreeline(ctx, {
      y: horizon + 2,
      width: view.w,
      offset: scroll * 0.3,
      spacing: 52,
      color: rgb(palette.near),
      scale: 0.8
    });

    drawReeds(ctx, {
      y: horizon + 3,
      width: view.w,
      offset: scroll * 0.52,
      spacing: 58,
      color: rgb(palette.silhouette, 0.85),
      sway: worldTime * 1.5,
      scale: 1
    });

    // Atmospheric haze over the far bank. Obstacles are drawn after this, so
    // the background settles back and near-black actors stay legible against
    // a treeline painted in the same darkness.
    const haze = ctx.createLinearGradient(0, horizon - 96, 0, horizon);
    haze.addColorStop(0, rgb(palette.skyLow, 0));
    haze.addColorStop(1, rgb(palette.skyLow, 0.5));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 96, view.w, 97);
  }

  #waterBase(palette, view) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, view.waterY, 0, view.h);
    grad.addColorStop(0, rgb(palette.water));
    grad.addColorStop(1, rgb(palette.waterDeep));
    ctx.fillStyle = grad;
    ctx.fillRect(0, view.waterY, view.w, view.h - view.waterY);
  }

  /**
   * A translucent sheet of water drawn *over* the actors, so anything below the
   * line — a submerged capybara, the underside of a log — sinks into the river
   * instead of floating on top of it.
   */
  #waterOverlay(palette, view) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, view.waterY, 0, view.h);
    grad.addColorStop(0, rgb(palette.water, 0.72));
    grad.addColorStop(0.5, rgb(palette.waterDeep, 0.88));
    grad.addColorStop(1, rgb(palette.waterDeep, 0.96));
    ctx.fillStyle = grad;
    ctx.fillRect(0, view.waterY, view.w, view.h - view.waterY);
  }

  #surface(palette, view, scroll, worldTime, score) {
    const { ctx } = this;

    // The waterline itself
    ctx.fillStyle = rgb(palette.foam, 0.22);
    ctx.fillRect(0, view.waterY - 1, view.w, 1.6);

    // Reflection path under the sun/moon: broken dashes rather than a solid
    // column, which would read as a UI rectangle laid over the river.
    if (this.celestialAlt > 0) {
      const depth = view.h - view.waterY;
      for (let i = 0; i < 16; i++) {
        const t = (i + 0.5) / 16;
        const y = view.waterY + t * depth;
        // Wider and more broken up the closer it gets to the camera.
        const width = 26 + t * 74 + Math.sin(worldTime * 2.2 + i * 1.7) * (8 + t * 20);
        const drift = Math.sin(worldTime * 1.4 + i * 0.9) * (4 + t * 14);
        ctx.fillStyle = rgb(palette.shimmer, 0.26 * this.celestialAlt * (1 - t * 0.75));
        ctx.fillRect(this.celestialX - width / 2 + drift, y, width, 1.4 + t * 1.6);
      }
    }

    // Flow lines: short dashes drifting left, thinning with depth.
    const rows = 7;
    for (let row = 0; row < rows; row++) {
      const depth = (row + 1) / (rows + 1);
      const y = view.waterY + depth * (view.h - view.waterY);
      const speedMul = 0.45 + depth * 1.15;
      const spacing = 120 + row * 26;
      const offset = (scroll * speedMul) % spacing;
      const length = 22 + depth * 46;

      ctx.strokeStyle = rgb(palette.shimmer, 0.1 + depth * 0.14);
      ctx.lineWidth = 1 + depth * 1.4;
      ctx.lineCap = 'round';

      for (let x = -spacing; x < view.w + spacing; x += spacing) {
        const px = x - offset + Math.sin((x + scroll) * 0.01 + worldTime) * 8;
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px + length, y);
        ctx.stroke();
      }
    }
  }

  #vignette(view) {
    const { ctx } = this;
    if (!this.#vignetteCache || this.#vignetteCache.w !== view.w || this.#vignetteCache.h !== view.h) {
      const grad = ctx.createRadialGradient(
        view.w * 0.5, view.h * 0.48, Math.min(view.w, view.h) * 0.35,
        view.w * 0.5, view.h * 0.5, Math.max(view.w, view.h) * 0.78
      );
      grad.addColorStop(0, 'rgb(0 0 0 / 0)');
      grad.addColorStop(1, 'rgb(0 0 0 / 0.42)');
      this.#vignetteCache = { w: view.w, h: view.h, grad };
    }
    ctx.fillStyle = this.#vignetteCache.grad;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

/** Shake state shared by the game loop and the renderer. */
export function decayShake(shake, dt) {
  const decay = Math.exp(-CFG.SHAKE_DECAY * dt);
  shake.power *= decay;
  const p = shake.power;
  shake.x = (Math.random() - 0.5) * p * 44;
  shake.y = (Math.random() - 0.5) * p * 30;
  shake.rot = (Math.random() - 0.5) * p * 0.05;
  return shake;
}
