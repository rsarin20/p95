"""Assemble the ping-pong scene around the real flybody model.

``fruitfly.xml`` ships as the animal alone.  Here we use MuJoCo's spec API to
graft on a fly-scale table, a net, a ball, and a paddle rigidly mounted on the
thorax -- without touching the upstream file, so the body stays exactly as
DeepMind and Janelia published it.
"""

import os

import mujoco
import numpy as np

import physics as P

DEFAULT_MENAGERIE = os.environ.get('FLYBODY_DIR', '/home/user/menagerie/flybody')


def build(menagerie=DEFAULT_MENAGERIE):
    """Return ``(model, ids)`` for the full ping-pong scene."""
    spec = mujoco.MjSpec.from_file(os.path.join(menagerie, 'fruitfly.xml'))

    # The paddle the fly holds, on the front of the thorax, face normal +x.
    paddle = spec.body('thorax').add_geom()
    paddle.name = 'paddle'
    paddle.type = mujoco.mjtGeom.mjGEOM_CYLINDER
    paddle.size = [P.PADDLE_R, 0.012, 0.0]
    paddle.pos = [0.17, 0.0, 0.02]
    paddle.quat = [0.70710678, 0.0, 0.70710678, 0.0]   # lay the disc face-on to +x
    paddle.rgba = [0.80, 0.18, 0.18, 1.0]
    paddle.mass = 1e-5
    paddle.contype, paddle.conaffinity = 2, 4

    w = spec.worldbody

    table = w.add_geom()
    table.name = 'table'
    table.type = mujoco.mjtGeom.mjGEOM_BOX
    table.size = [P.HALF_LEN, P.HALF_WID, 0.05]
    table.pos = [0.0, 0.0, P.TABLE_Z - 0.05]
    table.rgba = [0.09, 0.28, 0.22, 1.0]
    table.contype, table.conaffinity = 4, 2
    table.solref = [0.0004, 1.0]

    net = w.add_geom()
    net.name = 'net'
    net.type = mujoco.mjtGeom.mjGEOM_BOX
    net.size = [0.004, P.HALF_WID, P.NET_H / 2]
    net.pos = [0.0, 0.0, P.TABLE_Z + P.NET_H / 2]
    net.rgba = [0.9, 0.9, 0.95, 0.55]
    net.contype, net.conaffinity = 4, 2

    ball_body = w.add_body()
    ball_body.name = 'ball'
    ball_body.pos = [1.5, 0.0, 0.8]
    ball_body.add_freejoint()
    ball = ball_body.add_geom()
    ball.name = 'ball'
    ball.type = mujoco.mjtGeom.mjGEOM_SPHERE
    ball.size = [P.BALL_R, 0.0, 0.0]
    ball.rgba = [1.0, 0.62, 0.0, 1.0]
    ball.mass = 5e-5
    ball.contype, ball.conaffinity = 2, 4
    ball.solref = [0.0004, 1.0]

    model = spec.compile()
    ids = {
        'thorax': mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, 'thorax'),
        'ball': mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, 'ball'),
        'ball_qpos': model.jnt_qposadr[model.body_jntadr[
            mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, 'ball')]],
        'ball_qvel': model.jnt_dofadr[model.body_jntadr[
            mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, 'ball')]],
    }
    ids['fly_mass'] = float(model.body_subtreemass[ids['thorax']])

    wing_acts = [i for i in range(model.nu)
                 if (mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_ACTUATOR, i) or '')
                 .startswith('wing')]
    ids['wing_acts'] = wing_acts
    return model, ids


def place_fly(model, data, pos, vel=(0, 0, 0)):
    """Put the fly's free joint at a world pose, wings level, nose towards +x."""
    data.qpos[0:3] = pos
    data.qpos[3:7] = [1.0, 0.0, 0.0, 0.0]
    data.qvel[0:3] = vel
    data.qvel[3:6] = 0.0


def place_ball(model, data, ids, pos, vel):
    a, v = ids['ball_qpos'], ids['ball_qvel']
    data.qpos[a:a + 3] = pos
    data.qpos[a + 3:a + 7] = [1.0, 0.0, 0.0, 0.0]
    data.qvel[v:v + 3] = vel
    data.qvel[v + 3:v + 6] = 0.0


def drive_fly(model, data, ids, thrust, want_normal, kp=2.5e-4, kd=6e-6):
    """Apply the policy's flight command to the real body.

    Translation: the commanded acceleration plus the same body drag the reduced
    model uses, as an external force on the thorax.  Attitude: a PD controller
    that swings the fly's nose (its +x axis) onto the paddle normal the policy
    asked for -- which is how a real fly steers, by reorienting its whole body.
    """
    tid = ids['thorax']
    m = ids['fly_mass']
    rot = data.xmat[tid].reshape(3, 3)

    v = data.qvel[0:3]                      # free-joint linear velocity, world frame
    data.xfrc_applied[tid, 0:3] = m * (np.asarray(thrust) * P.A_MAX - P.FLY_DRAG * v)

    omega = rot @ data.qvel[3:6]            # free-joint angular velocity is body-local
    nose = rot[:, 0]
    data.xfrc_applied[tid, 3:6] = kp * np.cross(nose, want_normal) - kd * omega


def flap(model, data, ids, t, hz=220.0, amp=0.9):
    """A canned wingbeat, so the animal on screen behaves like an animal.

    Lift comes from the commanded force above; this drives the real wing
    actuators at a plausible Drosophila wingbeat frequency for fidelity.
    """
    for i in ids['wing_acts']:
        data.ctrl[i] = amp * np.sin(2 * np.pi * hz * t)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--menagerie', default=DEFAULT_MENAGERIE)
    ap.add_argument('--dump')
    a = ap.parse_args()
    model, ids = build(a.menagerie)
    print(f'nq={model.nq} nv={model.nv} nu={model.nu} nbody={model.nbody} '
          f'ngeom={model.ngeom} fly_mass={ids["fly_mass"]:.3e} g '
          f'wing_actuators={len(ids["wing_acts"])}')
    if a.dump:
        spec = mujoco.MjSpec.from_file(os.path.join(a.menagerie, 'fruitfly.xml'))
        open(a.dump, 'w').write(spec.to_xml())
        print('dumped', a.dump)
