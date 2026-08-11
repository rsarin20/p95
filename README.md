# 🦫 Capy River Run

An endless river runner starring a stoic capybara balancing a yuzu on its head.
Hop the driftwood, skim the alligators, dive under the rogue ducks, and watch
the world drift from dawn to starlight as your score climbs.

Zero dependencies — Node's standard library on the server, plain ES modules and
a single `<canvas>` on the client.

```
┌──────────────────────────────────────────┬──────────────────────┐
│                                          │  CAPY RIVER RUN      │
│              [ the river ]               │  SCORE  04,280       │
│                  🦫                      │  BEST   12,450       │
│         ~   ▂▂▂▂   ~    ▂▂▂▂▂▂           │  GLOBAL LEADERBOARD  │
│                                          │  #01 FastCapy  24.1k │
└──────────────────────────────────────────┴──────────────────────┘
       60% canvas                              40% data rail
```

## Run it

```bash
npm start           # http://localhost:8080
npm test            # 17 tests, no network, ~1s
```

There is nothing to install. `npm run dev` restarts on file changes.

## Controls

| Input | Action |
|---|---|
| `Space` / `↑` / tap | Hop. **Hold it** — the longer you hold, the higher you go |
| `↓` / swipe down | Dive: fast-drop through the air, and submerge when on the surface |
| `Enter` / `R` | Restart |
| `C` | Copy the share card to the clipboard |

Two forgiving touches make it feel fair at speed: a hop pressed just before
landing is remembered (input buffering), and one pressed just after leaving the
surface still works (coyote time).

## How it plays

**The yuzu is the physics readout.** The fruit is simulated separately from the
capybara and falls under its own, lighter gravity. The head only ever pushes it
up. So when you launch, the yuzu is pressed into the skull; at the top of the
arc the capybara starts falling while the yuzu keeps rising, and it hangs in the
air for a beat before settling back. Its height tells you where you are in the
jump before your eyes read the capybara.

**Obstacles.** Driftwood and alligators want a hop. Ducks bob at the surface.
Kayaks paddle *upstream* at 1.5× the flow, so they arrive faster than they look.
Rogue ducks fly in a stacked column whose lowest bird hangs lower than a
capybara is tall — dive under it, or commit to a full-height hop to clear the
top.

**Chill Moments.** Clear an alligator's dorsal ridge by under 30 units and you
bank +250, up to ×4 for a streak. The scutes deliberately poke above the
collision box, so a Chill Moment is something you can *see* yourself doing.

**Speed** rises a smooth +2% every 10 seconds (exponential, never stepped), and
the lighting walks dawn → day → dusk → night every ~5,200 points, so a long run
visibly carries you through a full day and back.

### Spacing is measured in time, not pixels

Every gap between obstacles is expressed as *seconds of clear water at the
capybara*, then converted back into a spawn position using that obstacle's own
travel speed. This matters more than it sounds: a kayak moving at 1.5× the flow
covers a "generous" pixel gap in two thirds of the time, and an earlier version
of this game would drop one just far enough behind a duck that landing from the
duck hop put you straight into the kayak. `test/playable.test.js` now asserts
the arrival-time gap never falls below `GAP_MIN`.

## Identity and the leaderboard

First launch asks for one thing: a callsign. There is no account, no password,
and no location permission dialog — the server derives a coarse city from the
request IP and nothing finer.

- A UUID and a bearer token are minted server-side and stored in `localStorage`
  **and** a same-site cookie. Either one alone is enough to skip the prompt on a
  return visit, and each heals the other if only one survives.
- Only the token's SHA-256 hash is persisted, so the data file cannot be used to
  impersonate a player.
- The rail shows the global top 10, your own standing if you're outside it, and
  the current champion of your city.

**With no server at all,** the client falls back to a local-only identity and a
personal best, marks the rail `offline · local only`, and stays fully playable.

### API

| Endpoint | Purpose |
|---|---|
| `POST /api/session` | Mint an identity from a callsign; resolves the city from the IP |
| `PATCH /api/session` | Rename, and backfill a location the first lookup missed |
| `POST /api/score` | Record a run (bearer token required) |
| `GET /api/leaderboard?id=` | Top 10, your standing, your city's champion |

Submitted scores are checked against the most the difficulty curve could
physically produce in the reported run length (`server/scoring.js`). That
rejects impossible numbers; it is a sanity bound, not anti-cheat, and a patient
forger could still submit a plausible score. Real protection would mean
simulating runs server-side.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | |
| `DATA_FILE` | `./data/leaderboard.json` | Written atomically, on a debounce |
| `TRUST_PROXY` | off | Set to `1` **only** behind a proxy that rewrites `X-Forwarded-For` — otherwise the header is caller-controlled and anyone can pick their own city |
| `GEO_ENDPOINT` | `https://ipwho.is/{ip}` | Any JSON endpoint with a `city` field; private and loopback IPs are never sent |

## Layout

```
server/
  server.js      static files + JSON API, no framework
  store.js       in-memory players, atomic JSON snapshots
  geo.js         IP → coarse city, cached, private ranges short-circuited
  scoring.js     the plausible-score bound
  rate-limit.js  fixed-window counter per IP
public/js/
  game.js        run lifecycle: physics, collision, scoring, render pump
  player.js      capybara + the yuzu's contact-constraint physics
  entities.js    obstacle catalogue and arrival-time spawner
  render.js      scene painter, camera shake, day/night palette blending
  shapes.js      every silhouette, in one flat-fill vocabulary
  particles.js   splashes, wake ripples, chill sparks
  leaderboard.js server sync with local-only fallback
  identity.js    localStorage + cookie persistence
  ui.js          every DOM write (textContent only — callsigns are user input)
```

## Tests

`npm test` runs 17 tests with no network and no browser.

The centrepiece is a **headless bot that plays the real physics through the real
spawner** for 24 five-minute runs. It isn't there to prove a bot can win — it's
there to prove that every pattern the spawner can emit is physically clearable.
It has already caught two genuine bugs: obstacles wide enough to out-last a
maximum-height hop, and the kayak spacing described above. If difficulty tuning
ever produces an unfair pattern, this fails instead of a player finding it forty
seconds into a run.

The rest covers callsign sanitisation, token authentication, persistence round
trips, leaderboard ranking, the score bound, private-IP handling, and rate
limiting.

## License

MIT
