/* ══ PARTICLES ════════════════════════════════════════════
   Everything here is halftone-flavoured: dots, shards and
   short ink strokes. No soft glows — this is a print.
   ════════════════════════════════════════════════════════ */
import { rand } from './render.js';

const P = [];
const MAX = 260;

function add(o){ if (P.length < MAX) P.push(o); }

export function clear(){ P.length = 0; }

export function dust(x, y){
  for (let i = 0; i < 3; i++)
    add({ k:0, x:x+rand(-3,3), y:y+rand(-2,1), vx:rand(-38,-95), vy:rand(-46,-6),
          r:rand(1.6,3.6), life:rand(.28,.5), t:0, ink:0 });
}
export function shards(x, y, n = 12, ink = 1){
  for (let i = 0; i < n; i++){
    const a = rand(-Math.PI, .2);
    const s = rand(90, 320);
    add({ k:1, x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:rand(2.2,5.4),
          rot:rand(0,7), vr:rand(-14,14), life:rand(.45,.85), t:0, ink });
  }
}
export function sparkle(x, y){
  for (let i = 0; i < 7; i++){
    const a = rand(0, 7), s = rand(60, 210);
    add({ k:2, x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 40, r:rand(1.4,3),
          life:rand(.3,.55), t:0, ink:1 });
  }
}
export function splat(x, y){
  for (let i = 0; i < 26; i++){
    const a = rand(-Math.PI, .4), s = rand(60, 460);
    add({ k:1, x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:rand(1.8,6.5),
          rot:rand(0,7), vr:rand(-20,20), life:rand(.5,1.2), t:0, ink:i%3?0:1 });
  }
}
export function streak(x, y, len){
  add({ k:3, x, y, len, life:.26, t:0, ink:1 });
}
export function ring(x, y){
  add({ k:4, x, y, r:6, life:.42, t:0, ink:1 });
}

export function update(dt, scroll){
  for (let i = P.length - 1; i >= 0; i--){
    const p = P[i];
    p.t += dt;
    if (p.t >= p.life){ P.splice(i,1); continue; }
    p.x -= scroll * dt;
    if (p.k !== 4){
      p.x += (p.vx||0) * dt;
      p.y += (p.vy||0) * dt;
      if (p.k === 1) p.vy += 900 * dt;
      if (p.k === 0) { p.vy += 120*dt; p.vx *= 1 - 1.6*dt; }
      if (p.k === 2) p.vy += 320 * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    if (p.x < -80) P.splice(i,1);
  }
}

export function draw(ctx, k){
  for (const p of P){
    if (p.ink !== k) continue;
    const u = p.t / p.life, a = 1 - u*u;
    ctx.globalAlpha = a;
    switch (p.k){
      case 0:  // dust puff
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + u*1.4), 0, 7); ctx.fill();
        break;
      case 1:  // debris shard
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*.8);
        ctx.restore();
        break;
      case 2:  // signal spark
        ctx.save(); ctx.translate(p.x,p.y);
        ctx.fillRect(-p.r*.35, -p.r*1.5, p.r*.7, p.r*3);
        ctx.fillRect(-p.r*1.5, -p.r*.35, p.r*3, p.r*.7);
        ctx.restore();
        break;
      case 3:  // speed line
        ctx.globalAlpha = a * .55;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y); ctx.stroke();
        break;
      case 4:  // shock ring
        ctx.globalAlpha = a * .8;
        ctx.lineWidth = 3 * (1-u);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + u * 62, 0, 7); ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
}
