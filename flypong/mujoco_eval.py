"""Check the trained policy against the real fly, in MuJoCo.

Training runs on a reduced flight model: the fly as a point mass with drag and
a commanded acceleration.  That is what makes millions of rallies affordable,
but it is only worth anything if it stands in honestly for the real animal.
Two tests:

  1. Open-loop replay.  Record the thrust commands from a rally, play the exact
     same commands into the full 109-DoF body, and measure how far the two
     trajectories drift apart.

  2. Closed-loop.  Put the real body in the loop -- the policy sees the MuJoCo
     fly's own position and velocity, and swings the paddle mounted on its
     thorax -- and count how many returns still land.

    python mujoco_eval.py --policy runs/S11.npy --rallies 24
"""

import argparse
import json

import mujoco
import numpy as np

import physics as P
import policy
import scene
from env import READY, decode, observe, reset, to_human_half


def reduced_rally(fn, rng, spread=1.0):
    """One rally in the training dynamics.  Returns the full command trace."""
    bp, bv, fp, fv, aim = reset(rng, 1, spread)
    hit = np.zeros(1, bool)
    rec = {'thrust': [], 'normal': [], 'swing': [], 'fly': [], 'flyv': [], 'ball': []}
    outcome, land = 'no-contact', None

    for _ in range(260):
        act = fn(observe(bp, bv, fp, fv, aim, hit))
        thrust, az, el, swing = decode(act)
        nrm = P.paddle_normal(az, el)

        rec['thrust'].append(thrust[0].copy())
        rec['normal'].append(nrm[0].copy())
        rec['swing'].append(float(swing[0]))
        rec['fly'].append(fp[0].copy())
        rec['flyv'].append(fv[0].copy())
        rec['ball'].append(bp[0].copy())

        fp, fv = P.step_fly(fp, fv, thrust)
        if not hit[0] and bp[0, 0] < 0.0:
            bp, bv, jh = P.paddle_hit(bp, bv, fp, nrm, fv, swing, P.PADDLE_R, ~hit)
            hit |= jh
        bp, bv, bounced, netted, fell = P.step_ball(bp, bv)

        if hit[0] and bounced[0]:
            outcome = 'returned-in' if bp[0, 0] > 0 else 'own-half'
            land = bp[0, :2].copy()
            break
        if netted[0] and hit[0]:
            outcome = 'into-net'; break
        if fell[0]:
            outcome = 'returned-out' if hit[0] else 'no-contact'
            land = bp[0, :2].copy()
            break
        if not hit[0] and bp[0, 0] < fp[0, 0] - 0.35:
            outcome = 'no-contact'; break

    rec = {k: np.array(v) for k, v in rec.items()}
    rec.update(outcome=outcome, land=land, start_fly=rec['fly'][0],
               start_vel=rec['flyv'][0],
               start_ball=rec['ball'][0], bv0=bv, aim=aim[0])
    return rec


def first_limit(rec):
    """Index at which a reduced-model *kinematic* limit first bites.

    The training world clamps the fly's speed and fences it onto its own side
    of the net.  Those are rules of the game, not physics, and the MuJoCo body
    has no such fences -- so past this point the two are no longer simulating
    the same problem and comparing them says nothing about the dynamics.
    """
    fp, fv = rec['fly'], rec['flyv']
    sp = np.linalg.norm(fv, axis=1)
    hit = ((fp[:, 2] <= P.FLY_Z_MIN + 1e-9) | (fp[:, 2] >= 2.6 - 1e-9)
           | (fp[:, 0] >= P.FLY_X_MAX - 1e-9)
           | (fp[:, 0] <= -P.HALF_LEN - P.FLY_ROAM + 1e-9)
           | (np.abs(fp[:, 1]) >= P.HALF_WID + P.FLY_ROAM - 1e-9)
           | (sp >= P.V_MAX - 1e-6))
    idx = np.nonzero(hit)[0]
    return int(idx[0]) if len(idx) else len(fp)


def replay_open_loop(model, data, ids, rec, flap_amp=0.0):
    """Feed a recorded command trace to the full body and track where it goes.

    ``flap_amp`` defaults to zero -- wings held level.  The reduced model makes
    a claim about *commanded acceleration*, so the honest test is whether the
    full articulated body, with its 109 coordinates, dangling legs and fluid
    drag, answers a commanded force the way a point mass does.  Driving the
    wings with a canned sinusoid on top would inject aerodynamic force that the
    reduced model never claimed to contain (see ``--flap``).
    """
    mujoco.mj_resetData(model, data)
    if model.nkey:
        mujoco.mj_resetDataKeyframe(model, data, 0)
    # Match the reduced rally's initial velocity, not just its position -- the
    # fly is already moving when the trace starts, and 12 cm/s of unmatched
    # initial velocity is 0.6 cm of drift over a rally all by itself.
    scene.place_fly(model, data, rec['start_fly'], rec['start_vel'])
    scene.place_ball(model, data, ids, [6.0, 0, 6.0], [0, 0, 0])   # park it clear
    mujoco.mj_forward(model, data)

    sub = max(1, int(round(P.DT / model.opt.timestep)))
    traj = []
    t = 0.0
    for k in range(len(rec['thrust'])):
        scene.drive_fly(model, data, ids, rec['thrust'][k], rec['normal'][k])
        for _ in range(sub):
            if flap_amp:
                scene.flap(model, data, ids, t, amp=flap_amp)
            mujoco.mj_step(model, data)
            t += model.opt.timestep
        traj.append(data.subtree_com[ids['thorax']].copy())
    return np.array(traj)


def closed_loop(model, data, ids, fn, rng, spread=1.0, flap_amp=0.0):
    """The real body in the loop: the policy flies the 109-DoF fly."""
    bp, bv, fp0, fv0, aim = reset(rng, 1, spread)

    mujoco.mj_resetData(model, data)
    if model.nkey:
        mujoco.mj_resetDataKeyframe(model, data, 0)
    scene.place_fly(model, data, fp0[0], fv0[0])
    scene.place_ball(model, data, ids, [6.0, 0, 6.0], [0, 0, 0])
    mujoco.mj_forward(model, data)

    sub = max(1, int(round(P.DT / model.opt.timestep)))
    hit = np.zeros(1, bool)
    t = 0.0

    for _ in range(260):
        fp = data.qpos[0:3].reshape(1, 3).copy()
        fv = data.qvel[0:3].reshape(1, 3).copy()

        act = fn(observe(bp, bv, fp, fv, aim, hit))
        thrust, az, el, swing = decode(act)
        nrm = P.paddle_normal(az, el)

        scene.drive_fly(model, data, ids, thrust[0], nrm[0])
        for _ in range(sub):
            if flap_amp:
                scene.flap(model, data, ids, t, amp=flap_amp)
            mujoco.mj_step(model, data)
            t += model.opt.timestep

        fp = data.qpos[0:3].reshape(1, 3).copy()
        fv = data.qvel[0:3].reshape(1, 3).copy()
        if not hit[0] and bp[0, 0] < 0.0:
            bp, bv, jh = P.paddle_hit(bp, bv, fp, nrm, fv, swing, P.PADDLE_R, ~hit)
            hit |= jh
        bp, bv, bounced, netted, fell = P.step_ball(bp, bv)

        if hit[0] and bounced[0]:
            return 'returned-in' if bp[0, 0] > 0 else 'own-half'
        if netted[0] and hit[0]:
            return 'into-net'
        if fell[0]:
            return 'returned-out' if hit[0] else 'no-contact'
        if not hit[0] and bp[0, 0] < fp[0, 0] - 0.35:
            return 'no-contact'
    return 'no-contact'


def main(policy_path, rallies, out, flap):
    theta = np.load(policy_path)
    fn = policy.single(theta)

    model, ids = scene.build()
    data = mujoco.MjData(model)
    print(f'scene: nq={model.nq} nv={model.nv} nu={model.nu} '
          f'ngeom={model.ngeom}  fly mass {ids["fly_mass"] * 1000:.3f} mg')

    # --- test 1: does the reduced body track the real one? -----------------
    rng = np.random.default_rng(7)
    rms, free, lens, rms_flap = [], [], [], []
    for i in range(max(24, rallies)):
        rec = reduced_rally(fn, rng)
        if len(rec['thrust']) < 20:
            continue
        full = replay_open_loop(model, data, ids, rec)
        err = np.linalg.norm((full - full[0]) - (rec['fly'] - rec['fly'][0]), axis=1)
        rms.append(float(np.sqrt((err ** 2).mean())))
        lens.append(len(err) * P.DT)

        k = first_limit(rec)
        if k >= 20:
            free.append(float(np.sqrt((err[:k] ** 2).mean())))

        ff = replay_open_loop(model, data, ids, rec, flap)
        ef = np.linalg.norm((ff - ff[0]) - (rec['fly'] - rec['fly'][0]), axis=1)
        rms_flap.append(float(np.sqrt((ef ** 2).mean())))

    body = 0.301
    print(f'\nopen-loop replay over {len(rms)} rallies ({np.mean(lens) * 1000:.0f} ms each)')
    print(f'  while the reduced model is pure dynamics: {np.mean(free):.4f} cm RMS  '
          f'({np.mean(free) / body * 100:.0f}% of a body length, {len(free)} rallies)')
    print(f'  including its speed cap and side fences:  {np.mean(rms):.4f} cm RMS')
    print('    (those fences are rules of the game; the MuJoCo body has none,')
    print('     so the two stop simulating the same problem once one bites.)')
    print(f'  with a canned 220 Hz wingbeat layered on:  {np.mean(rms_flap):.4f} cm RMS')
    print('    (a naive sinusoidal flap is not lift-neutral in MuJoCo\'s fluid model --')
    print('     real flight needs a learned wing gait, which is what flybody\'s own')
    print('     flight controller provides.)')

    # --- test 2: the real body in the loop ---------------------------------
    rng = np.random.default_rng(21)
    tally = {}
    for _ in range(rallies):
        o = closed_loop(model, data, ids, fn, rng)
        tally[o] = tally.get(o, 0) + 1
    total = sum(tally.values())
    mj_rate = tally.get('returned-in', 0) / total
    print(f'\nclosed-loop on the full body, {total} rallies')
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f'  {k:14s} {v:3d}  {v / total:5.1%}')

    # --- reference: the same policy in the reduced model -------------------
    rng = np.random.default_rng(21)
    red = {}
    for _ in range(400):
        o = reduced_rally(fn, rng)['outcome']
        red[o] = red.get(o, 0) + 1
    red_rate = red.get('returned-in', 0) / sum(red.values())
    print(f'\nsame policy, reduced model: returned-in {red_rate:5.1%} '
          f'(vs {mj_rate:5.1%} on the full body)')

    stats = {
        'rms_divergence_cm': float(np.mean(free)),
        'rms_divergence_all_cm': float(np.mean(rms)),
        'rms_divergence_with_flap_cm': float(np.mean(rms_flap)),
        'unconstrained_rallies': len(free),
        'body_length_cm': 0.301,
        'mujoco_return_rate': mj_rate,
        'train_return_rate': red_rate,
        'mujoco_rallies': total,
        'mujoco_outcomes': tally,
        'model': {'nq': int(model.nq), 'nv': int(model.nv), 'nu': int(model.nu),
                  'ngeom': int(model.ngeom), 'fly_mass_mg': ids['fly_mass'] * 1000},
    }
    with open(out, 'w') as f:
        json.dump(stats, f, indent=1)
    print(f'\nwrote {out}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--policy', default='runs/S11.npy')
    ap.add_argument('--rallies', type=int, default=24)
    ap.add_argument('--out', default='runs/eval.json')
    ap.add_argument('--flap', type=float, default=0.9,
                    help='wingbeat amplitude for the comparison run')
    a = ap.parse_args()
    main(a.policy, a.rallies, a.out, a.flap)
