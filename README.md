# p95

Looking beyond the obvious.

## flypong

Google DeepMind and HHMI Janelia published **flybody**, an anatomically
detailed MuJoCo model of the fruit fly — 109 degrees of freedom, 78 actuators,
0.98 mg. [`flypong/`](flypong/) teaches it to play table tennis and puts it in
a browser so you can rally against it.

- `flypong/physics.py` — fly-scale ping-pong dynamics, one spec shared by the
  trainer, the MuJoCo harness and the browser
- `flypong/train.py` — an evolution strategy over batched rallies
- `flypong/mujoco_eval.py` — checks the reduced flight model against the real
  109-DoF body
- `flypong_game.html` — the built, self-contained page

See [`flypong/README.md`](flypong/README.md) for how it works and what holds up
under scrutiny.
