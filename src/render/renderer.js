// Layout and draw order.
//
// The world is authored 360 units tall. The renderer decides how many units
// wide the screen gets to see — between 480 and 1400 — and scales to fit. That
// range is what lets the same simulation look composed on a phone held
// upright and on an ultrawide, without the game itself ever knowing the
// difference: obstacle spawning is fixed in world units, so nobody gets a
// preview advantage from a bigger monitor.

import { WORLD_H, GROUND_Y, JERBOA_X } from '../core/config.js';
import { paletteAtScore, moonAtScore } from './palette.js';
import { drawObstacle } from './obstacles.js';
import { drawJerboa } from './jerboa.js';

const MIN_WORLD_W = 480;
const MAX_WORLD_W = 1400;

export class Renderer {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.scene = scene;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.L = null;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const worldW = Math.min(MAX_WORLD_W, Math.max(MIN_WORLD_W, (w / h) * WORLD_H));
    const scale = w / worldW;
    const bandH = WORLD_H * scale;

    this.L = {
      w,
      h,
      dpr,
      scale,
      worldW,
      groundY: (h - bandH) / 2 + GROUND_Y * scale,
      starScale: Math.max(0.8, Math.min(2, scale * 0.55)),
    };
  }

  /** Screen x for a world x, given the camera distance. */
  sx(worldX, dist) {
    return (worldX - dist) * this.L.scale;
  }

  /**
   * @param {object} view
   * @param {number} view.dist        camera distance travelled
   * @param {number} view.score       drives the palette and the moon
   * @param {Array}  view.obstacles
   * @param {number} view.jerboaY     height above the horizon, world units
   * @param {object} view.pose
   * @param {boolean} view.showJerboa
   */
  draw(view) {
    const ctx = this.ctx;
    const L = this.L;
    const pal = paletteAtScore(view.score);
    const moon = moonAtScore(view.score);

    this.scene.drawSky(ctx, L, pal);
    this.scene.drawStars(ctx, L, pal);
    const moonScreen = this.scene.drawMoon(ctx, L, pal, moon);
    this.scene.drawDunes(ctx, L, pal, view.dist, moonScreen ? moonScreen.x : null);
    this.scene.drawGround(ctx, L, pal);
    this.scene.drawHorizon(ctx, L, pal);
    this.scene.drawStreaks(ctx, L, pal, view.dist);
    this.scene.drawDust(ctx, L, pal);

    // --- obstacles ---------------------------------------------------------
    for (const o of view.obstacles) {
      const x = this.sx(o.x, view.dist);
      const wpx = o.w * L.scale;
      if (x > L.w + 40 || x + wpx < -40) continue;
      ctx.save();
      ctx.translate(x, L.groundY);
      ctx.scale(L.scale, -L.scale);
      drawObstacle(ctx, o, pal.accent, pal.glow);
      ctx.restore();
    }

    // --- jerboa ------------------------------------------------------------
    if (view.showJerboa) {
      ctx.save();
      ctx.translate(JERBOA_X * L.scale, L.groundY - view.jerboaY * L.scale);
      ctx.scale(L.scale, -L.scale);
      drawJerboa(ctx, view.pose, pal.accent, pal.glow);
      ctx.restore();
    }

    // A vignette to keep the eye in the middle of the frame. Very slight.
    const vig = ctx.createRadialGradient(
      L.w * 0.5,
      L.groundY,
      Math.min(L.w, L.h) * 0.28,
      L.w * 0.5,
      L.groundY,
      Math.max(L.w, L.h) * 0.82,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, L.w, L.h);

    return pal;
  }
}
