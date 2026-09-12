"""Prove the browser runs the same world the policy was trained in.

The page cannot import ``physics.py``; its dynamics are a hand transcription
into JavaScript.  A transcription bug there would not crash anything -- it
would just quietly hand the fly a world it has never seen, and the trained
stroke would fall apart for reasons impossible to see on screen.

So: extract the marked physics block out of the page, drive it and the Python
original with the same random rollouts, and compare trajectories step by step.

    python test_parity.py --policy runs/S11.npy
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

import physics as P
import policy
from env import decode, observe, reset
from export_policy import constants

HARNESS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const block = html.split('/* PHYSICS-BEGIN */')[1].split('/* PHYSICS-END */')[0];
const bundle = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const cases = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));

const make = new Function('C', 'NET', block +
  '; return {stepBall, paddleHit, stepFly, paddleNormal, runPolicy, v3};');
const M = make(bundle.constants, bundle.policy);
const DT = bundle.constants.DT;

const out = cases.map(c => {
  const ball = {p: M.v3(...c.bp), v: M.v3(...c.bv)};
  const fly = {p: M.v3(...c.fp), v: M.v3(...c.fv)};
  const aim = M.v3(c.aim[0], c.aim[1], 0);
  let hit = 0;
  const trace = [];
  for (let k = 0; k < c.steps; k++) {
    const cmd = M.runPolicy(ball, fly, aim, hit);
    M.stepFly(fly, cmd.thrust, DT);
    const n = M.paddleNormal(cmd.az, cmd.el);
    if (!hit && ball.p.x < 0) {
      if (M.paddleHit(ball, fly.p, n, fly.v, cmd.swing, bundle.constants.PADDLE_R, DT)) hit = 1;
    }
    M.stepBall(ball, DT);
    trace.push([ball.p.x, ball.p.y, ball.p.z, fly.p.x, fly.p.y, fly.p.z,
                cmd.raw[0], cmd.raw[3], cmd.raw[5], hit]);
  }
  return trace;
});
fs.writeFileSync(process.argv[5], JSON.stringify(out));
"""


def python_side(theta, cases):
    fn = policy.single(theta)
    traces = []
    for c in cases:
        bp = np.array([c['bp']]); bv = np.array([c['bv']])
        fp = np.array([c['fp']]); fv = np.array([c['fv']])
        aim = np.array([c['aim']])
        hit = np.zeros(1, bool)
        tr = []
        for _ in range(c['steps']):
            act = fn(observe(bp, bv, fp, fv, aim, hit))
            thrust, az, el, swing = decode(act)
            fp, fv = P.step_fly(fp, fv, thrust)
            nrm = P.paddle_normal(az, el)
            if not hit[0] and bp[0, 0] < 0:
                bp, bv, jh = P.paddle_hit(bp, bv, fp, nrm, fv, swing, P.PADDLE_R, ~hit)
                hit |= jh
            bp, bv, *_ = P.step_ball(bp, bv)
            tr.append([bp[0, 0], bp[0, 1], bp[0, 2], fp[0, 0], fp[0, 1], fp[0, 2],
                       act[0, 0], act[0, 3], act[0, 5], float(hit[0])])
        traces.append(tr)
    return np.array(traces)


def main(policy_path, template, n_cases, steps):
    theta = np.load(policy_path)
    rng = np.random.default_rng(1234)

    bp, bv, fp, fv, aim = reset(rng, n_cases)
    cases = [{'bp': bp[i].tolist(), 'bv': bv[i].tolist(), 'fp': fp[i].tolist(),
              'fv': fv[i].tolist(), 'aim': aim[i].tolist(), 'steps': steps}
             for i in range(n_cases)]

    bundle = {'policy': policy.to_json(theta), 'constants': constants()}

    with tempfile.TemporaryDirectory() as tmp:
        j = lambda name: os.path.join(tmp, name)
        open(j('harness.js'), 'w').write(HARNESS)
        json.dump(bundle, open(j('bundle.json'), 'w'))
        json.dump(cases, open(j('cases.json'), 'w'))
        r = subprocess.run(['node', j('harness.js'), template, j('bundle.json'),
                            j('cases.json'), j('out.json')],
                           capture_output=True, text=True)
        if r.returncode:
            print(r.stdout, r.stderr)
            raise SystemExit('node harness failed')
        js = np.array(json.load(open(j('out.json'))))

    py = python_side(theta, cases)

    labels = ['ball x', 'ball y', 'ball z', 'fly x', 'fly y', 'fly z',
              'thrust x', 'yaw out', 'swing out', 'hit flag']
    err = np.abs(js - py)
    print(f'{n_cases} rallies x {steps} steps, JavaScript vs Python\n')
    print(f'{"channel":10s} {"max abs err":>13s}')
    worst = 0.0
    for i, lab in enumerate(labels):
        e = err[:, :, i].max()
        worst = max(worst, e)
        print(f'{lab:10s} {e:13.3e}')

    contact_py = py[:, -1, 9].sum()
    contact_js = js[:, -1, 9].sum()
    print(f'\ncontacts: python {contact_py:.0f}/{n_cases}, javascript {contact_js:.0f}/{n_cases}')

    ok = worst < 1e-9 and contact_py == contact_js
    print('\n' + ('PASS -- the browser is running the training world bit for bit'
                  if ok else f'FAIL -- worst channel error {worst:.3e}'))
    return 0 if ok else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--policy', default='runs/S11.npy')
    ap.add_argument('--template', default='game.template.html')
    ap.add_argument('--cases', type=int, default=12)
    ap.add_argument('--steps', type=int, default=180)
    a = ap.parse_args()
    sys.exit(main(a.policy, a.template, a.cases, a.steps))
