import { CFG } from './config.js';
import { approach, clamp } from './utils.js';
import { HEAD_H, drawCapybara, drawYuzu } from './shapes.js';

const BODY_W = 76;
const BODY_H = 40;
const HEAD_RISE = HEAD_H - 8;  // how far the head clears the body's top edge
const FLOAT_DEPTH = 14;        // how deep the loaf rides in the water at rest
const YUZU_R = 9;

/**
 * The capybara, and the yuzu that lives on its head.
 *
 * The two are simulated separately and only meet at a contact constraint: the
 * yuzu falls under its own (lighter) gravity and is pushed up by the head when
 * the head reaches it. That's what makes the fruit hang in the air for a beat
 * at the top of a hop instead of being glued to the skull.
 */
export class Player {
  constructor() {
    this.reset(0, 0);
  }

  /** Rebind the surface the capybara rides on (called on every resize). */
  setWater(waterY) {
    this.waterY = waterY;
    this.restY = waterY + FLOAT_DEPTH;
  }

  reset(x, waterY) {
    this.x = x;
    this.setWater(waterY);
    this.y = this.restY;        // bottom edge of the body
    this.vy = 0;
    this.airborne = false;
    this.holding = false;
    this.holdTime = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.submerge = 0;
    this.tilt = 0;
    this.legPhase = 0;
    this.bob = 0;
    this.blinkTimer = 3;
    this.blink = false;
    this.alive = true;
    this.landedThisFrame = 0;

    this.yuzu = { x: x + BODY_W * 0.83, y: this.#headTop() - YUZU_R, vy: 0, spin: 0, squash: 0 };
  }

  get w() { return BODY_W; }
  get h() { return BODY_H; }

  #bodyTop() { return this.y - BODY_H; }
  #headTop() { return this.y - BODY_H - HEAD_RISE; }

  /**
   * Collision box: brow to keel. Inset at the back and cropped just short of
   * the snout tip, so a graze always looks like a graze — the ears and the last
   * few units of nose are decoration and never kill a run.
   */
  hitbox() {
    const top = this.#headTop() + 4;
    return { x: this.x + 12, y: top, w: BODY_W - 20, h: this.y - top - 2 };
  }

  requestHop() {
    this.buffer = CFG.BUFFER;
  }

  update(dt, input, worldTime) {
    this.landedThisFrame = 0;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);

    const grounded = !this.airborne;
    const diving = input.diveHeld;

    // ── Take-off ──────────────────────────────────────────────────────
    if (this.buffer > 0 && (grounded || this.coyote > 0) && !diving) {
      this.vy = -CFG.JUMP_V;
      this.airborne = true;
      this.holding = true;
      this.holdTime = 0;
      this.buffer = 0;
      this.coyote = 0;
      this.submerge = 0;
      this.splashRequested = true;
    }

    if (this.airborne) {
      // Variable height: holding the key softens gravity for a short window,
      // releasing early clips the remaining upward velocity.
      if (this.holding && input.hopHeld && this.vy < 0 && this.holdTime < CFG.HOLD_MAX) {
        this.holdTime += dt;
        this.vy += CFG.GRAVITY * CFG.HOLD_GRAVITY * dt;
      } else {
        if (this.holding && !input.hopHeld && this.vy < 0) this.vy *= CFG.CUT_MULTIPLIER;
        this.holding = false;
        this.vy += (diving ? CFG.DIVE_GRAVITY : CFG.GRAVITY) * dt;
      }

      this.y += this.vy * dt;

      if (this.y >= this.restY) {
        this.landedThisFrame = this.vy;
        this.y = this.restY;
        this.vy = 0;
        this.airborne = false;
        this.holding = false;
      }
    } else {
      this.coyote = CFG.COYOTE;
      // Riding the surface: a slow bob, plus submerging while dive is held.
      this.bob = Math.sin(worldTime * 2.6) * 1.8;
      this.submerge = approach(this.submerge, diving ? 1 : 0, diving ? 16 : 9, dt);
      this.y = this.restY + this.bob + this.submerge * CFG.SUBMERGE_DEPTH;
      this.legPhase += dt * (diving ? 4 : 9);
    }

    // ── Pose ──────────────────────────────────────────────────────────
    const targetTilt = this.airborne ? clamp(this.vy / 2600, -0.2, 0.28) : Math.sin(worldTime * 2.1) * 0.02;
    this.tilt = approach(this.tilt, targetTilt, 12, dt);

    // Blink: the only thing this animal ever does with its face.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = !this.blink;
      this.blinkTimer = this.blink ? 0.09 : 2.4 + Math.random() * 3.4;
    }

    this.#updateYuzu(dt);
  }

  #updateYuzu(dt) {
    const yuzu = this.yuzu;
    // Anchor tracks the head, rotated with the body's tilt.
    const anchorX = this.x + BODY_W * 0.83 - Math.sin(this.tilt) * HEAD_RISE;
    const anchorY = this.#headTop() - YUZU_R - 1;

    yuzu.vy += CFG.YUZU_GRAVITY * dt;
    yuzu.y += yuzu.vy * dt;

    if (yuzu.y >= anchorY) {
      // Resting on the head — inherit its motion, shed a little energy.
      const impact = yuzu.vy - Math.min(this.vy, 0);
      yuzu.y = anchorY;
      yuzu.vy = this.airborne ? this.vy : 0;
      if (impact > 260) yuzu.squash = Math.min(0.45, impact / 2200);
    }

    // Never let the fruit drift comically far from its owner.
    yuzu.y = Math.max(yuzu.y, anchorY - CFG.YUZU_MAX_LIFT);
    yuzu.x = approach(yuzu.x, anchorX, CFG.YUZU_DAMPING * 2.4, dt);
    yuzu.spin = approach(yuzu.spin, clamp((anchorX - yuzu.x) * 0.03, -0.5, 0.5), 8, dt);
    yuzu.squash = approach(yuzu.squash, 0, 9, dt);
    yuzu.lift = anchorY - yuzu.y;
  }

  draw(ctx, palette) {
    const yuzu = this.yuzu;
    drawYuzu(ctx, yuzu.x, yuzu.y, YUZU_R, palette, yuzu.spin, yuzu.squash);

    drawCapybara(
      ctx,
      {
        x: this.x,
        y: this.#bodyTop(),
        w: BODY_W,
        h: BODY_H,
        tilt: this.tilt,
        legPhase: this.legPhase,
        airborne: this.airborne,
        blink: this.blink
      },
      palette
    );
  }
}
