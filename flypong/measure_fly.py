"""Pull the fly's real shape and mass properties out of the flybody MJCF.

The browser game does not ship a 3D renderer, so instead of drawing a cartoon
fly we take the actual visual meshes from ``fruitfly.xml``, rotate them to a
series of headings, project them through the game's camera, and store the
per-part silhouettes.  What you see on screen is the outline of the real
DeepMind / Janelia model.

    python measure_fly.py --menagerie ../../menagerie/flybody --out assets/fly_shape.json
"""

import argparse
import json
import os

import mujoco
import numpy as np

# Visual grouping: body name prefix -> (layer name, draw order, colour).
PARTS = [
    ('wing', 'wing', 0, '#cfd8e8'),
    ('haltere', 'haltere', 1, '#e8d7a8'),
    ('coxa', 'leg', 2, '#3b2d22'),
    ('femur', 'leg', 2, '#3b2d22'),
    ('tibia', 'leg', 2, '#3b2d22'),
    ('tarsus', 'leg', 2, '#3b2d22'),
    ('claw', 'leg', 2, '#3b2d22'),
    ('abdomen', 'abdomen', 3, '#8a6a3c'),
    ('thorax', 'thorax', 4, '#a07a45'),
    ('antenna', 'antenna', 5, '#5a4530'),
    ('rostrum', 'head', 5, '#6b5335'),
    ('haustellum', 'head', 5, '#6b5335'),
    ('labrum', 'head', 5, '#6b5335'),
    ('head', 'head', 6, '#7a5c38'),
]


def layer_of(body_name):
    for prefix, layer, order, colour in PARTS:
        if body_name.startswith(prefix):
            return layer, order, colour
    return None


def hull(points):
    """Andrew's monotone chain -- convex hull of a 2D point set."""
    p = np.unique(np.round(points, 5), axis=0)
    if len(p) < 3:
        return p.tolist()
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(pts):
        out = []
        for q in pts:
            while len(out) >= 2:
                a, b = out[-2], out[-1]
                if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) > 0:
                    break
                out.pop()
            out.append(q)
        return out

    return [list(map(float, q)) for q in (half(p)[:-1] + half(p[::-1])[:-1])]


def decimate(poly, keep=12, places=3):
    """Thin a hull to at most ``keep`` vertices and quantise it.

    10 um resolution on a 3 mm animal is far finer than a screen pixel, and it
    cuts the asset the browser has to download by roughly 10x.
    """
    if len(poly) > keep:
        idx = np.round(np.linspace(0, len(poly), keep, endpoint=False)).astype(int)
        poly = [poly[i % len(poly)] for i in idx]
    return [[round(x, places), round(y, places)] for x, y in poly]


def world_vertices(model, data):
    """Every visual mesh vertex, in world coordinates, tagged with its body."""
    out = {}
    for g in range(model.ngeom):
        if model.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH or model.geom_group[g] != 1:
            continue
        mesh = model.geom_dataid[g]
        adr, num = model.mesh_vertadr[mesh], model.mesh_vertnum[mesh]
        v = model.mesh_vert[adr:adr + num].astype(np.float64)
        world = data.geom_xpos[g] + v @ data.geom_xmat[g].reshape(3, 3).T
        body = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, model.geom_bodyid[g])
        out.setdefault(body, []).append(world)
    return {k: np.concatenate(v) for k, v in out.items()}


def main(menagerie, out_path, headings):
    model = mujoco.MjModel.from_xml_path(os.path.join(menagerie, 'fruitfly.xml'))
    data = mujoco.MjData(model)
    if model.nkey:
        mujoco.mj_resetDataKeyframe(model, data, 0)
    mujoco.mj_forward(model, data)

    verts = world_vertices(model, data)
    allv = np.concatenate(list(verts.values()))
    centre = np.array([allv[:, 0].mean(), 0.0, allv[:, 2].mean()])

    stats = {
        'mass_g': float(model.body_subtreemass[1]),
        'body_length_cm': float(allv[:, 0].max() - allv[:, 0].min()),
        'wingspan_cm': float(allv[:, 1].max() - allv[:, 1].min()),
        'height_cm': float(allv[:, 2].max() - allv[:, 2].min()),
        'nq': int(model.nq), 'nv': int(model.nv), 'nu': int(model.nu),
        'nbody': int(model.nbody), 'ngeom': int(model.ngeom),
    }

    # The game camera sits behind the human and looks down the table.
    eye, target = np.array([6.0, 0.0, 3.2]), np.array([0.0, 0.0, 0.30])
    fwd = (eye - target) / np.linalg.norm(eye - target)
    right = np.cross([0, 0, 1.0], fwd)
    right /= np.linalg.norm(right)
    up = np.cross(fwd, right)

    frames = []
    for k in range(headings):
        th = 2 * np.pi * k / headings
        c, s = np.cos(th), np.sin(th)
        rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])

        layers = {}
        for body, v in verts.items():
            info = layer_of(body)
            if info is None:
                continue
            layer, order, colour = info
            p = (v - centre) @ rot.T
            xy = np.stack([p @ right, p @ up], -1)
            poly = hull(xy)
            if len(poly) >= 3:
                keep = 18 if layer in ('wing', 'thorax', 'abdomen', 'head') else 8
                layers.setdefault((layer, order, colour), []).append(decimate(poly, keep))

        frames.append([
            {'layer': k0, 'order': k1, 'colour': k2, 'polys': v}
            for (k0, k1, k2), v in sorted(layers.items(), key=lambda kv: kv[0][1])
        ])

    payload = {'stats': stats, 'headings': headings, 'frames': frames,
               'scale_note': 'coordinates are centimetres in the fly-centred frame'}
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))

    print(json.dumps(stats, indent=2))
    print(f'wrote {out_path}  ({os.path.getsize(out_path) / 1024:.0f} kB, '
          f'{headings} headings)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--menagerie', default='../../menagerie/flybody')
    ap.add_argument('--out', default='assets/fly_shape.json')
    ap.add_argument('--headings', type=int, default=24)
    a = ap.parse_args()
    main(a.menagerie, a.out, a.headings)
