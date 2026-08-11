const HOP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const DIVE_KEYS = new Set(['ArrowDown', 'KeyS']);

const SWIPE_DISTANCE = 34;
const SWIPE_TIME = 400;

/**
 * Unifies keyboard and touch into two held signals plus edge-triggered events.
 * The game reads `hopHeld` / `diveHeld` each frame; `onHop` fires once per press
 * so hop buffering stays in the game logic rather than here.
 */
export class Input {
  hopHeld = false;
  diveHeld = false;

  #handlers = { hop: [], dive: [], action: [] };
  #pointers = new Map();
  #detach = [];

  constructor(target) {
    this.target = target;
  }

  on(event, fn) {
    this.#handlers[event].push(fn);
    return this;
  }

  #emit(event, ...args) {
    for (const fn of this.#handlers[event]) fn(...args);
  }

  attach() {
    const keydown = (e) => {
      // Never swallow keys aimed at the callsign field.
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea')) return;

      if (HOP_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) {
          this.hopHeld = true;
          this.#emit('hop');
        }
        return;
      }
      if (DIVE_KEYS.has(e.code)) {
        e.preventDefault();
        this.diveHeld = true;
        if (!e.repeat) this.#emit('dive');
        return;
      }
      if (!e.repeat) this.#emit('action', e.code);
    };

    const keyup = (e) => {
      if (HOP_KEYS.has(e.code)) this.hopHeld = false;
      if (DIVE_KEYS.has(e.code)) this.diveHeld = false;
    };

    const pointerdown = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('button, input, a')) return;
      this.#pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), swiped: false });
      this.hopHeld = true;
      this.#emit('hop');
    };

    const pointermove = (e) => {
      const start = this.#pointers.get(e.pointerId);
      if (!start || start.swiped) return;
      const dy = e.clientY - start.y;
      const dx = e.clientX - start.x;
      if (dy > SWIPE_DISTANCE && dy > Math.abs(dx) && performance.now() - start.t < SWIPE_TIME) {
        start.swiped = true;
        this.hopHeld = false;
        this.diveHeld = true;
        this.#emit('dive');
      }
    };

    const release = (e) => {
      if (!this.#pointers.delete(e.pointerId)) return;
      if (this.#pointers.size === 0) {
        this.hopHeld = false;
        this.diveHeld = false;
      }
    };

    // Held keys go stale if the tab loses focus mid-press.
    const blur = () => {
      this.hopHeld = false;
      this.diveHeld = false;
      this.#pointers.clear();
    };

    this.#listen(window, 'keydown', keydown);
    this.#listen(window, 'keyup', keyup);
    this.#listen(window, 'blur', blur);
    this.#listen(this.target, 'pointerdown', pointerdown);
    this.#listen(window, 'pointermove', pointermove, { passive: true });
    this.#listen(window, 'pointerup', release);
    this.#listen(window, 'pointercancel', release);
    this.#listen(this.target, 'contextmenu', (e) => e.preventDefault());

    return this;
  }

  #listen(node, type, fn, options) {
    node.addEventListener(type, fn, options ?? false);
    this.#detach.push(() => node.removeEventListener(type, fn, options ?? false));
  }

  destroy() {
    for (const off of this.#detach) off();
    this.#detach.length = 0;
  }
}

/** Micro-haptics on devices that support them; silently ignored elsewhere. */
export function haptic(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* vibration blocked by policy — cosmetic only */
    }
  }
}
