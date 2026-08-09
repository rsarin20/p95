/* ══ GAME ═════════════════════════════════════════════════
   The runner underneath is Chrome-dino-shaped: fixed camera,
   rising speed, one hit and you're done. Everything on top of
   that is the SIGNAL economy, which is what actually makes it
   a score-chase instead of a dodge-em-up:

     packets  +13   they sit on jump arcs, over trouble
     near miss +6   pass within 15u of anything and live
     smash    +20   curl through a brittle stack
     decay    -3.6/s

   Fill the meter and the world comes ONLINE for five seconds —
   triple score, invincible, 35% faster. Then it drops you, at
   that new speed, back into the dark. Greed is the mechanic.
   ════════════════════════════════════════════════════════ */

import * as Rr from './render.js';
import { R, lerp, clamp, rand } from './render.js';
import { Press, zoneFor, zoneIndex, ONLINE_PAL, ZONES } from './palette.js';
import { drawPango, ballRadius } from './pango.js';
import { World } from './world.js';
import * as Ob from './obstacles.js';
import * as Fx from './particles.js';
import * as Snd from './audio.js';

export const PHYS = { g:2400, jumpV:-860, cut:.42, dive:2.7, coyote:.10, buffer:.13 };

const PX_FRAC     = .195;     // the pangolin never moves; the world does
/* Taken from the rendered art, not guessed: the pangolin measures
   45x88 standing and 25x25 rolled. The box covers the body core
   only — the nose and the long tail hang outside it. That's
   deliberate: a wide box on a long animal makes wide obstacles
   physically unclearable at low speed, and players read a graze
   that should have hit as generosity, never as a bug. */
const BOX_STAND   = { dx:2,   w:46, h:44 };
const BOX_CURL    = { dx:-11, w:23, h:27 };
const INSET       = 4;        // collision forgiveness, all round
const SIG_MAX     = 100;
const ONLINE_TIME = 5.0;
const NEAR        = 15;

const HINTS = {
  routers:   'CURL ↓ TO SMASH',
  routers_t: 'CURL ↓ TO SMASH',
  drone_mid: "DON'T JUMP",
  drone_low: 'CURL ↓ OR JUMP',
  swooper:   'TIME IT',
};

export class Game {
  constructor(hooks = {}){
    this.hooks = hooks;
    this.press = new Press();
    this.world = new World();
    this.seen  = new Set(JSON.parse(localStorage.getItem('pango.hints') || '[]'));
    this.best  = +(localStorage.getItem('pango.best') || 0);
    this.state = 'idle';
    this.t = 0;
    this.reset();
  }

  get groundY(){ return R.viewTop + R.viewH * .78; }
  get horizonY(){ return this.groundY - R.viewH * .32; }
  get px(){ return R.worldW * PX_FRAC; }

  reset(){
    this.dist = 0; this.raw = 0; this.score = 0;
    this.speed = 400;
    this.signal = 0; this.online = 0; this.onlineMult = 1;
    this.obs = []; this.packets = []; this.pops = []; this.hint = null;
    this.nextObs = 900; this.prevKind = null; this.sinceForm = 260;
    this.shake = 0; this.hitstop = 0; this.deathT = 0;
    this.milestone = 0; this.smashes = 0; this.nears = 0; this.picked = 0;
    this.runTime = 0;
    this.world.reset();
    Fx.clear();

    const gy = this.groundY;
    this.p = {
      x: this.px, y: gy, vy: 0, onGround: true,
      curl: 0, curlWant: false, phase: 0, air: 0, roll: 0,
      signal: 0, dead: false, tilt: 0, coyote: 0, buffer: 0, vyPrev: 0,
    };
    this.press.goto(ZONES[0], .01);
    this.zone = ZONES[0];
    this.hooks.onZone?.(this.zone.id, false);
    this.hooks.onScore?.(0, this.best);
  }

  start(){
    if (this.state === 'run') return;
    this.reset();
    this.state = 'run';
    this.p.buffer = PHYS.buffer;      // the keypress that started the run also jumps
    Snd.start();
  }

  /* ── input ──────────────────────────────────────────── */
  jumpDown(){
    if (this.state !== 'run') return;
    this.p.buffer = PHYS.buffer;
  }
  jumpUp(){
    const p = this.p;
    if (p.vy < 0) p.vy *= PHYS.cut;
  }
  setCurl(v){
    if (this.state !== 'run') return;
    this.p.curlWant = v;
  }

  /* ── update ─────────────────────────────────────────── */
  update(dt){
    this.t += dt;
    if (this.hitstop > 0){ this.hitstop -= dt; dt = Math.min(dt, .0004); }

    if (this.state === 'idle')  return this.idle(dt);
    if (this.state === 'dying') return this.dying(dt);
    if (this.state !== 'run')   { this.press.update(dt); return; }

    this.runTime += dt;
    const gy = this.groundY;
    const p = this.p;
    p.x = this.px;
    if (p.onGround) p.y = gy;

    /* speed & score */
    const ramp = 400 + Math.min(480, this.dist * .0058);
    this.onlineMult = lerp(this.onlineMult, this.online > 0 ? 1.35 : 1, 1 - Math.pow(.001, dt));
    const rollBonus = (p.onGround && p.curl > .6) ? 1.06 : 1;
    this.speed = ramp * this.onlineMult * rollBonus;

    this.dist += this.speed * dt;
    this.raw  += this.speed * dt * .0215 * (this.online > 0 ? 3 : 1);
    const s = Math.floor(this.raw);
    if (s !== this.score){
      this.score = s;
      this.hooks.onScore?.(s, this.best);
      if (s >= this.milestone + 100){
        this.milestone = Math.floor(s / 100) * 100;
        this.world.addMarker(this.milestone + 'M');
        Snd.milestone();
        this.hooks.onMilestone?.(this.milestone);
      }
    }

    /* zone */
    const z = zoneFor(this.score);
    if (z !== this.zone){
      this.zone = z;
      if (this.online <= 0) this.press.goto(z, 1.6);
      this.hooks.onZone?.(z.id, true);
      Snd.zone();
      this.pop(z.id, R.worldW*.55, gy - 150, 1.9);
    }

    /* ── pangolin ── */
    p.curl = lerp(p.curl, p.curlWant ? 1 : 0, 1 - Math.pow(.0002, dt));
    p.buffer -= dt;
    if (p.onGround) p.coyote = PHYS.coyote; else p.coyote -= dt;

    if (p.buffer > 0 && p.coyote > 0){
      p.vy = PHYS.jumpV; p.onGround = false; p.coyote = 0; p.buffer = 0;
      p.air = 1;
      Fx.dust(p.x - 6, gy); Fx.dust(p.x + 8, gy);
      Snd.jump();
    }

    const diving = !p.onGround && p.curlWant;
    p.vyPrev = p.vy;
    p.vy += PHYS.g * (diving ? PHYS.dive : 1) * dt;
    p.y  += p.vy * dt;

    if (p.y >= gy){
      const impact = p.vyPrev;
      if (!p.onGround){
        p.onGround = true;
        Fx.dust(p.x - 10, gy); Fx.dust(p.x + 6, gy); Fx.dust(p.x - 2, gy);
        if (impact > 1300 && p.curl > .5) this.slam(gy);
        else Snd.land();
      }
      p.y = gy; p.vy = 0;
    }
    p.air = clamp(p.air + (p.onGround ? -dt * 9 : dt * 9), 0, 1);
    if (p.onGround){
      p.phase += dt * (this.speed / 34) * lerp(1, .55, p.curl);
      p.roll  -= this.speed * dt / (ballRadius() * .92);
    }
    p.signal = this.signal / SIG_MAX;
    p.tilt = p.onGround ? 0 : clamp(p.vy * .00016, -.10, .16) * (1 - p.curl);

    /* ── signal economy ── */
    if (this.online > 0){
      this.online -= dt;
      this.signal = SIG_MAX * (this.online / ONLINE_TIME);
      if (Math.random() < dt * 40)
        Fx.streak(rand(0, R.worldW), rand(gy - 190, gy - 8), rand(30, 120));
      if (this.online <= 0){
        this.signal = 0;
        this.press.goto(this.zone, .7);
        this.hooks.onOnline?.(false);
        this.pop('SIGNAL LOST', R.worldW*.55, gy - 132, 1.5);
        Snd.offline();
      }
    } else if (this.signal >= SIG_MAX){
      // test the meter before draining it, or the last packet's worth
      // of charge is shaved off every frame and CONNECT never fires
      this.connect(gy);
    } else {
      this.signal = Math.max(0, this.signal - 3.6 * dt);
    }
    this.hooks.onSignal?.(this.signal / SIG_MAX, this.online > 0);

    /* ── world & spawning ── */
    this.world.update(dt, this.speed, zoneIndex(this.zone));

    this.nextObs -= this.speed * dt;
    if (this.nextObs <= 0){
      const pressure = clamp(this.dist / 60000, 0, 1);
      const kind = Ob.nextKind(zoneIndex(this.zone), this.prevKind);
      const o = Ob.makeObstacle(kind, R.worldW + 60, gy);
      this.obs.push(o);
      this.prevKind = kind;
      this.nextObs = Ob.gapFor(kind, this.speed, pressure);

      if (HINTS[kind] && !this.seen.has(kind)){
        this.seen.add(kind);
        localStorage.setItem('pango.hints', JSON.stringify([...this.seen]));
        this.hint = { text: HINTS[kind], o, life: 2.6 };
      }
    }

    this.sinceForm -= this.speed * dt;
    if (this.sinceForm <= 0 && this.obs.length){
      this.sinceForm = rand(560, 1000);
      const last = this.obs[this.obs.length - 1];
      const at = last.x + rand(150, 260);
      this.packets.push(...Ob.formation(at, gy, this.speed, PHYS));
    }

    for (let i = this.obs.length - 1; i >= 0; i--){
      const o = this.obs[i];
      o.x -= this.speed * dt;
      Ob.updateObstacle(o, dt, this.t);
      if (o.x + o.w < -60) this.obs.splice(i, 1);
    }
    for (let i = this.packets.length - 1; i >= 0; i--){
      const q = this.packets[i];
      q.x -= this.speed * dt;
      if (q.x < -40) this.packets.splice(i, 1);
    }

    Fx.update(dt, this.speed);
    this.updatePops(dt);
    if (this.hint){ this.hint.life -= dt; if (this.hint.life <= 0) this.hint = null; }

    /* ── contact ── */
    this.collide(gy);

    this.shake = Math.max(0, this.shake - dt * 34);
    this.press.update(dt);
    this.hooks.onPalette?.(this.press.cur);
  }

  box(){
    const p = this.p, c = p.curl;
    const w = lerp(BOX_STAND.w, BOX_CURL.w, c);
    const h = lerp(BOX_STAND.h, BOX_CURL.h, c);
    return { x: p.x + lerp(BOX_STAND.dx, BOX_CURL.dx, c), y: p.y - h, w, h };
  }

  collide(gy){
    const b = this.box();
    const bx1 = b.x + INSET, bx2 = b.x + b.w - INSET;
    const by1 = b.y + INSET, by2 = b.y + b.h;
    const rolling = this.p.curl > .55 && this.p.onGround;
    const invuln  = this.online > 0;

    for (const o of this.obs){
      if (o.dead) continue;
      const ox1 = o.x + INSET*.6, ox2 = o.x + o.w - INSET*.6;
      const oy1 = o.y + INSET*.6, oy2 = o.y + o.h;

      if (bx2 > ox1 && bx1 < ox2){
        const clear = Math.max(oy1 - by2, by1 - oy2);
        if (clear < 0){
          if (invuln || (rolling && o.brittle)){ this.smash(o); continue; }
          return this.die(o);
        }
        if (clear < o.minGap) o.minGap = clear;
      } else if (ox2 < bx1 && !o.scored){
        o.scored = true;
        if (o.minGap < NEAR){
          this.nears++;
          this.gain(6);
          this.pop('NEAR', o.x + o.w, o.y - 12, .8);
          Snd.near();
        }
      }
    }

    for (let i = this.packets.length - 1; i >= 0; i--){
      const q = this.packets[i];
      const cx = clamp(q.x, bx1, bx2), cy = clamp(q.y, by1, by2);
      if ((q.x-cx)**2 + (q.y-cy)**2 < (q.r + 5)**2){
        this.packets.splice(i, 1);
        this.picked++;
        this.gain(13);
        Fx.sparkle(q.x, q.y);
        Snd.pickup(clamp(this.signal / SIG_MAX, 0, 1));
      }
    }
  }

  gain(n){
    if (this.online > 0) return;
    this.signal = Math.min(SIG_MAX, this.signal + n);
  }

  smash(o){
    o.dead = true;
    this.smashes++;
    this.gain(20);
    this.hitstop = .07;
    this.shake = Math.min(14, this.shake + 8);
    Fx.shards(o.x + o.w/2, o.y + o.h/2, 16, 0);
    Fx.shards(o.x + o.w/2, o.y + o.h/2, 8, 1);
    Fx.ring(o.x + o.w/2, o.y + o.h/2);
    this.pop('SMASH', o.x + o.w/2, o.y - 8, 1.1);
    Snd.smash();
    const i = this.obs.indexOf(o);
    if (i >= 0) this.obs.splice(i, 1);
  }

  slam(gy){
    this.shake = Math.min(16, this.shake + 10);
    Fx.ring(this.p.x, gy - 6);
    Snd.slam();
    for (const o of this.obs.slice()){
      if (o.brittle && Math.abs(o.x + o.w/2 - this.p.x) < 96 && o.y + o.h > gy - 70) this.smash(o);
    }
  }

  connect(gy){
    this.online = ONLINE_TIME;
    this.press.goto(ONLINE_PAL, .22);
    this.shake = 12;
    Fx.ring(this.p.x, gy - 26);
    this.pop('CONNECTED', R.worldW*.55, gy - 150, 1.8);
    this.hooks.onOnline?.(true);
    Snd.connect();
  }

  die(o){
    if (this.state !== 'run') return;
    this.state = 'dying';
    this.deathT = 0;
    this.p.dead = true;
    this.p.vy = -430; this.p.onGround = false;
    this.hitstop = .12;
    this.shake = 20;
    Fx.splat(this.p.x + 14, this.p.y - 26);
    Snd.die();
  }

  dying(dt){
    this.deathT += dt;
    const p = this.p;
    p.vy += PHYS.g * .78 * dt;
    p.y  += p.vy * dt;
    p.tilt += dt * 5.2;
    if (p.y > this.groundY + 40) { p.y = this.groundY + 40; p.vy = 0; }
    Fx.update(dt, this.speed * .3);
    this.updatePops(dt);
    this.shake = Math.max(0, this.shake - dt * 34);
    this.press.update(dt);
    this.hooks.onPalette?.(this.press.cur);

    if (this.deathT > .62){
      this.state = 'dead';
      if (this.score > this.best){
        this.best = this.score;
        localStorage.setItem('pango.best', String(this.best));
      }
      this.hooks.onDeath?.({
        score: this.score, best: this.best, zone: this.zone.id,
        duration: this.runTime, smashes: this.smashes,
        nears: this.nears, packets: this.picked,
      });
    }
  }

  idle(dt){
    const gy = this.groundY;
    this.p.y = gy; this.p.x = this.px;
    this.p.phase += dt * 6.4;
    this.p.curl = lerp(this.p.curl, 0, dt * 6);
    this.p.signal = .12 + Math.sin(this.t * 1.4) * .1;
    this.speed = 150;
    this.world.update(dt, this.speed, 0);
    Fx.update(dt, this.speed);
    this.press.update(dt);
    this.hooks.onPalette?.(this.press.cur);
  }

  /* ── typographic popups ─────────────────────────────── */
  pop(text, x, y, scale = 1){
    this.pops.push({ text, x, y, scale, life: .95, t: 0 });
    if (this.pops.length > 14) this.pops.shift();
  }
  updatePops(dt){
    for (let i = this.pops.length - 1; i >= 0; i--){
      const q = this.pops[i];
      q.t += dt; q.y -= dt * 26; q.x -= this.speed * dt * .5;
      if (q.t >= q.life) this.pops.splice(i, 1);
    }
  }

  /* ── render ─────────────────────────────────────────── */
  render(){
    const pal = this.press.cur;
    const gy = this.groundY;
    Rr.begin(pal);

    const S = { groundY: gy, horizonY: this.horizonY, worldH: R.worldH, dark: pal.dark,
                online: this.online > 0, zone: this.online > 0 ? 'ONLINE' : this.zone.id };

    Rr.eachLayer((ctx, k) => {
      this.world.draw(ctx, k, S);

      for (const q of this.packets) Ob.drawPacket(ctx, k, q, this.t);
      for (const o of this.obs)     Ob.drawObstacle(ctx, k, o, gy, this.t);

      Fx.draw(ctx, k);

      if (this.state !== 'idle' || true){
        drawPango(ctx, k, this.p, {
          onStrike: k === 0 ? (fx, fy) => { if (Math.random() < .5) Fx.dust(this.p.x + fx * .3, gy); } : null,
        });
      }

      // in-world type: hints and popups, set like a printed caption
      ctx.save();
      ctx.textAlign = 'center';
      if (this.hint && this.hint.o && !this.hint.o.dead){
        const h = this.hint;
        const a = clamp(h.life, 0, 1) * (k === 1 ? 1 : .85);
        ctx.globalAlpha = a;
        ctx.font = '700 11px ui-monospace, Menlo, monospace';
        const hx = clamp(h.o.x + h.o.w/2, 96, R.worldW - 96);
        const hy = Math.min(h.o.y - 26, gy - 96);
        if (k === 1){
          ctx.fillText(h.text, hx, hy);
          ctx.globalAlpha = a * .8;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(hx, hy + 7); ctx.lineTo(hx, hy + 20); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(hx - 4, hy + 15); ctx.lineTo(hx, hy + 21); ctx.lineTo(hx + 4, hy + 15); ctx.stroke();
        }
      }
      for (const q of this.pops){
        const u = q.t / q.life;
        ctx.globalAlpha = (1 - u * u) * (k === 1 ? 1 : .45);
        ctx.font = `700 ${Math.round(10 * q.scale)}px ui-monospace, Menlo, monospace`;
        ctx.fillText(q.text, q.x, q.y);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    const sh = this.shake;
    Rr.finish(
      sh ? rand(-sh, sh) : 0,
      sh ? rand(-sh, sh) * .6 : 0,
      this.online > 0 ? .22 : .14
    );
  }
}
