# 🍂 Walktober

A global step challenge for October. Sign in with Google, Apple or Facebook, choose your
real name or a nickname, log steps and workouts, climb the global leaderboard, and compete
as a team.

## What's in the box

| Feature | Notes |
|---|---|
| **Sign-in** | Google, Apple, Facebook. Each button appears once its keys are set. |
| **Public name** | On first login, choose "my name" (pre-filled from the account) or a nickname, plus an avatar and country. |
| **Step sources** | Manual entry · Apple Health (iPhone Shortcut) · Google Health API · Garmin Connect. |
| **Scoring** | 1 pt/step · exercise 50 / 100 / 200 pts per minute (light / moderate / heavy) · +500 for a 10k day. |
| **Leaderboards** | People and teams; today / last 7 days / whole month; filter people by country; sort teams by total or per member. |
| **Teams** | Create (name, crest emoji, colours, motto), invite link + 6-character code, roster, captain edits, max 10 members. |
| **Fair play** | Several sources on one day → the **highest** counts, not the sum. Caps: 60k steps and 240 exercise minutes per day. No logging future days. |
| **Privacy** | Emails are never shown. Users can delete their account and all data from their profile page. Third-party tokens are encrypted at rest. |

### Scoring rationale

Walking at about 100 steps per minute is the research-backed threshold for moderate intensity.
So **1 minute of moderate exercise = 100 points**, the same as a minute of brisk walking.
WHO guidance counts 1 vigorous minute as 2 moderate minutes, so heavy exercise earns **200/min**.
Light activity earns half, **50/min**. All the numbers live in `src/lib/config.ts`.

### Connector reality check (as of Oct 2026)

| Source | Status | Why |
|---|---|---|
| Manual | ✅ Live | — |
| Apple Health | ✅ Live | There is no web API for HealthKit. Users build a 1-minute iOS Shortcut (instructions are on the Connect page) that POSTs the day's total to `/api/ingest` with a personal token. This works for any watch that writes to Apple Health (Apple Watch, Garmin, Fitbit, Oura and others). |
| Google | ⏳ Code ready, needs Google approval | The Google Fit REST API stopped accepting new apps in 2024 and shuts down at the end of 2026. Its replacement is the **Google Health API**, which is what this app uses. Its scopes are "restricted", so Google must review the app. Until then, up to 100 test users can be added in the OAuth consent screen. Set `GOOGLE_HEALTH_ENABLED=true` to turn it on. |
| Garmin | ⏳ Code ready, needs Garmin approval | Apply to the Garmin Connect Developer Program (Health API). Once approved, set the keys and register the push webhook. |

## Run locally

```bash
npm install
npm run seed        # optional: fake walkers and teams for a local preview (refuses to run if DATABASE_URL is set)
ALLOW_DEMO_LOGIN=true npm run dev
```

Local dev uses an embedded Postgres (PGlite) in `.data/`, so no install is needed. The
"Demo sign-in" box lets you log in with any name.

```bash
npm test            # scoring rules + real SQL leaderboard maths against in-memory Postgres
npm run typecheck
```

## Launch on Vercel (about 30 minutes, most of it OAuth setup)

1. **Import** this repo in Vercel (framework: Next.js).
2. **Database:** add Neon Postgres from the Vercel Marketplace, which sets `DATABASE_URL`. Tables are created on first request.
3. **Env vars:** copy `.env.example`. You need `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `CRON_SECRET`, plus at least one sign-in provider.
4. **OAuth redirect URIs** to register with each provider:
   - Google: `https://<domain>/api/auth/callback/google`
   - Facebook: `https://<domain>/api/auth/callback/facebook`
   - Apple: `https://<domain>/api/auth/callback/apple` (Apple requires a real domain, not localhost)
5. Deploy. A nightly cron (`vercel.json`) re-syncs Google-connected users.

## Architecture

- Next.js 16 (App Router, server actions) · React 19 · Tailwind
- next-auth v4 (JWT sessions) with our own `users`/`accounts` tables
- Plain SQL against Postgres (`postgres` driver in production, PGlite in development and tests)
- Scores are computed in SQL from raw entries (`step_entries`, `activities`). Rule changes apply retroactively and nothing is double-stored.

```
src/lib/config.ts      challenge dates, scoring constants
src/lib/scoring.ts     scoring rules (mirrored in SQL in queries.ts, and tested against each other)
src/lib/queries.ts     leaderboards, team totals, user history
src/lib/connectors.ts  Google Health API, Garmin, token storage
src/app/actions.ts     all form mutations
src/app/api/           auth, Apple Health ingest, OAuth connect flows, Garmin webhook, cron
```
