"""Bundle a trained policy plus the fly's shape into the playable page.

``game.html`` is written as a template with two placeholder script blocks; this
fills them in so the published page is one self-contained file with no network
fetches (the artifact sandbox blocks those anyway).

    python export_policy.py --policy runs/S1.npy --out ../flypong_game.html
"""

import argparse
import json
import os

import numpy as np

import physics as P
import policy
from env import ACT_DIM, MAX_STEPS, OBS_DIM


def constants():
    """Every number game.js needs, taken straight from the training physics."""
    return {k: getattr(P, k) for k in [
        'HALF_LEN', 'HALF_WID', 'TABLE_Z', 'NET_H', 'G', 'BALL_R', 'BALL_DRAG',
        'E_TABLE', 'MU_TABLE', 'PADDLE_R', 'HUMAN_PADDLE_R', 'E_PADDLE',
        'MU_PADDLE', 'SWING_MAX', 'SWING_MIN', 'A_MAX', 'FLY_DRAG', 'V_MAX',
        'FLY_Z_MIN', 'FLY_X_MAX', 'FLY_ROAM', 'AZ_MAX', 'EL_MIN', 'EL_MAX',
        'DT', 'FLY_MASS',
    ]} | {'OBS_DIM': OBS_DIM, 'ACT_DIM': ACT_DIM, 'MAX_STEPS': MAX_STEPS}


def main(policy_path, shape_path, template, out, stats_path):
    theta = np.load(policy_path)
    bundle = {
        'policy': policy.to_json(theta),
        'constants': constants(),
        'shape': json.load(open(shape_path)),
        'stats': json.load(open(stats_path)) if stats_path and os.path.exists(stats_path) else {},
    }
    html = open(template).read()
    token = '/*__FLYPONG_BUNDLE__*/'
    if token not in html:
        raise SystemExit(f'template {template} has no {token} placeholder')
    html = html.replace(token, 'window.FLYPONG = ' + json.dumps(bundle, separators=(',', ':')) + ';')

    with open(out, 'w') as f:
        f.write(html)
    print(f'{out}  ({os.path.getsize(out) / 1024:.0f} kB)  '
          f'{policy.N_PARAMS} policy parameters')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--policy', default='runs/S1.npy')
    ap.add_argument('--shape', default='assets/fly_shape.json')
    ap.add_argument('--template', default='game.template.html')
    ap.add_argument('--stats', default='runs/eval.json')
    ap.add_argument('--out', default='../flypong_game.html')
    a = ap.parse_args()
    main(a.policy, a.shape, a.template, a.out, a.stats)
