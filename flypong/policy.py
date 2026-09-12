"""A small tanh MLP, evaluated with one set of weights per world.

The batched form (``einsum`` against a leading population axis) lets an
evolution strategy score its whole population in a single vectorised sweep,
which is the difference between minutes and hours on four CPU cores.
"""

import numpy as np

from env import ACT_DIM, OBS_DIM

HIDDEN = 48
SHAPES = [
    (OBS_DIM, HIDDEN), (HIDDEN,),
    (HIDDEN, HIDDEN), (HIDDEN,),
    (HIDDEN, ACT_DIM), (ACT_DIM,),
]
SIZES = [int(np.prod(s)) for s in SHAPES]
N_PARAMS = sum(SIZES)


def init(rng):
    """Small random init; the last layer starts near zero so the fly hovers."""
    parts = []
    for i, s in enumerate(SHAPES):
        if len(s) == 1:
            parts.append(np.zeros(s))
        else:
            scale = (0.02 if i == 4 else 1.0) * np.sqrt(1.0 / s[0])
            parts.append(rng.standard_normal(s) * scale)
    return np.concatenate([p.ravel() for p in parts])


def unpack(theta):
    """``theta`` of shape (..., N_PARAMS) -> list of weight tensors."""
    out, i = [], 0
    for shape, size in zip(SHAPES, SIZES):
        out.append(theta[..., i:i + size].reshape(theta.shape[:-1] + shape))
        i += size
    return out


def forward(theta, obs):
    """obs (P, E, OBS_DIM) with theta (P, N_PARAMS) -> action (P, E, ACT_DIM)."""
    w1, b1, w2, b2, w3, b3 = unpack(theta)
    h = np.tanh(np.einsum('pei,pih->peh', obs, w1) + b1[:, None, :])
    h = np.tanh(np.einsum('peh,phg->peg', h, w2) + b2[:, None, :])
    return np.tanh(np.einsum('peg,pga->pea', h, w3) + b3[:, None, :])


def single(theta):
    """A plain ``obs (N, OBS_DIM) -> action (N, ACT_DIM)`` callable."""
    w1, b1, w2, b2, w3, b3 = unpack(theta)

    def fn(obs):
        h = np.tanh(obs @ w1 + b1)
        h = np.tanh(h @ w2 + b2)
        return np.tanh(h @ w3 + b3)

    return fn


def to_json(theta):
    w1, b1, w2, b2, w3, b3 = unpack(theta)
    return {
        'obs_dim': OBS_DIM, 'act_dim': ACT_DIM, 'hidden': HIDDEN,
        'w1': w1.T.tolist(), 'b1': b1.tolist(),
        'w2': w2.T.tolist(), 'b2': b2.tolist(),
        'w3': w3.T.tolist(), 'b3': b3.tolist(),
    }
