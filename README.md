# MOONHOP

A one-button endless runner across a desert at night. You are a jerboa. You
run right. You jump. That is the whole game.

```
npm start        # http://localhost:8080
npm test
```

No build step, no dependencies, no bundler. The game is plain ES modules and a
canvas; the server is Node's `http` module and a JSON file.

---

## The jump

Everything else in this repository exists to serve one arc.

| | |
|---|---|
| ascent | 0.425s (51 ticks) |
| descent | 0.475s (57 ticks) |
| peak | 92 world units, at exactly the top of the ascent |
| fall vs climb | downward acceleration ~32% heavier |
| forgiveness | a jump pressed up to 100ms before landing still fires |

The brief asked for a ~0.42s rise, a ~0.48s fall, and a heavier downward
acceleration. Those three are only compatible if the descent is not a single
constant fall — a longer descent under uniformly stronger gravity is a
contradiction. So the descent is split: the jerboa crests into a brief
low-gravity float (the moment its ears drift up), then genuinely heavier
gravity snaps it down. The totals land where they were asked to, the fall is
heavier than the climb, and the arc stays one fixed shape, so the player can
always predict exactly where they will come down.

The phase boundaries are whole tick counts, not seconds. Integrating a constant
acceleration across a step is exact, so gravity only ever changing on a tick
boundary means the simulated arc **is** the intended arc — it peaks at 92.0000
and lands with a residual of 2e-13, on every machine.

## Determinism

`(seed, the ticks you pressed jump)` fully determines a run.

The simulation takes fixed steps, never frame deltas. Randomness comes only
from a seeded integer PRNG. Nothing on the deterministic path calls
`Math.random`, `Math.exp` or `Math.pow` — the speed and spacing curves are
piecewise-linear tables, because linear interpolation is bit-reproducible
across engines and `exp` is not.

That buys reproducible difficulty, testable balance, identical play on every
browser, and a server that can re-run any submitted score.

## The level is always clearable

Obstacles are generated in clusters, each meant to be cleared by a **single**
jump. All multi-jump difficulty comes from the gap between clusters, which
tightens with score. The player is only ever solving one problem — *when do I
leave the ground* — and the game gets harder by shortening the answer rather
than complicating the question.

Crucially, patterns are not trusted because they looked reasonable when they
were written down. `clusterTakeoffWindow` computes, from the jump arc itself,
the exact range of positions a single jump could clear a cluster from. Any
cluster that leaves the player no viable take-off — or a window thinner than
~60ms at full speed — is discarded before it ever spawns. A test plays 40 seeds
for six simulated minutes with perfect timing and asserts it never dies.

The difficulty is entirely in how wide that window is:

| score | median window | speed |
|---|---|---|
| 0 | 670ms | 300 |
| 2,000 | 465ms | 443 |
| 6,000 | 294ms | 566 |
| 10,000+ | ~275ms (tightest ~130ms) | 620–660 |

Single small obstacles cannot create that pressure — you are above a thornbrush
for 820ms of a 900ms jump however fast the world moves. So pattern weights
*age out*: the early singles fade to a low residual weight and become the
breathing room between wide clusters. The sand ridge is sized as a fraction of
the current jump span rather than a fixed width, which makes it the one
obstacle that stays a real test of timing at every speed.

## Anti-cheat

The client submits **what it did**, not what it scored: a seed, and the ticks on
which the jump key went down. The server replays the run and derives the score
itself.

Posting a made-up number therefore does not work at all. To claim a score you
must submit an input sequence that really survives that long — which is the
same problem as playing the game. On top of the replay, the server checks that
the run actually ended, that the checkpoints match, and that it did not finish
faster than real time.

This is not a perfect anti-cheat system; there is no such thing for a
client-side game, and chasing one before launch is a good way to never launch.
It makes casual manipulation more effort than getting good, which is what keeps
a leaderboard credible.

## Offline

The game is fully playable with no network — physics, animation, name, and
personal best all work offline, and a service worker caches the whole app so a
second launch needs nothing.

Finished runs are queued in `localStorage` and submitted whenever a connection
next exists. Someone can play for two hours on a plane and have their runs go up
when they land.

## Location

The leaderboard's third column is a town name and nothing else.

The city comes from the browser's IANA time zone (`Europe/London` → `London`) —
already present, no permission prompt, and it resolves to nothing finer than a
city. If the deployment sits behind a CDN that provides a city header
(`cf-ipcity` and friends) the server prefers that. No coordinates, no address,
and no IP is stored or forwarded; addresses are used only for in-memory rate
limiting.

## Layout

The world is authored 360 units tall. The renderer shows between 480 and 1400
units of width and scales to fit, so the game is composed on a phone held
upright and on an ultrawide alike. Obstacle spawning is fixed in world units, so
a bigger monitor never buys a preview advantage.

## Structure

```
src/core/      the deterministic simulation — no DOM, shared with the server
  config.js      tuning: the jump, the speed and spacing tables
  arc.js         the jump arc, and the take-off window maths built on it
  sim.js         fixed-step simulation and the replay entry point
  patterns.js    obstacle clusters, with lifespans
src/render/    canvas drawing — reads the sim, never writes to it
  palette.js     the five night phases and the moon's path
  jerboa.js      the character: a pose model and a procedural silhouette
  scene.js       sky, stars, moon, dunes, horizon, dust
src/net/       localStorage and the score queue
server/        two API routes and a static file handler, no dependencies
  verify.js      replay-based score verification
test/
```

## Notes

The leaderboard starts empty. It is not seeded with invented players — a board
of fabricated names presented to real people as real competitors is a lie, and
an empty board that fills up is a better first impression than a fake full one.

There is no audio, no score popups, no particles, no power-ups, no combo meter
and no settings screen. Those are all omissions on purpose.
