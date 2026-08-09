/* ══ AUDIO ════════════════════════════════════════════════
   No files. A handful of oscillators through a shared lowpass,
   voiced like a cheap radio: square blips, filtered noise, and
   one genuinely triumphant chord when you connect.
   ════════════════════════════════════════════════════════ */

let ac = null, master = null, filt = null, noiseBuf = null;
let muted = localStorage.getItem('pango.mute') === '1';

function ctx(){
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  filt = ac.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 5200; filt.Q.value = .6;
  master = ac.createGain();
  master.gain.value = muted ? 0 : .5;
  filt.connect(master); master.connect(ac.destination);

  const n = ac.sampleRate * .5;
  noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

export function unlock(){ const c = ctx(); if (c && c.state === 'suspended') c.resume(); }
export function isMuted(){ return muted; }
export function toggleMute(){
  muted = !muted;
  localStorage.setItem('pango.mute', muted ? '1' : '0');
  if (master) master.gain.setTargetAtTime(muted ? 0 : .5, ac.currentTime, .02);
  return muted;
}

function tone(freq, dur, { type = 'square', vol = .18, to = null, delay = 0, curve = 'exp' } = {}){
  const c = ctx(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) (curve === 'exp' ? o.frequency.exponentialRampToValueAtTime : o.frequency.linearRampToValueAtTime).call(o.frequency, Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .008);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(filt);
  o.start(t); o.stop(t + dur + .02);
}

function noise(dur, { vol = .18, freq = 1400, q = 1, delay = 0, sweep = null } = {}){
  const c = ctx(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(freq, t); bp.Q.value = q;
  if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(filt);
  s.start(t); s.stop(t + dur + .02);
}

export const start     = () => { unlock(); tone(300, .10, { to: 620, vol: .14 }); };
export const jump      = () => tone(430, .12, { to: 760, vol: .13 });
export const land      = () => noise(.07, { vol: .07, freq: 700, sweep: 260 });
export const near      = () => tone(1180, .07, { type: 'triangle', vol: .10 });
export const milestone = () => { tone(880, .07, { vol: .10 }); tone(1320, .09, { vol: .09, delay: .07 }); };
export const zone      = () => { tone(196, .5, { type: 'sawtooth', to: 294, vol: .08 }); noise(.4, { vol: .06, freq: 900, sweep: 2400 }); };
export const smash     = () => { noise(.16, { vol: .22, freq: 2200, sweep: 380, q: .7 }); tone(160, .14, { to: 60, vol: .14 }); };
export const slam      = () => { noise(.22, { vol: .24, freq: 900, sweep: 120, q: .5 }); tone(110, .2, { to: 44, vol: .16 }); };
export const offline   = () => { tone(660, .45, { type: 'sawtooth', to: 90, vol: .12 }); noise(.45, { vol: .10, freq: 2600, sweep: 200 }); };
export const die       = () => { noise(.32, { vol: .26, freq: 1800, sweep: 140, q: .6 }); tone(340, .34, { to: 70, vol: .16, type: 'square' }); };

export function pickup(fill){
  // pitch climbs with the meter — you can hear how close you are
  tone(520 + fill * 700, .09, { type: 'triangle', vol: .13, to: 660 + fill * 900 });
}

export function connect(){
  // a major add9 stack, arriving all at once
  [261.6, 392, 523.3, 659.3, 784].forEach((f, i) =>
    tone(f, .9 - i * .06, { type: 'triangle', vol: .11, delay: i * .045 }));
  noise(.6, { vol: .12, freq: 300, sweep: 4800, q: .8 });
}
