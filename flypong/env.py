"""Batched rally environment: a serve comes at the fly, the fly must return it.

Everything is vectorised over a leading batch axis, so one call simulates
thousands of independent rallies in lockstep.  That is what makes gradient-free
training practical on a few CPU cores.
"""

import numpy as np

from physics import (
    AZ_MAX, BALL_R, DT, EL_MAX, EL_MIN, HALF_LEN, HALF_WID, PADDLE_R, SWING_MIN,
    TABLE_Z, paddle_hit, paddle_normal, predict_intercept, step_ball, step_fly,
)

OBS_DIM = 20
ACT_DIM = 6
MAX_STEPS = 360          # 0.72 s of fly time
OUTCOME_NAMES = ['no-contact', 'returned-in', 'returned-out', 'into-net', 'own-half']

# Where the fly should drift back to once its shot is away.  Training this
# explicitly is what makes the policy usable for a continuous rally rather
# than a single isolated return.
READY = np.array([-1.50, 0.0, 0.55])


def decode(action):
    """Map raw policy output in [-1, 1]^6 to physical commands."""
    thrust = np.clip(action[..., 0:3], -1.0, 1.0)
    az = np.clip(action[..., 3], -1.0, 1.0) * AZ_MAX
    el = EL_MIN + (np.clip(action[..., 4], -1.0, 1.0) + 1.0) * 0.5 * (EL_MAX - EL_MIN)
    swing = SWING_MIN + (np.clip(action[..., 5], -1.0, 1.0) + 1.0) * 0.5 * (1.0 - SWING_MIN)
    return thrust, az, el, swing


def near_miss(p):
    """Credit for a landing that only just failed.

    Deliberately narrow: a wide bonus here is worse than none, because the fly
    discovers it can bank a steady reward by patting every ball safely short
    instead of risking the shot that actually lands.
    """
    return 5.0 * np.exp(-(to_human_half(p) / 0.45) ** 2) - 2.0


def to_human_half(p):
    """Distance from a landing point to the human's half of the table."""
    dx = np.maximum(np.maximum(0.05 - p[..., 0], p[..., 0] - HALF_LEN), 0.0)
    dy = np.maximum(np.abs(p[..., 1]) - HALF_WID, 0.0)
    return np.hypot(dx, dy)


# Each serve parameter as (centre, half-width).  ``spread`` scales the
# half-widths, which buys a curriculum for free: early generations see slow
# serves down the middle, later ones the full envelope.
SERVE = {
    'bp': [(1.45, 0.45), (0.0, 0.85), (0.75, 0.50)],
    'bv': [(-50.0, 22.0), (0.0, 26.0), (15.0, 25.0)],
    'fp': [(-1.425, 0.525), (0.0, 0.70), (0.55, 0.30)],
    'fv': [(0.0, 12.0)] * 3,
    'aim': [(1.15, 0.70), (0.0, 0.92)],
}


def _sample(rng, key, n, spread):
    return np.stack([c + h * spread * rng.uniform(-1.0, 1.0, n)
                     for c, h in SERVE[key]], -1)


def reset(rng, n, spread=1.0):
    """Serve a ball from the human's half towards the fly.

    The vertical launch speed is then corrected so the serve always clears the
    net -- otherwise the fly gets blamed for the human's fault.
    """
    bp = _sample(rng, 'bp', n, spread)
    bv = _sample(rng, 'bv', n, spread)

    t_net = bp[:, 0] / -bv[:, 0]
    z_net = bp[:, 2] + bv[:, 2] * t_net - 0.5 * 981.0 * t_net ** 2
    bv[:, 2] += np.maximum(0.42 - z_net, 0.0) / t_net

    return (bp, bv, _sample(rng, 'fp', n, spread),
            _sample(rng, 'fv', n, spread), _sample(rng, 'aim', n, spread))


def observe(bp, bv, fp, fv, aim, hit):
    icept, ttc = predict_intercept(bp, bv, fp[..., 0])
    return np.concatenate([
        fp / 2.0,
        fv / 100.0,
        (bp - fp) / 2.0,
        bv / 100.0,
        (icept - fp) / 2.0,
        (ttc * 10.0)[..., None],
        aim / 2.0,
        hit[..., None].astype(np.float64),
        ((bp[..., 2] - TABLE_Z) / 1.0)[..., None],
    ], -1)


def rollout(policy_fn, rng, n, collect=False, spread=1.0):
    """Simulate ``n`` rallies to completion.

    ``policy_fn(obs) -> action`` may carry its own batch of parameters, one per
    world, which is how the evolution strategy evaluates a whole population in
    a single pass.  Returns ``(reward, outcome)`` plus an optional trace.
    """
    bp, bv, fp, fv, aim = reset(rng, n, spread)

    live = np.ones(n, bool)
    hit = np.zeros(n, bool)
    outcome = np.zeros(n, np.int8)
    reward = np.zeros(n)
    closest = np.full(n, 9.9)
    land = np.zeros((n, 2))
    trace = [] if collect else None

    for _ in range(MAX_STEPS):
        if not live.any():
            break

        act = policy_fn(observe(bp, bv, fp, fv, aim, hit))
        thrust, az, el, swing = decode(act)
        nrm = paddle_normal(az, el)

        fp, fv = step_fly(fp, fv, thrust)

        # Shaping: get to where the ball is *going*, not where it is.  Chasing
        # the current position is a lagging target and the fly never arrives.
        icept, _ = predict_intercept(bp, bv, fp[..., 0])
        lead = np.linalg.norm(icept - fp, axis=-1)
        gap = np.linalg.norm(bp - fp, axis=-1)
        closest = np.where(live & ~hit, np.minimum(closest, gap), closest)
        reward -= np.where(live & ~hit, 0.9 * DT * np.minimum(lead, 4.0), 0.0)

        # Once the shot is away, drift back to the ready spot.
        home = np.linalg.norm(fp - READY, axis=-1)
        reward -= np.where(live & hit, 0.45 * DT * np.minimum(home, 4.0), 0.0)

        can_hit = live & ~hit & (bp[..., 0] < 0.0)
        bp, bv, just_hit = paddle_hit(bp, bv, fp, nrm, fv, swing, PADDLE_R, can_hit)
        reward += np.where(just_hit, 5.0, 0.0)
        hit |= just_hit

        bp, bv, bounced, netted, fell_out = step_ball(bp, bv)

        if collect:
            trace.append((bp.copy(), bv.copy(), fp.copy(), fv.copy(), nrm.copy(), hit.copy()))

        # --- terminal conditions -------------------------------------------
        landed_human = live & hit & bounced & (bp[..., 0] > 0.0)
        landed_own = live & hit & bounced & (bp[..., 0] <= 0.0)
        into_net = live & hit & netted     # only the fly's own shot can fault
        landed_out = live & fell_out
        gone = live & ((bp[..., 2] < TABLE_Z - 1.5) | (np.abs(bp[..., 0]) > 9.0))
        passed = live & ~hit & (bp[..., 0] < fp[..., 0] - 0.35)

        # Scored: the return bounced on the human's half.
        if landed_human.any():
            err = np.linalg.norm(bp[..., :2] - aim, axis=-1)
            depth = np.clip(bp[..., 0] / HALF_LEN, 0.0, 1.0)
            reward += np.where(landed_human,
                               16.0 + 7.0 * np.exp(-(err / 0.75) ** 2) + 3.0 * depth, 0.0)
            land = np.where(landed_human[..., None], bp[..., :2], land)
            outcome = np.where(landed_human, 1, outcome)
            live &= ~landed_human

        if into_net.any():
            reward += np.where(into_net, -1.5, 0.0)
            outcome = np.where(into_net, 3, outcome)
            live &= ~into_net

        # Short, on its own half.  Same smooth landing-quality term as for a
        # ball hit long: the fly is pulled towards the legal window from both
        # sides instead of falling off a cliff either way.
        if landed_own.any():
            reward += np.where(landed_own, near_miss(bp), 0.0)
            outcome = np.where(landed_own, 4, outcome)
            live &= ~landed_own

        # Out, but reward near-misses: this is the gradient that pulls the
        # stroke from "somewhere off the end" towards "on the table".
        if landed_out.any():
            reward += np.where(landed_out & hit, near_miss(bp), 0.0)
            reward += np.where(landed_out & ~hit, -4.0, 0.0)
            outcome = np.where(landed_out, np.where(hit, 2, 0), outcome)
            live &= ~landed_out

        if gone.any():
            reward += np.where(gone, np.where(hit, -1.0, -4.0), 0.0)
            outcome = np.where(gone, np.where(hit, 2, 0), outcome)
            live &= ~gone

        if passed.any():
            reward += np.where(passed, -4.0, 0.0)
            outcome = np.where(passed, 0, outcome)
            live &= ~passed

    reward -= 3.0 * np.where(hit, 0.0, np.minimum(closest, 3.0))
    if collect:
        return reward, outcome, trace
    return reward, outcome
