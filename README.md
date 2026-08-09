# PANGO — NO SIGNAL

An endless runner for when the internet isn't. Same bones as Chrome's
dinosaur — fixed camera, rising speed, one hit and you're done — with a
pangolin, a greed loop, and a two-ink risograph press instead of a
whiteboard.

```
node server.js          # → http://localhost:8080
```

No build step, no dependencies, no bundler. Open it and run.

---

## The animal

A pangolin, because it has a **second verb**. The dino's duck is a dead
mechanic — it makes you shorter and nothing else. A pangolin curls into
an armoured ball, and that one real behaviour pays for three:

| | |
|---|---|
| **low profile** | roll under the drones that fly too low to run beneath |
| **fast fall** | curl in mid-air to dive; land hard and you SLAM, breaking anything brittle nearby |
| **armour** | roll *through* hollow obstacles instead of dying on them |

It is also unmistakable in silhouette, brandable in four letters, and —
being the most trafficked mammal on earth — gives the game something to
say beyond a score.

## The dynamic: SIGNAL

Pure avoidance games plateau, so avoidance is only the floor. On top of
it sits an economy that rewards greed:

```
packet      +13     floating bars of reception, placed on jump arcs
near miss    +6     pass within 15 units of anything and survive
smash       +20     curl through a brittle stack
decay      −3.6/s   the meter always leaks
```

Fill the meter and the world comes **ONLINE** for five seconds: triple
score, invincible, 35% faster, and the entire press switches to electric
yellow. Then it drops you — at that new speed — back into the dark.

That's the loop. Packets sit above obstacles, so charging the meter means
choosing to jump into trouble you could have walked around. The
punishment for winning is a difficulty spike. A cautious run and a greedy
run of the same length differ by 3–4× in score, which is what makes a
leaderboard worth chasing.

## Reading the world

One rule, and nothing in the game violates it:

- **Solid ink** — hard. Kills you rolled or not.
- **Hollow / dashed** — brittle. Curl into it and it explodes.

Nothing else is ever drawn hollow, so the language stays unambiguous at
900 units/second. The first time each obstacle type appears you get one
printed caption pointing at it (`CURL ↓ TO SMASH`, `DON'T JUMP`) — shown
once, ever, then remembered in `localStorage`. There is no tutorial.

## The look

Real risograph prints one plate per ink, and the plates never land
perfectly on top of each other. So the renderer does the same: two
full-size layers, one per ink, composited onto paper with `multiply` on
light stock and `screen` on dark, with the fluoro plate nudged a hair
off-register. Overlaps go rich and dirty for free, exactly like real
overlapping inks. Scale seams and lattice work are `destination-out`
knockouts — actual holes in the ink with paper showing through.

Nine zones re-ink the whole press as you pass through them — world, HUD,
buttons and leaderboard all at once, because CSS custom properties get
the live palette every frame. Crossing into `NIGHTFALL` flips the stock
to dark and the blend to `screen`. Progress you can see, and screenshots
that look different from each other.

Everything is monospace, uppercase and letterspaced — the one type
treatment that is identical on every platform and reads as a printed
chart rather than a web app.

## The character is code

`public/js/pango.js` has no sprites. The pangolin is a spine — one arc
whose total turn is a single number:

```
curl 0.0  →  0.75 rad    a running arch
curl 1.0  →  7.60 rad    past a full turn, so the tail wraps over
                         the head and the hole in the middle closes
```

Body thickness rides a profile curve along that spine, the serrated back
is a sawtooth added to the top edge only, and four legs solve two-bone IK
to foot targets that collapse to nothing as the body shuts. The curl
isn't a swap between two drawings; it's one continuous morph, which is
why it still reads at speed.

The collision boxes are **measured off the rendered art**, not guessed —
45×88 standing, 25×25 rolled. The box covers the body core only; the nose
and the long tail hang outside it, deliberately, because a wide box on a
long animal makes wide obstacles physically unclearable at low speed.

## Fairness

Two numbers do most of the work:

- **Lookahead is fixed.** The logical view width is derived from the
  aspect ratio and clamped to 640–1040 units. Nobody gets a telescope by
  maximising their window; a phone in portrait still gets real warning.
- **Gaps are measured in seconds, not pixels**, so they hold as the game
  accelerates, and no gap is ever shorter than one full jump arc plus a
  reaction window (`0.72 + 0.34s`). Get that wrong and the game becomes
  unplayable at speed in a way that reads as *unfair* rather than *hard*.

Verified by playing it: a perfect-reflex bot driving the real game loop
reaches 1,600–3,100 over 60–100 seconds and dies to genuine mistakes in
`NIGHTFALL`/`AURORA`/`THE EDGE`.

## Identity and the leaderboard

Asked once, ever: a callsign, stored in a cookie (mirrored to
`localStorage`). No accounts, no email, no permission prompts.

The board shows **name · city · score**. The city is stamped
**server-side at the edge** from `request.cf.city` — the client never
sees a location, never sends one, and is never asked for one. Nothing to
spoof, nothing to consent to.

Scores are validated, not trusted:

| check | rejects |
|---|---|
| plausibility | more than `60·seconds + 300` points |
| HMAC run token | a run whose token was minted after the run allegedly started |
| rate limit | resubmission inside 3s |
| sanitisation | names, uids, and every numeric field |

If the API is unreachable the whole thing degrades to a local board —
which, for this particular game, is thematically ideal.

## Deploying

**Cloudflare** (recommended — `request.cf.city` is free and the edge is
the point):

```bash
cd worker
npx wrangler d1 create pango                 # paste the id into wrangler.toml
npx wrangler d1 execute pango --file schema.sql --remote
npx wrangler secret put PANGO_SECRET
npx wrangler deploy
```

**Anywhere else** — `node server.js` serves `public/` and the same API,
persisting to a JSON file. It reads `cf-ipcity` / `x-vercel-ip-city`
headers when a proxy provides them. Set `PANGO_SECRET` in production.

Both implement an identical API:

```
POST /api/session      → { token }
POST /api/score        → { rank, total, city, top[] }
GET  /api/leaderboard  → { rows[] }        ?scope=all|today&limit=n
```

## Files

```
public/
  index.html          five screens, no framework
  style.css           the print design system; colours are all variables
  js/
    render.js         the press: two ink plates, grain, halftone, hatch
    palette.js        nine zones + the ONLINE palette, crossfaded
    pango.js          the character, as geometry
    world.js          three receding ground planes
    obstacles.js      the roster and the difficulty director
    game.js           physics, the SIGNAL economy, collision, scoring
    particles.js      dust, shards, sparks, shock rings
    audio.js          a WebAudio synth; no audio files
    net.js            cookie identity, submission, offline fallback
    ui.js             overlays, kept in ink-sync with the canvas
    main.js           boot, loop, input
server.js             zero-dependency Node server + JSON store
worker/               Cloudflare Worker + D1 (same API, real geo)
```

## Controls

`SPACE` / `↑` / tap upper screen — jump (hold longer, jump higher)
`↓` / `SHIFT` / tap lower strip — curl
`M` — sound

---

*The signal died. Keep running.*
