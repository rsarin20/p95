/* ══ RENDER — the printing press ═════════════════════════
   Real risograph works in separations: one physical plate per
   ink, printed one pass at a time, never landing perfectly on
   top of each other. So we do the same.

     layer A  →  the dark ink  (structure, silhouettes)
     layer B  →  the fluoro ink (accents, glow, misprint halo)

   Each is a full-size transparent canvas. Composite the two onto
   paper with multiply (light stock) or screen (dark stock), with
   layer B nudged a hair off-register. Overlaps go rich and dirty
   exactly the way real overlapping inks do — for free.
   ════════════════════════════════════════════════════════ */

/* Logical width drives fairness: it's how far ahead you can see, so
   it must not depend on the window. But a phone in portrait would
   get a comically tall world from a fixed width, so we derive it
   from the aspect and clamp hard at both ends — everyone gets
   between 640 and 1040 units of warning, nobody gets a telescope. */
export const viewWidthFor = aspect => Math.max(640, Math.min(1040, 430 * aspect));

export const R = {
  canvas:null, ctx:null,
  A:null, actx:null, B:null, bctx:null,
  w:0, h:0, scale:1,
  worldW:860, worldH:430,
  viewH:430, viewTop:0,          // the play band, centred in a tall world
  inkA:'#161F38', inkB:'#FF3D6E', paper:'#EDE4D3', dark:false,
  grain:null, halftone:null, hatch:null,
  reg:[1.8,-1.3],
};

function mk(w,h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function setup(canvas){
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d', { alpha:false });
  R.A = mk(2,2); R.actx = R.A.getContext('2d');
  R.B = mk(2,2); R.bctx = R.B.getContext('2d');
  buildTextures();
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 120));
}

export function resize(){
  const vw = Math.max(320, innerWidth), vh = Math.max(300, innerHeight);
  // Cap the backing store: full-canvas blend passes are the only expensive
  // thing here, and beyond ~1700px they buy nothing you can see.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.min(Math.round(vw * dpr), 1700);
  const h = Math.round(w * vh / vw);

  R.w = w; R.h = h;
  R.canvas.width = w; R.canvas.height = h;
  R.canvas.style.width = vw + 'px'; R.canvas.style.height = vh + 'px';
  R.A.width = w; R.A.height = h;
  R.B.width = w; R.B.height = h;

  R.worldW = viewWidthFor(vw / vh);
  R.scale  = w / R.worldW;
  R.worldH = h / R.scale;
  R.viewH  = Math.min(R.worldH, 620);
  // sit the play band a little below centre on tall screens: sky reads
  // as poster margin, floor does not
  R.viewTop = (R.worldH - R.viewH) * .62;
  R.reg = [Math.max(1.4, dpr * 1.1), -Math.max(1, dpr * .8)];
}

/* ── textures: built once, reused forever ───────────────── */
function buildTextures(){
  // print grain
  const g = mk(200,200), gx = g.getContext('2d');
  const img = gx.createImageData(200,200);
  for (let i=0;i<img.data.length;i+=4){
    const n = 118 + (Math.random()*140 - 70);
    img.data[i] = img.data[i+1] = img.data[i+2] = n;
    img.data[i+3] = 255;
  }
  gx.putImageData(img,0,0);
  R.grain = R.ctx.createPattern(g,'repeat');

  // halftone dots — for tonal masses (dunes, moon, static)
  const t = mk(9,9), tx = t.getContext('2d');
  tx.fillStyle = '#000';
  tx.beginPath(); tx.arc(4.5,4.5,2.35,0,7); tx.fill();
  R.halftone = tx;
  R._halftoneTile = t;

  // fine diagonal hatch — mid-tone without the dot moiré
  const hh = mk(6,6), hx = hh.getContext('2d');
  hx.strokeStyle = '#000'; hx.lineWidth = 1.1;
  hx.beginPath(); hx.moveTo(-1,7); hx.lineTo(7,-1); hx.moveTo(2,10); hx.lineTo(10,2); hx.stroke();
  R._hatchTile = hh;
}

/* Patterns are created against the layer ctx that will use them. */
export function halftoneFor(ctx, color, scale=1){
  const p = ctx.createPattern(tinted(R._halftoneTile, color), 'repeat');
  if (p.setTransform && scale !== 1){
    p.setTransform(new DOMMatrix([scale,0,0,scale,0,0]));
  }
  return p;
}
export function hatchFor(ctx, color){
  return ctx.createPattern(tinted(R._hatchTile, color), 'repeat');
}
const tintCache = new Map();
function tinted(tile, color){
  const key = tile.width + ':' + color;
  let c = tintCache.get(key);
  if (!c){
    c = mk(tile.width, tile.height);
    const x = c.getContext('2d');
    x.drawImage(tile,0,0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0,0,c.width,c.height);
    tintCache.set(key,c);
    if (tintCache.size > 40) tintCache.delete(tintCache.keys().next().value);
  }
  return c;
}

/* ── frame lifecycle ────────────────────────────────────── */
export function begin(pal){
  R.inkA = pal.ink; R.inkB = pal.duo; R.paper = pal.paper; R.dark = pal.dark;

  for (const ctx of [R.actx, R.bctx]){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,R.w,R.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setTransform(R.scale,0,0,R.scale,0,0);
  }
  R.actx.fillStyle = R.actx.strokeStyle = pal.ink;
  R.bctx.fillStyle = R.bctx.strokeStyle = pal.duo;
}

/* Run a draw routine against both plates in turn.
   fn(ctx, k) — k=0 is the dark plate, k=1 the fluoro plate. */
export function eachLayer(fn){
  fn(R.actx, 0);
  fn(R.bctx, 1);
}

export function finish(shakeX = 0, shakeY = 0, grainAmt = .14){
  const c = R.ctx;
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.fillStyle = R.paper;
  c.fillRect(0,0,R.w,R.h);

  const blend = R.dark ? 'screen' : 'multiply';
  c.globalCompositeOperation = blend;
  c.drawImage(R.A, shakeX, shakeY);
  c.drawImage(R.B, shakeX + R.reg[0], shakeY + R.reg[1]);

  // paper grain
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = grainAmt;
  c.fillStyle = R.grain;
  c.save();
  c.translate((Math.random()*40|0) - 20, (Math.random()*40|0) - 20);
  c.fillRect(20,20,R.w+40,R.h+40);
  c.restore();

  // press vignette — ink always sits heavier at the edges of a pull
  c.globalCompositeOperation = R.dark ? 'multiply' : 'multiply';
  c.globalAlpha = .22;
  const g = c.createRadialGradient(R.w/2, R.h/2, R.h*.35, R.w/2, R.h/2, R.h*1.05);
  g.addColorStop(0,'rgba(255,255,255,0)');
  g.addColorStop(1, R.dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.6)');
  c.fillStyle = g; c.fillRect(0,0,R.w,R.h);

  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

/* ── tiny drawing helpers ───────────────────────────────── */
export function rrect(ctx,x,y,w,h,r){
  if (ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); return; }
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
export const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
export const lerp  = (a,b,t) => a + (b-a) * t;
export const rand  = (a,b) => a + Math.random()*(b-a);
export const pick  = arr => arr[(Math.random()*arr.length)|0];
