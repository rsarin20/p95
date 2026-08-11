// The jerboa.
//
// Drawn as a silhouette, procedurally, from about a dozen shapes. There is no
// sprite sheet: the pose is a handful of numbers, and the numbers come from the
// simulation, so the animation is always exactly in phase with the physics —
// the legs extend on the tick the jump begins, never a frame later.
//
// Everything is drawn back to front, each part filled near-black and then
// rim-stroked with the accent. Because a later fill covers an earlier stroke,
// that ordering alone produces a clean outline with no internal seams, which is
// what makes the whole animal read as one shape against the sky.

import { TICKS_UP, TICKS_FLOAT, TICKS_AIR } from '../core/config.js';
import { rgba } from './palette.js';

const BODY = '#04050b';

/** Cyclic keyframes: lean → compress → extend → lean. */
const RUN_KEYS = [
  { at: 0.0, bob: 1.2, fold: 0.45, lean: 0.1, tail: 0.2, stretch: 0 },
  { at: 0.25, bob: 0.0, fold: 1.0, lean: 0.17, tail: -0.15, stretch: -1 },
  { at: 0.55, bob: 3.2, fold: 0.0, lean: -0.03, tail: 0.45, stretch: 1 },
  { at: 0.8, bob: 2.0, fold: 0.2, lean: 0.07, tail: 0.3, stretch: 0.35 },
];

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function sampleRun(p) {
  const n = RUN_KEYS.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (p >= RUN_KEYS[k].at) i = k;
  const a = RUN_KEYS[i];
  const b = RUN_KEYS[(i + 1) % n];
  const span = (b.at <= a.at ? b.at + 1 : b.at) - a.at;
  const t = smoothstep(Math.min(1, (p - a.at) / span));
  return {
    bob: a.bob + (b.bob - a.bob) * t,
    fold: a.fold + (b.fold - a.fold) * t,
    lean: a.lean + (b.lean - a.lean) * t,
    tail: a.tail + (b.tail - a.tail) * t,
    stretch: a.stretch + (b.stretch - a.stretch) * t,
  };
}

/**
 * Turn simulation state into a pose.
 *
 * @param {object} s
 * @param {boolean} s.onGround
 * @param {number}  s.airTicks    ticks since take-off
 * @param {number}  s.runPhase    0..1 through the run cycle
 * @param {number}  s.sinceLand   ticks since the last touchdown
 * @param {number}  s.speedN      0..1 normalised speed
 * @param {number}  s.deadT       0..1 how far into the death freeze
 */
export function poseFor(s) {
  const run = sampleRun(s.runPhase);

  let tuck = 0;
  let earLift = 0;
  let pitch = 0;
  let fold = run.fold;
  let bob = run.bob;
  let tail = run.tail;
  let stretch = run.stretch;

  if (!s.onGround) {
    const a = s.airTicks;
    // Legs snap up under the body just after take-off...
    const gather = Math.min(1, a / 7);
    // ...and reach back down for the ground on the way in.
    const reach = Math.max(0, (a - (TICKS_AIR - 16)) / 16);
    tuck = gather * (1 - smoothstep(Math.min(1, reach)));
    fold = 0.3 + 0.7 * tuck;
    bob = 0;
    stretch = 0.5 - tuck * 1.2;

    // At the apex the world goes quiet for a moment and the ears drift up.
    const floatStart = TICKS_UP - 6;
    const floatEnd = TICKS_UP + TICKS_FLOAT + 6;
    if (a > floatStart && a < floatEnd) {
      const f = (a - floatStart) / (floatEnd - floatStart);
      earLift = Math.sin(f * Math.PI);
    }

    // Nose up on the climb, down into the fall.
    pitch = a < TICKS_UP ? -0.14 * (1 - a / TICKS_UP) : 0.16 * Math.min(1, (a - TICKS_UP) / 40);
    tail = 0.5 - 0.9 * Math.min(1, a / TICKS_AIR);
  }

  // Squash on touchdown, resolving just as the run cycle picks up again.
  const squash = s.onGround ? Math.max(0, 1 - s.sinceLand / 9) : 0;

  // Ears stream backward the faster the desert moves.
  const earTrail = 0.5 * s.speedN;

  return {
    fold,
    bob,
    tuck,
    earLift,
    earTrail,
    pitch,
    tail,
    stretch,
    squash,
    lean: run.lean,
    dead: s.deadT || 0,
  };
}

function ellipse(ctx, x, y, rx, ry, rot) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/**
 * Head, neck, back, rump, haunch and belly as a single closed outline.
 *
 * One path rather than a stack of ellipses, because a stack leaves seams: the
 * rim stroke of a separate thigh reads as a line drawn *across* the animal, and
 * at this size that one stray line is the difference between a creature and a
 * diagram. The haunch is part of the body here, so the only things that break
 * the outline are the parts that genuinely stick out — legs, ears, tail.
 */
function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(16.4, 14.1); // nose
  ctx.bezierCurveTo(15.2, 16.4, 13.4, 18.2, 11.3, 18.3); // forehead
  ctx.bezierCurveTo(9.8, 18.3, 8.9, 17.4, 8.3, 16.3); // behind the ears
  ctx.bezierCurveTo(6.4, 18.1, 2.4, 19.1, -1.4, 18.8); // back
  ctx.bezierCurveTo(-5.2, 18.5, -8.2, 16.6, -9.4, 13.2); // rump
  ctx.bezierCurveTo(-10.4, 10.2, -9.6, 7.2, -7.6, 5.6); // haunch, down the back
  ctx.bezierCurveTo(-5.8, 4.2, -3.4, 4.4, -2.2, 6.2); // under the haunch
  ctx.bezierCurveTo(-0.6, 8.4, 2.2, 9.6, 5.6, 10.2); // belly
  ctx.bezierCurveTo(8.4, 10.7, 10.8, 11.6, 12.6, 12.8); // chest into the chin
  ctx.bezierCurveTo(14.1, 13.1, 15.4, 13.5, 16.4, 14.1); // snout
  ctx.closePath();
}

/**
 * Draw the jerboa.
 *
 * The context must already be translated to the jerboa's contact point with
 * the ground and scaled so that one world unit is one unit here, with +y up.
 */
export function drawJerboa(ctx, pose, accent, glow) {
  const rim = rgba(accent, 0.55 * glow + 0.26);
  const rimSoft = rgba(accent, 0.34 * glow + 0.14);

  ctx.save();

  // Landing squash acts about the feet, so the animal flattens onto the ground
  // rather than sinking through it.
  ctx.scale(1 + 0.18 * pose.squash, 1 - 0.22 * pose.squash);

  const bob = pose.bob;
  const fold = pose.fold;
  const tuck = pose.tuck;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // --- hind leg -----------------------------------------------------------
  // Drawn in ground space rather than with the body, because the foot and the
  // body do different things: the hip rises and falls through the stride while
  // the foot stays planted where it landed. Riding the body's bob would lift
  // the whole leg off the ground on every step.
  //
  // It is also drawn before the body so the body's fill swallows the thigh, and
  // only the part that genuinely projects keeps an outline.
  const hipX = -5.6;
  const hipY = 9.4 + bob;
  const ankleX = -5.2 + fold * 3.2 + tuck * 5.2;
  const ankleY = 1.2 + fold * 0.4 + tuck * 5.0;
  const kneeX = -5.4 + fold * 1.4 + tuck * 2.8;
  const kneeY = ankleY + (hipY - ankleY) * 0.44;

  // Planted, the foot lies flat along the ground. Tucked, it folds up under
  // the belly and all but disappears — which is exactly what a jerboa's does.
  const footAngle = -fold * 0.18 + tuck * 1.5;
  const footLen = 8.6 - tuck * 2;
  const toeX = ankleX + Math.cos(footAngle) * footLen;
  const toeY = ankleY + Math.sin(footAngle) * footLen;

  ctx.strokeStyle = BODY;
  ctx.lineWidth = 3.4; // thigh — thick; this animal is mostly leg
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.stroke();

  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(ankleX, ankleY);
  ctx.stroke();
  ctx.strokeStyle = rimSoft;
  ctx.lineWidth = 0.45;
  ctx.stroke();

  // The long foot — much of the silhouette hangs off this one line.
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(ankleX, ankleY);
  ctx.lineTo(toeX, toeY);
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Body lean pivots around the hips, not the feet — pivoting at the feet
  // swings the head through a much bigger arc than a running animal's ever does.
  ctx.translate(0, 11 + bob);
  ctx.rotate(-(pose.lean + pose.pitch + pose.dead * 0.55));
  ctx.scale(1 + 0.045 * pose.stretch, 1 - 0.035 * pose.stretch);
  ctx.translate(0, -11);

  // --- tail ---------------------------------------------------------------
  // Long, thin, and always a beat behind the body. Most of the personality.
  const tw = pose.tail;
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8.4, 13.4);
  ctx.bezierCurveTo(-13.5, 13.6 + tw * 1.5, -17.5, 11.6 + tw * 3, -20.2, 14.6 + tw * 4);
  ctx.stroke();
  ctx.strokeStyle = rimSoft;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = BODY;
  ellipse(ctx, -21.2, 15.5 + tw * 4.4, 3.3, 1.9, -0.5 + tw * 0.3);
  ctx.fill();
  ctx.strokeStyle = rimSoft;
  ctx.lineWidth = 0.45;
  ctx.stroke();

  // --- front paw ----------------------------------------------------------
  // Tiny, and mostly an excuse to break the chest line.
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(8.2, 11.4);
  ctx.quadraticCurveTo(10.2, 10.2, 10.4, 8.6 + fold * 0.9 + tuck * 2.4);
  ctx.stroke();
  ctx.strokeStyle = rimSoft;
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // --- body ---------------------------------------------------------------
  ctx.fillStyle = BODY;
  bodyPath(ctx);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.75;
  ctx.stroke();

  // --- ears ---------------------------------------------------------------
  // Enormous, and the first thing on the animal to react to anything.
  const baseX = 10.2;
  const baseY = 17.2;
  const lean = 0.34 + pose.earTrail - pose.earLift * 0.6 + pose.dead * 0.8;
  const len = 9.6 + pose.earLift * 1.2;

  for (const [spread, near] of [
    [-0.1, false],
    [0.17, true],
  ]) {
    const ang = lean + spread;
    const cx = baseX - Math.sin(ang) * (len / 2) - (near ? 0 : 0.5);
    const cy = baseY + Math.cos(ang) * (len / 2);
    ctx.fillStyle = BODY;
    ellipse(ctx, cx, cy, 1.55, len / 2, ang);
    ctx.fill();
    ctx.strokeStyle = near ? rim : rimSoft;
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }

  // A single catchlight. The only part of the animal that is not silhouette,
  // and the reason it looks alive rather than cut out of paper.
  ctx.fillStyle = rgba(accent, pose.dead ? 0.1 : 0.62 * glow + 0.28);
  ellipse(ctx, 12.4, 15.4, 0.62, 0.62, 0);
  ctx.fill();

  ctx.restore();
}

/** How far the run cycle advances per world unit travelled. */
export function strideFor(speedN) {
  return 1 / (44 + 24 * speedN);
}
