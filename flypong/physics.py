"""Fly-scale ping-pong dynamics.

Units are centimetres, grams and seconds -- the same convention the DeepMind /
Janelia ``flybody`` MuJoCo model uses (its gravity is ``0 0 -981``).

This module is the single source of truth for the game's physics.  It is
transcribed line-for-line into ``game.js`` for the browser, and the constants
that describe the fly itself are measured from the real ``fruitfly.xml`` model
(see ``measure_fly.py``).  Keeping one spec is what lets a policy trained here
be dropped into the browser unchanged.

Every function is vectorised over a leading batch axis so thousands of rallies
can be simulated at once during training.
"""

import numpy as np

# --- court -----------------------------------------------------------------
HALF_LEN = 2.20      # table spans x in [-HALF_LEN, HALF_LEN]
HALF_WID = 1.10      # table spans y in [-HALF_WID, HALF_WID]
TABLE_Z = 0.0        # playing surface height
NET_H = 0.20         # net height above the surface
# The fly defends x < 0.  The human defends x > 0.

# --- ball ------------------------------------------------------------------
G = 981.0            # cm/s^2
BALL_R = 0.060
BALL_DRAG = 2.50     # linear drag, 1/s (Re ~ 40 at these scales)
E_TABLE = 0.80       # normal restitution off the table
MU_TABLE = 0.12      # tangential loss off the table

# --- paddles ---------------------------------------------------------------
PADDLE_R = 0.16      # fly's paddle (about half its wingspan)
HUMAN_PADDLE_R = 0.22
E_PADDLE = 0.85
MU_PADDLE = 0.35
SWING_MAX = 70.0     # cm/s of impulse a full swing adds along the normal
SWING_MIN = -0.35    # ...and the fly can also "give" with the ball to kill pace,
                     # which on a 4 cm table is the difference between a rally
                     # and hitting everything off the end.

# --- fly -------------------------------------------------------------------
FLY_MASS = 9.846e-4  # g, measured from fruitfly.xml
A_MAX = 2200.0       # cm/s^2 commanded acceleration (~2.2 g; Drosophila can
                     # pull several g in a saccade, this is deliberately modest)
FLY_DRAG = 6.0       # 1/s body drag
V_MAX = 110.0        # cm/s speed cap
FLY_Z_MIN = 0.10     # cannot fly through the table
FLY_X_MAX = -0.06    # must stay on its own side of the net
FLY_ROAM = 1.15      # how far past the baseline / sideline it may stray

AZ_MAX = np.deg2rad(75.0)                            # paddle yaw about +x
EL_MIN, EL_MAX = np.deg2rad(-35.0), np.deg2rad(60.0)  # paddle pitch

DT = 0.002           # 500 Hz control and physics rate

# Event codes returned by the rally simulator.
LIVE, SCORED, MISSED, OUT, NET = 0, 1, 2, 3, 4


def step_ball(bp, bv, dt=DT):
    """Advance the ball one tick.

    Returns ``(bp, bv, bounced, hit_net, out)``.  ``out`` means the ball has
    fallen below the table without a legal bounce.
    """
    acc = -BALL_DRAG * bv
    acc[..., 2] -= G
    bv = bv + acc * dt
    new = bp + bv * dt

    # Net: the ball changed sides while still below the tape.
    crossed = np.sign(new[..., 0]) != np.sign(bp[..., 0])
    hit_net = crossed & (new[..., 2] < TABLE_Z + NET_H + BALL_R)

    # Table bounce.
    over_table = (np.abs(new[..., 0]) <= HALF_LEN) & (np.abs(new[..., 1]) <= HALF_WID)
    below = new[..., 2] < TABLE_Z + BALL_R
    bounced = below & over_table & (bv[..., 2] < 0)

    nb = bounced[..., None]
    new = np.where(nb, np.stack([new[..., 0], new[..., 1],
                                 np.full_like(new[..., 2], TABLE_Z + BALL_R)], -1), new)
    bv = np.where(nb, np.stack([bv[..., 0] * (1.0 - MU_TABLE),
                                bv[..., 1] * (1.0 - MU_TABLE),
                                -bv[..., 2] * E_TABLE], -1), bv)

    out = below & ~over_table
    return new, bv, bounced, hit_net, out


def paddle_normal(az, el):
    """Unit normal of a paddle face from yaw/pitch, pointing towards +x."""
    ca = np.cos(az)
    return np.stack([ca * np.cos(el), np.sin(az) * np.cos(el), np.sin(el)], -1)


THICK = BALL_R + 0.02


def paddle_hit(bp, bv, centre, normal, vel, swing, radius, live, dt=DT):
    """Swept bounce off a moving, tiltable disc.

    The test is continuous, not a point-in-slab check: at 500 Hz a ball doing
    100 cm/s covers 0.2 cm per tick, twice the thickness of the contact slab,
    so a discrete test lets fast balls pass straight through the paddle.  We
    solve for the instant within the tick at which the ball's *relative*
    motion crosses the face, and test the disc there.

    ``swing`` adds impulse along the normal -- the fly's stroke.  Negative
    values let it take pace off instead.  Returns ``(bp, bv, hit_mask)``.
    """
    rel = bv - vel
    d0 = bp - centre
    s0 = np.einsum('...i,...i->...', d0, normal)          # signed distance now
    step = np.einsum('...i,...i->...', rel, normal) * dt  # change over the tick

    closing = step < 0.0
    denom = np.where(np.abs(step) < 1e-12, -1e-12, step)
    u = (THICK - s0) / denom
    inside = (s0 <= THICK) & (s0 >= -THICK)
    u = np.clip(np.where(inside, 0.0, u), 0.0, 1.0)
    in_tick = inside | (((THICK - s0) / denom >= 0.0) & ((THICK - s0) / denom <= 1.0))

    contact = bp + rel * (u[..., None] * dt)
    dc = contact - centre
    dcn = np.einsum('...i,...i->...', dc, normal)
    radial2 = np.einsum('...i,...i->...', dc, dc) - dcn ** 2

    hit = live & closing & in_tick & (radial2 < radius ** 2)

    vn = np.einsum('...i,...i->...', rel, normal)[..., None] * normal
    vt = rel - vn
    bounced_v = vt * (1.0 - MU_PADDLE) - E_PADDLE * vn + vel + \
        (swing * SWING_MAX)[..., None] * normal

    # Re-seat the ball on the face so it cannot re-trigger next tick.
    seated = centre + (dc - dcn[..., None] * normal) + normal * (BALL_R + 0.045)

    m = hit[..., None]
    return np.where(m, seated, bp), np.where(m, bounced_v, bv), hit


def step_fly(fp, fv, thrust, dt=DT):
    """Advance the fly.  ``thrust`` is a body acceleration command in [-1, 1]^3.

    Gravity is *not* cancelled for free: the policy has to learn to hold
    itself up, exactly as the real animal does.
    """
    acc = thrust * A_MAX - FLY_DRAG * fv
    acc[..., 2] -= G
    fv = fv + acc * dt

    sp = np.linalg.norm(fv, axis=-1, keepdims=True)
    fv = np.where(sp > V_MAX, fv * (V_MAX / np.maximum(sp, 1e-9)), fv)

    fp = fp + fv * dt

    # Soft walls: the table, the net, and the edge of the room.
    lowz = fp[..., 2] < FLY_Z_MIN
    fp[..., 2] = np.where(lowz, FLY_Z_MIN, fp[..., 2])
    fv[..., 2] = np.where(lowz & (fv[..., 2] < 0), 0.0, fv[..., 2])

    overnet = fp[..., 0] > FLY_X_MAX
    fp[..., 0] = np.where(overnet, FLY_X_MAX, fp[..., 0])
    fv[..., 0] = np.where(overnet & (fv[..., 0] > 0), 0.0, fv[..., 0])

    xmin = -HALF_LEN - FLY_ROAM
    lowx = fp[..., 0] < xmin
    fp[..., 0] = np.where(lowx, xmin, fp[..., 0])
    fv[..., 0] = np.where(lowx & (fv[..., 0] < 0), 0.0, fv[..., 0])

    ylim = HALF_WID + FLY_ROAM
    for s in (1, -1):
        m = (fp[..., 1] * s) > ylim
        fp[..., 1] = np.where(m, s * ylim, fp[..., 1])
        fv[..., 1] = np.where(m & ((fv[..., 1] * s) > 0), 0.0, fv[..., 1])

    hiz = fp[..., 2] > 2.6
    fp[..., 2] = np.where(hiz, 2.6, fp[..., 2])
    fv[..., 2] = np.where(hiz & (fv[..., 2] > 0), 0.0, fv[..., 2])

    return fp, fv


def predict_intercept(bp, bv, plane_x):
    """Cheap ballistic guess of where the ball crosses ``plane_x``.

    Drag is ignored and at most one table bounce is folded in by mirroring.
    It is only a hint fed to the policy, not ground truth.
    """
    vx = bv[..., 0]
    t = (plane_x - bp[..., 0]) / np.where(np.abs(vx) < 1e-6, -1e-6, vx)
    t = np.clip(t, 0.0, 0.5)

    y = bp[..., 1] + bv[..., 1] * t
    z = bp[..., 2] + bv[..., 2] * t - 0.5 * G * t * t
    z = np.where(z < TABLE_Z + BALL_R, 2 * (TABLE_Z + BALL_R) - z, z)  # mirror one bounce
    z = np.clip(z, TABLE_Z + BALL_R, 3.0)
    return np.stack([np.full_like(y, plane_x), y, z], -1), t
