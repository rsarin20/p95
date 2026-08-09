/* ══ PALETTE ══════════════════════════════════════════════
   Every zone is a two-ink print run: one paper, two inks.
   Crossing a zone boundary re-inks the entire press — world,
   HUD and overlays — over 1.6s. Progress you can *see*.
   ════════════════════════════════════════════════════════ */

export const ZONES = [
  { id:'DEADZONE',    from:0,    paper:'#EDE4D3', ink:'#161F38', duo:'#FF3D6E', dark:false },
  { id:'STATIC FLATS',from:350,  paper:'#E8E0D0', ink:'#2B1F17', duo:'#FF7A18', dark:false },
  { id:'THE RELAY',   from:850,  paper:'#DCE8E1', ink:'#0E2E29', duo:'#E8175D', dark:false },
  { id:'NIGHTFALL',   from:1450, paper:'#121A2C', ink:'#E9E2CF', duo:'#FF3D6E', dark:true  },
  { id:'AURORA',      from:2200, paper:'#0B1420', ink:'#D8E9F0', duo:'#3DF5B0', dark:true  },
  { id:'THE EDGE',    from:3100, paper:'#08080A', ink:'#F3EFE3', duo:'#FFD400', dark:true  },
  { id:'WHITE NOISE', from:4200, paper:'#F5F2EA', ink:'#111111', duo:'#2B4CFF', dark:false },
  { id:'THE HUM',     from:5500, paper:'#1A0F1F', ink:'#F0DFF5', duo:'#B14BFF', dark:true  },
  { id:'DEAD AIR',    from:7000, paper:'#E4E4E4', ink:'#0A0A0A', duo:'#FF2200', dark:false },
];

/* The connected state. Deliberately the loudest thing in the game —
   you should be able to tell someone is ONLINE from across a room. */
export const ONLINE_PAL = { id:'ONLINE', paper:'#FFE800', ink:'#101014', duo:'#FF2D55', dark:false };

const cache = new Map();
function rgb(hex){
  let v = cache.get(hex);
  if (!v){
    v = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    cache.set(hex, v);
  }
  return v;
}
const mix = (a,b,t) => {
  const A = rgb(a), B = rgb(b);
  return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`;
};

export function zoneFor(score){
  let z = ZONES[0];
  for (const c of ZONES) if (score >= c.from) z = c;
  return z;
}
export const zoneIndex = z => ZONES.indexOf(z);

/* Holds the press state and eases between plates. */
export class Press {
  constructor(){
    this.from = ZONES[0];
    this.to   = ZONES[0];
    this.t    = 1;
    this.speed = 1/1.6;
    this.cur  = { ...ZONES[0] };
  }
  goto(pal, seconds = 1.6){
    if (pal.id === this.to.id) return false;
    this.from = { ...this.cur, dark:this.cur.dark };
    this.to = pal; this.t = 0; this.speed = 1/seconds;
    return true;
  }
  update(dt){
    if (this.t < 1){
      this.t = Math.min(1, this.t + dt * this.speed);
      const e = this.t < .5 ? 2*this.t*this.t : 1-Math.pow(-2*this.t+2,2)/2; // easeInOutQuad
      this.cur.paper = mix(this.from.paper, this.to.paper, e);
      this.cur.ink   = mix(this.from.ink,   this.to.ink,   e);
      this.cur.duo   = mix(this.from.duo,   this.to.duo,   e);
      this.cur.dark  = e < .5 ? this.from.dark : this.to.dark;   // blend mode can't tween; snap at the midpoint
      this.cur.id    = this.to.id;
    } else {
      this.cur.paper = this.to.paper; this.cur.ink = this.to.ink;
      this.cur.duo = this.to.duo; this.cur.dark = this.to.dark; this.cur.id = this.to.id;
    }
    return this.cur;
  }
}
