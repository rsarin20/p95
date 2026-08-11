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
npm test            # 24 tests, no network, ~1s
```

There is nothing to install. `npm run dev` restarts on file changes.

## Deploy to Vercel

The repo is deploy-ready: static files in `public/`, the API as serverless
functions in `api/`, no build step.

1. **[vercel.com/new](https://vercel.com/new) → import this repository.** Leave
   every setting alone — framework "Other", output directory `public`, no build
   command. It deploys in well under a minute.
2. **Point it at the right branch.** Vercel deploys the repository's default
   branch to production. If the game lives on a feature branch, either merge it
   to the default branch first, or go to **Settings → Git → Production Branch**,
   set the branch, and redeploy. (Pushing to a non-default branch also produces
   a preview URL, which is just as playable.)

That already gives you a playable game. Scores are kept on the device and the
rail says `offline · local only`, because a serverless filesystem is read-only
and per-instance — there is nowhere for a global board to live yet.

### Turning on the global leaderboard

Add any Redis with an Upstash-compatible REST API — Vercel Marketplace →
Upstash, or Upstash directly — and connect it to the project. Nothing to
install: it needs one of these env var pairs, either of which the integrations
set for you.

| Variable | Also accepted as |
|---|---|
| `KV_REST_API_URL` | `UPSTASH_REDIS_REST_URL` |
| `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

Redeploy, and `/api/health` flips from `{"store":"none"}` to `{"store":"redis"}`.
The client notices on its own — no rebuild, no flag.

**City detection is free on Vercel.** The edge sets `x-vercel-ip-city` on every
request, so no IP is ever handed to a third-party geo service and there is no
extra round trip. The `GEO_ENDPOINT` fallback only runs when those headers are
absent (Cloudflare's `cf-ipcity` is understood too).

Two things the deploy inherits by design: rate limiting moves into Redis, since
a per-process counter means little when traffic is spread over short-lived
instances, and a Redis outage **fails open** — the game keeps working rather
than the leaderboard taking it down.

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

**With no server at all** — or a deploy with no database attached — the client
falls back to a local-only identity and a personal best, marks the rail
`offline · local only`, and stays fully playable. A store-less server says so
explicitly (`503`, `code: "no-store"`), and the client stops asking rather than
retrying forever against something that will not change.

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
| `DATA_FILE` | `./data/leaderboard.json` | Local file store; ignored when Redis is configured |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | unset | Upstash-compatible Redis. Present → the global board is live; absent → local-only scores |
| `TRUST_PROXY` | off | Set to `1` **only** behind a proxy that rewrites `X-Forwarded-For` — otherwise the header is caller-controlled and anyone can pick their own city |
| `GEO_ENDPOINT` | `https://ipwho.is/{ip}` | Any JSON endpoint with a `city` field; private and loopback IPs are never sent |

## Layout

```
api/             Vercel serverless entry points (thin wrappers over server/)
  session.js     POST create identity · PATCH rename
  score.js       POST a finished run
  leaderboard.js GET the board
  health.js      is a store wired up?
server/
  handlers.js    the API itself, written once for both hosts
  server.js      long-running host: static files + the same handlers
  store.js       file-backed players, atomic JSON snapshots (local)
  kv-store.js    Redis-backed players and ranking (serverless)
  kv.js          minimal Upstash REST client
  player.js      callsign rules, token hashing, public row shape
  geo.js         edge geo headers, else IP lookup; private ranges never sent
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

`npm test` runs 24 tests with no network and no browser.

The centrepiece is a **headless bot that plays the real physics through the real
spawner** for 24 five-minute runs. It isn't there to prove a bot can win — it's
there to prove that every pattern the spawner can emit is physically clearable.
It has already caught two genuine bugs: obstacles wide enough to out-last a
maximum-height hop, and the kayak spacing described above. If difficulty tuning
ever produces an unfair pattern, this fails instead of a player finding it forty
seconds into a run.

The rest covers callsign sanitisation, token authentication, persistence round
trips, leaderboard ranking, the score bound, private-IP handling, and rate
limiting — against **both** stores. The Redis path runs against an in-memory
stand-in that speaks the same commands, including an assertion that reading the
board stays within two round trips, so a deployed leaderboard isn't the first
place that code ever runs.

## License

MIT
