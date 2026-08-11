import { CFG } from './config.js';
import { Spawner } from './entities.js';
import { haptic } from './input.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Renderer, decayShake } from './render.js';
import { clamp } from './utils.js';

const MAX_DT = 1 / 30; // a backgrounded tab must never teleport the world
const IDLE_FLOW = 0.34; // how fast the river drifts on the menus
const OVER_FLOW = 0.12;

/**
 * Owns the run: physics, spawning, collision, scoring and the render pump.
 * Everything user-facing is reported through the `hooks` callbacks so the DOM
 * layer can stay ignorant of game internals.
 */
export class Game {
  state = 'boot';
  score = 0;
  best = 0;

  constructor(canvas, input, hooks = {}) {
    this.renderer = new Renderer(canvas);
    this.input = input;
    this.hooks = hooks;

    this.player = new Player();
    this.spawner = new Spawner();
    this.particles = new Particles();

    this.shake = { power: 0, x: 0, y: 0, rot: 0 };
    this.scroll = 0;
    this.worldTime = 0;
    this.elapsed = 0;
    this.speed = CFG.BASE_SPEED;
    this.flash = 0;
    this.chillStreak = 0;
    this.wakeTimer = 0;
    this.overAt = 0;

    this.#layout();
    this.#resizeObserver = new ResizeObserver(() => this.#layout());
    this.#resizeObserver.observe(canvas);
  }

  #resizeObserver;
  #raf = 0;
  #lastFrame = 0;

  #layout() {
    const view = this.renderer.resize();
    this.player.setWater(view.waterY);
    this.player.x = Math.max(CFG.PLAYER_X_MIN, view.w * CFG.PLAYER_X_RATIO);
    if (this.state !== 'playing') this.player.reset(this.player.x, view.waterY);
  }

  get view() {
    return this.renderer.view;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.hooks.onState?.(state);
  }

  /** Begin (or restart) a run. */
  start() {
    const view = this.view;
    this.score = 0;
    this.elapsed = 0;
    this.speed = CFG.BASE_SPEED;
    this.flash = 0;
    this.chillStreak = 0;
    this.shake.power = 0;
    this.particles.clear();
    this.spawner.reset(view);
    this.player.reset(Math.max(CFG.PLAYER_X_MIN, view.w * CFG.PLAYER_X_RATIO), view.waterY);
    this.setState('playing');
    this.hooks.onScore?.(0);
  }

  /** Queue a hop; the player object decides whether it's currently legal. */
  hop() {
    if (this.state === 'playing') this.player.requestHop();
  }

  run() {
    if (this.#raf) return;
    this.#lastFrame = performance.now();
    const tick = (now) => {
      this.#raf = requestAnimationFrame(tick);
      const dt = Math.min(MAX_DT, Math.max(0, (now - this.#lastFrame) / 1000));
      this.#lastFrame = now;
      this.update(dt);
      this.render();
    };
    this.#raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  destroy() {
    this.stop();
    this.#resizeObserver.disconnect();
  }

  // ── Simulation ──────────────────────────────────────────────────────

  update(dt) {
    this.worldTime += dt;
    const playing = this.state === 'playing';

    if (playing) {
      this.elapsed += dt;
      // Smooth +2% every 10s — exponential, not stepped, so it never lurches.
      this.speed = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED * CFG.SPEED_STEP ** (this.elapsed / CFG.SPEED_EVERY));
    } else {
      this.speed = CFG.BASE_SPEED * (this.state === 'over' ? OVER_FLOW : IDLE_FLOW);
    }

    this.scroll += this.speed * dt;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    decayShake(this.shake, dt);

    if (playing) {
      this.player.update(dt, this.input, this.worldTime);
      this.spawner.update(dt, {
        view: this.view,
        speed: this.speed,
        elapsed: this.elapsed,
        worldTime: this.worldTime,
        playerX: this.player.x
      });

      this.score += this.speed * dt * CFG.SCORE_RATE;
      this.hooks.onScore?.(this.score);

      this.#reactToPlayer(dt);
      this.#checkContacts();
    } else {
      // Keep the capybara breathing on the menus.
      this.player.update(dt, IDLE_INPUT, this.worldTime);
      this.#wake(dt, 0.42);
    }

    this.particles.update(dt, this.speed);
  }

  /** Splashes, wake and camera kick — the parts that make motion feel physical. */
  #reactToPlayer(dt) {
    const player = this.player;
    const waterY = this.view.waterY;

    if (player.splashRequested) {
      player.splashRequested = false;
      this.particles.splash(player.x + player.w * 0.4, waterY, 0.7, this.speed);
      haptic(CFG.HAPTIC_HOP);
    }

    if (player.landedThisFrame > 0) {
      const impact = clamp(player.landedThisFrame / 1500, 0.25, 1);
      this.particles.splash(player.x + player.w * 0.45, waterY, impact, this.speed);
      this.shake.power = Math.min(1, this.shake.power + impact * CFG.LANDING_SHAKE * 34);
      haptic(Math.round(6 + impact * 12));
    }

    this.#wake(dt, player.airborne ? 0 : 1);
  }

  #wake(dt, intensity) {
    if (intensity <= 0) return;
    this.wakeTimer -= dt * intensity;
    if (this.wakeTimer > 0) return;
    this.wakeTimer = 0.16;
    this.particles.ripple(this.player.x + this.player.w * 0.15, this.view.waterY + 2, 0.45);
  }

  #checkContacts() {
    const box = this.player.hitbox();

    for (const o of this.spawner.obstacles) {
      const hit = this.spawner.hitbox(o);
      const overlapX = box.x < hit.x + hit.w && box.x + box.w > hit.x;

      if (overlapX && box.y < hit.y + hit.h && box.y + box.h > hit.y) {
        return this.#crash(o);
      }

      // Chill Moment: clear a gator by a hair and take the bonus.
      if (o.nearMissEligible && !o.nearMissed && overlapX && this.player.airborne) {
        const clearance = hit.y - (box.y + box.h);
        if (clearance >= 0 && clearance < CFG.NEAR_MISS_WINDOW) {
          o.nearMissed = true;
          this.#chillMoment();
        }
      }

      if (!o.scored && hit.x + hit.w < box.x) o.scored = true;
    }
  }

  #chillMoment() {
    this.chillStreak += 1;
    const bonus = CFG.NEAR_MISS_BONUS * Math.min(this.chillStreak, 4);
    this.score += bonus;
    this.flash = 0.55;
    this.particles.chill(this.player.x + this.player.w * 0.5, this.player.y - this.player.h * 0.6);
    haptic(14);
    this.hooks.onChill?.({ bonus, streak: this.chillStreak });
  }

  #crash(obstacle) {
    if (this.state !== 'playing') return;
    this.shake.power = 1;
    this.particles.splash(this.player.x + this.player.w * 0.5, this.view.waterY, 1.4, this.speed);
    this.particles.chill(this.player.x + this.player.w * 0.5, this.player.y - 20);
    haptic(CFG.HAPTIC_CRASH);

    this.overAt = performance.now();
    this.setState('over');
    this.hooks.onGameOver?.({
      score: Math.floor(this.score),
      durationMs: Math.round(this.elapsed * 1000),
      chillMoments: this.chillStreak,
      obstacle: obstacle.kind
    });
  }

  render() {
    this.renderer.render({
      palette: Renderer.paletteFor(this.state === 'boot' ? 1400 : this.score),
      scroll: this.scroll,
      worldTime: this.worldTime,
      shake: this.shake,
      player: this.player,
      spawner: this.spawner,
      particles: this.particles,
      score: this.state === 'boot' ? 1400 : this.score,
      flash: this.flash
    });
  }
}

/** A frozen "nothing pressed" input for menu-state idle animation. */
const IDLE_INPUT = Object.freeze({ hopHeld: false, diveHeld: false });
