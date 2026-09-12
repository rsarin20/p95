"""Train the fly's return stroke with an evolution strategy.

Why ES and not PPO: the thing we actually care about -- "did the return land on
the far half" -- is a sparse, discontinuous event at the end of a 0.7 s rally.
ES optimises the episode return directly, it never needs a value function or a
differentiable reward, and it vectorises perfectly across a population, which
suits a CPU-only box.  ~4k parameters is well inside what ES handles.

    python train.py --generations 400 --out policy.npy
"""

import argparse
import json
import time

import numpy as np

import policy
from env import OUTCOME_NAMES, rollout


def evaluate(theta_pop, rng, episodes, spread=1.0):
    """Return mean reward and outcome counts for each member of the population."""
    p = theta_pop.shape[0]
    n = p * episodes

    def fn(obs):
        return policy.forward(theta_pop, obs.reshape(p, episodes, -1)).reshape(n, -1)

    reward, outcome = rollout(fn, rng, n, spread=spread)
    return reward.reshape(p, episodes).mean(1), outcome.reshape(p, episodes)


def train(generations, pop_pairs, episodes, sigma, lr, seed, out, log_every):
    rng = np.random.default_rng(seed)
    theta = policy.init(rng)
    m = np.zeros_like(theta)
    v = np.zeros_like(theta)
    best_score, best_theta = -1e9, theta.copy()
    history = []
    t0 = time.time()

    for gen in range(1, generations + 1):
        eps = rng.standard_normal((pop_pairs, policy.N_PARAMS))
        pop = np.concatenate([theta + sigma * eps, theta - sigma * eps])

        # Curriculum: widen the serve envelope over the first half of the run.
        spread = min(1.0, 0.35 + 0.65 * gen / (0.5 * generations))
        fit, outcomes = evaluate(pop, rng, episodes, spread)

        # Rank-normalise: robust to the reward's wildly different scales
        # between "never touched it" and "clean winner".
        order = np.argsort(np.argsort(fit))
        util = order / (len(fit) - 1.0) - 0.5

        plus, minus = util[:pop_pairs], util[pop_pairs:]
        grad = ((plus - minus)[:, None] * eps).sum(0) / (pop_pairs * sigma)
        grad -= 0.002 * theta                        # weight decay

        m = 0.9 * m + 0.1 * grad
        v = 0.999 * v + 0.001 * grad ** 2
        mh = m / (1 - 0.9 ** gen)
        vh = v / (1 - 0.999 ** gen)
        theta = theta + lr * mh / (np.sqrt(vh) + 1e-8)

        if gen % log_every == 0 or gen == 1:
            # Always score against the full envelope, so the numbers are honest.
            score, oc = evaluate(theta[None], rng, 512, 1.0)
            counts = np.bincount(oc.ravel(), minlength=5)
            rate = counts[1] / counts.sum()
            contact = 1.0 - counts[0] / counts.sum()
            history.append({'gen': gen, 'spread': round(spread, 3), 'score': float(score[0]),
                            'return_rate': float(rate), 'contact_rate': float(contact)})
            print(f'gen {gen:4d}  score {score[0]:7.2f}  contact {contact:5.1%}  '
                  f'returned-in {rate:5.1%}  '
                  f'[{" ".join(f"{n}={c}" for n, c in zip(OUTCOME_NAMES, counts))}]  '
                  f'{time.time() - t0:5.0f}s', flush=True)
            if score[0] > best_score:
                best_score, best_theta = float(score[0]), theta.copy()
                np.save(out, best_theta)

    np.save(out, best_theta)
    with open(str(out).replace('.npy', '_history.json'), 'w') as f:
        json.dump(history, f, indent=1)
    print(f'best score {best_score:.2f} -> {out}')
    return best_theta


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--generations', type=int, default=400)
    ap.add_argument('--pop-pairs', type=int, default=128)
    ap.add_argument('--episodes', type=int, default=4)
    ap.add_argument('--sigma', type=float, default=0.06)
    ap.add_argument('--lr', type=float, default=0.035)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--log-every', type=int, default=10)
    ap.add_argument('--out', default='policy.npy')
    a = ap.parse_args()
    train(a.generations, a.pop_pairs, a.episodes, a.sigma, a.lr, a.seed, a.out, a.log_every)
