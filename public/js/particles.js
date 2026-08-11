import { rand, rgb } from './utils.js';

const MAX = 260;

/**
 * One flat array of particles covering droplets, surface ripples and the
 * chill-moment sparkle. Dead entries are recycled rather than reallocated so a
 * long run doesn't churn the heap mid-frame.
 */
export class Particles {
  #items = [];

  clear() {
    this.#items.length = 0;
  }

  #alloc() {
    for (const p of this.#items) {
      if (p.life <= 0) return p;
    }
    if (this.#items.length >= MAX) return null;
    const p = { life: 0 };
    this.#items.push(p);
    return p;
  }

  /** Water thrown up by a landing or a take-off. */
  splash(x, y, strength = 1, drift = 0) {
    const count = Math.min(16, 4 + Math.round(strength * 11));
    for (let i = 0; i < count; i++) {
      const p = this.#alloc();
      if (!p) return;
      Object.assign(p, {
        type: 'drop',
        x: x + rand(-16, 16),
        y: y + rand(-3, 3),
        vx: rand(-70, 40) - drift * 0.12,
        vy: rand(-160, -50) * (0.6 + strength * 0.5),
        r: rand(1.4, 3.4),
        life: rand(0.35, 0.75),
        max: 0.75
      });
    }
    this.ripple(x, y, 0.6 + strength * 0.6);
  }

  /** Expanding surface ring. */
  ripple(x, y, strength = 1) {
    const p = this.#alloc();
    if (!p) return;
    Object.assign(p, {
      type: 'ripple',
      x,
      y,
      r: 6,
      grow: 90 * strength,
      life: 0.55 + strength * 0.35,
      max: 0.55 + strength * 0.35
    });
  }

  /** The near-miss flash: a quick ring of sparks around the capybara. */
  chill(x, y) {
    for (let i = 0; i < 14; i++) {
      const p = this.#alloc();
      if (!p) return;
      const angle = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      const speed = rand(90, 200);
      Object.assign(p, {
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7,
        r: rand(1.6, 3.2),
        life: rand(0.3, 0.6),
        max: 0.6
      });
    }
  }

  update(dt, flow) {
    for (const p of this.#items) {
      if (p.life <= 0) continue;
      p.life -= dt;

      if (p.type === 'drop') {
        p.vy += 900 * dt;
        p.x += (p.vx - flow) * dt;
        p.y += p.vy * dt;
      } else if (p.type === 'spark') {
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
        p.x += (p.vx - flow * 0.35) * dt;
        p.y += p.vy * dt;
      } else {
        p.x -= flow * dt;
        p.r += p.grow * dt;
      }
    }
  }

  draw(ctx, palette) {
    for (const p of this.#items) {
      if (p.life <= 0) continue;
      const t = p.life / p.max;

      if (p.type === 'ripple') {
        ctx.strokeStyle = rgb(palette.foam, 0.3 * t);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'spark') {
        ctx.fillStyle = rgb(palette.sun, 0.85 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * t, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = rgb(palette.foam, 0.75 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
