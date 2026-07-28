# VitalSync

A personal health, recovery and readiness dashboard — an Athlytic-style PWA you host yourself.
Log HRV, resting heart rate, sleep, workouts and daily habits; VitalSync turns them into four
scores that answer one question each morning: **how hard should I go today?**

Built as a static site (React + Vite), backed entirely by Supabase, and installable to your home
screen on iOS and Android.

---

## Table of contents

1. [What it does](#what-it-does)
2. [The four scores](#the-four-scores)
3. [Quick start](#quick-start)
4. [Supabase setup](#supabase-setup)
5. [Apple Watch sync](#apple-watch-sync)
6. [Deploying to GitHub Pages](#deploying-to-github-pages)
7. [Installing as an app](#installing-as-an-app)
8. [Project structure](#project-structure)
9. [Tech stack](#tech-stack)
10. [Troubleshooting](#troubleshooting)

---

## What it does

| Screen | What's on it |
|---|---|
| **Home** | Four animated score rings, today's raw metrics, a breakdown of how each score was calculated, insights, weekly averages and personal records |
| **Workouts** | Log sessions with type, duration and 1–10 intensity; MET-based calorie estimate; 7-day rollup |
| **Sleep** | Bedtime/wake time with auto-calculated duration, quality rating, 14-night bar chart |
| **Journal** | Habit toggles (alcohol, travel, meditation), stress and diet ratings, notes — with a live readout of the net effect on your recovery score |
| **Trends** | Seven interactive charts over 7 / 30 / 90 days: recovery, HRV, resting HR, sleep, exertion-vs-recovery, readiness, steps & calories |
| **Settings** | Profile, calorie target, theme, Apple Watch sync credentials, JSON/CSV export |

Everything works offline once loaded — the service worker serves the app shell from cache and
falls back to your last-synced data.

---

## The four scores

All four are 0–100 and recalculated automatically after every entry. The implementation lives in
[`src/lib/scores.js`](src/lib/scores.js) — pure functions, no side effects, easy to tune.

### Recovery

Measures autonomic readiness against **your own** 7-day rolling baseline, not population norms.

| Input | Weight | Direction |
|---|---|---|
| HRV vs 7-day average | 60% | Higher is better |
| Resting HR vs 7-day average | 40% | Lower is better |

Each sub-score is centred on 50 (exactly at baseline) and saturates at 0/100. HRV swings far more
day to day than resting HR, so they use different sensitivities: ±25% of HRV spans the full range,
but only ±10% of resting HR does.

Lifestyle modifiers are then added:

| Modifier | Points |
|---|---|
| Alcohol | −10 |
| High stress (4–5/5) | −8 |
| Poor diet (1–2/5) | −5 |
| Travel | −4 |
| Meditation | +5 |
| Good sleep (7.5h+ at quality 4+) | +10 |

> With no baseline yet, both sub-scores fall back to a neutral 50. Expect your first week to read
> around the middle while the baseline builds.

### Sleep

```
duration score × 0.6  +  quality score × 0.4
```

Duration bands: `<6h → 40`, `6–7h → 60`, `7–8h → 80`, `>8h → 100`.
Quality is your own 1–5 rating mapped to 20–100.

### Exertion

```
min(100,  (active calories / your target) × 100  +  intensity bonus)
```

The intensity bonus (up to +20) scales with intensity × duration, so a short brutal session and a
long steady one land in similar places. Set your daily calorie target during onboarding or in
Settings.

**Exertion is the one score where high is not good** — it measures load, not quality. The UI
labels it "Light load / Moderate load / High load / Very high load" rather than poor-to-excellent.

### Readiness

```
recovery × 0.5  +  sleep × 0.3  +  (100 − exertion) × 0.2
```

Exertion is inverted because accumulated load *reduces* readiness. The weights sum to 1.0, so the
result stays on a true 0–100 scale.

> **Note on the formula.** The original spec wrote this last term as `100 - Exertion * 0.2`, which
> evaluates to 80–100 regardless of load and pushes the total to ~180. VitalSync implements
> `(100 - exertion) * 0.2`, the normalised reading. Change it in `calcReadinessScore` if you want
> the literal version.

### Colour bands

| Range | Band | Colour |
|---|---|---|
| 80–100 | Excellent | Green |
| 60–79 | Good | Yellow |
| 40–59 | Moderate | Orange |
| 0–39 | Poor | Red |

---

## Quick start

```bash
git clone <your-repo-url> vitalsync
cd vitalsync
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open http://localhost:5173. If the env vars are missing you'll get a setup screen instead of
cryptic network errors.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the PWA icon set from `scripts/generate-icons.mjs` |

### Environment variables

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Both come from **Supabase Dashboard → Project Settings → API**. The anon key is designed to be
public — it ships in the JS bundle, and row-level security is what actually protects your data.

Vite reads `.env.local` only at startup, so restart the dev server after editing it.

---

## Supabase setup

**1. Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard). Any region;
the free tier is more than enough for one person.

**2. Run the migration.** Open **SQL Editor → New query**, paste the entire contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and run it. This creates:

- six tables — `users`, `health_logs`, `sleep_logs`, `workout_logs`, `journal_logs`, `scores`
- range constraints on every metric (a 400 bpm resting heart rate can't poison your baseline)
- a unique `(user_id, date)` constraint on the daily tables, which the app upserts against
- indexes on `(user_id, date desc)`
- `updated_at` triggers
- a trigger that creates a profile row whenever someone signs up
- **row-level security on all six tables**, with every policy pinned to `auth.uid()`

With the CLI instead:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

**3. Configure auth.** Under **Authentication → Providers**, Email is on by default. For a
single-user personal app you probably want:

- **Authentication → Providers → Email → Confirm email: off** — lets you sign in immediately
- **Authentication → URL Configuration → Site URL** — set to your deployed URL
  (e.g. `https://<username>.github.io/vitalsync/`) so magic links and password resets come back
  to the right place. Add `http://localhost:5173` to **Redirect URLs** for local development.

**4. Deploy the sync function** (only if you want Apple Watch sync):

```bash
supabase functions deploy health-sync
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically — no extra secrets needed.

**5. Sign up** in the app and complete onboarding. That's it.

### Schema at a glance

| Table | Rows | Key columns |
|---|---|---|
| `users` | one per account | `age`, `weight`, `height`, `fitness_goal`, `calorie_target` |
| `health_logs` | one per day | `hrv`, `resting_hr`, `spo2`, `body_temp`, `active_calories`, `steps`, `source` |
| `sleep_logs` | one per day | `duration_hours`, `quality_rating`, `bedtime`, `wake_time` |
| `workout_logs` | many per day | `type`, `duration_mins`, `intensity`, `calories_burned`, `notes` |
| `journal_logs` | one per day | `alcohol`, `travel`, `meditation`, `stress_level`, `diet_quality`, `notes` |
| `scores` | one per day | `recovery_score`, `sleep_score`, `exertion_score`, `readiness_score` |

`scores` is derived data, stored so trend charts stay fast and history stays stable. Rebuild it
any time from **Settings → Rebuild all scores**.

---

## Apple Watch sync

**Short answer to the obvious question: no, the app cannot read Apple Health by itself.** iOS keeps
HealthKit off-limits to web apps — there is no browser API for it, and installing VitalSync to your
home screen doesn't change that. Only native apps get HealthKit access.

So the data gets **pushed in** instead. Both routes below POST to the same endpoint:

```
https://<your-project>.supabase.co/functions/v1/health-sync
```

Find your exact URL and auth token in **Settings → Apple Watch sync** inside the app.

### Option A — Health Auto Export (paid app, fully automatic)

The most reliable route. [Health Auto Export](https://apps.apple.com/app/health-auto-export-json-csv/id1115567069)
reads HealthKit in the background and posts on a schedule.

1. Install the app and grant it Health read access.
2. **Automations → Add Automation → REST API**.
3. **URL:** your `/health-sync` endpoint from Settings.
4. **Method:** POST · **Format:** JSON · **Aggregation:** Daily.
5. **Headers:** add `Authorization` with the value `Bearer <your-token>` (copy the token from
   Settings → Apple Watch sync → Reveal).
6. **Metrics:** Heart Rate Variability, Resting Heart Rate, Step Count, Active Energy, Sleep
   Analysis, Blood Oxygen Saturation, Apple Sleeping Wrist Temperature.
7. **Frequency:** hourly, or daily at ~7am.

The Edge Function understands Health Auto Export's native `{ data: { metrics: [...] } }` envelope
and normalises its metric names automatically.

### Option B — iOS Shortcut (free, runs on a schedule)

1. Open **Shortcuts → Automation → New → Time of Day → 7:00 am → Run Immediately**.
2. Add **Find Health Samples** actions for each metric you want. For each one: set the type, sort
   by *Start Date* descending, limit to 1, then **Get Details of Health Sample → Value**. Store
   each into a variable.
3. Add **Text** and build the JSON body:

```json
{
  "date": "2026-07-28",
  "hrv": 62.4,
  "resting_hr": 51,
  "spo2": 97,
  "body_temp": 36.6,
  "active_calories": 540,
  "steps": 9231,
  "sleep_hours": 7.4,
  "sleep_quality": 4
}
```

   Drop your variables in place of the numbers. Omit any field you don't collect — every key is
   optional, and `date` defaults to today.

4. Add **Get Contents of URL**:
   - **URL:** your `/health-sync` endpoint
   - **Method:** POST
   - **Headers:** `Authorization` = `Bearer <your-token>`, `Content-Type` = `application/json`
   - **Request Body:** File → the Text action from step 3

5. Run it once manually to check you get `{"ok": true, ...}` back.

### What the endpoint accepts

Field names are matched loosely, so `heart_rate_variability`, `hrv_sdnn` and `hrv` all work.
Values outside physiological ranges are dropped rather than stored. Health metrics go to
`health_logs`; `sleep_hours` and `sleep_quality` are routed to `sleep_logs`. Everything upserts on
`(user_id, date)`, so re-sending the same day is safe.

Responses:

| Status | Meaning |
|---|---|
| `200` | `{ ok: true, health_logs: 1, sleep_logs: 1, dates: [...] }` |
| `401` | Missing or expired `Authorization` header |
| `422` | No recognised metrics — the response lists every accepted field name |

### About the token

The token in Settings is your Supabase **access token**, and it expires (one hour by default).
That's fine for a manual test but will break an unattended daily automation.

For a long-lived setup, either:

- **Raise the JWT expiry** — Supabase Dashboard → Authentication → Sessions → *Access token (JWT)
  expiry*. Setting it to a week keeps a personal automation running with occasional re-pasting.
- **Or exchange a refresh token in the Shortcut** — POST to
  `https://<project>.supabase.co/auth/v1/token?grant_type=refresh_token` with
  `{"refresh_token": "<yours>"}` and an `apikey` header, then use the `access_token` from the
  response for the sync call.

Scores are deliberately **not** computed by the Edge Function. Recovery depends on a 7-day rolling
baseline the app already holds in memory, and it recalculates the moment you open VitalSync — so
the algorithm lives in exactly one place, in JavaScript.

---

## Deploying to GitHub Pages

**1. Push to GitHub.** The repo name matters: `vite.config.js` defaults `base` to `/vitalsync/`.
The workflow overrides it with your actual repo name, so any name works — but if you build locally
for a differently-named repo, set `BASE_PATH=/your-repo-name/`.

**2. Add your Supabase secrets.** Settings → Secrets and variables → Actions → New repository
secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**3. Turn on Pages.** Settings → Pages → **Source: GitHub Actions**.

**4. Push to `main`.** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs,
lints, builds and publishes `dist/`. Your app lands at
`https://<username>.github.io/<repo>/`.

**5. Update Supabase URLs.** Authentication → URL Configuration → set **Site URL** to your Pages
URL, or magic links will redirect to the wrong origin.

### The 404 redirect

GitHub Pages has no server-side rewrite, so refreshing on `/vitalsync/trends` would normally 404.
[`public/404.html`](public/404.html) encodes the requested path into a query string and bounces to
the app root; a matching snippet in `index.html` unpacks it and hands the real path to React
Router. Both are adapted from
[spa-github-pages](https://github.com/rafgraph/spa-github-pages) (MIT).

If you deploy to a **user site** (`username.github.io`) or a custom domain served from the root,
set `pathSegmentsToKeep = 0` in `public/404.html` and build with `BASE_PATH=/`.

### Deploying elsewhere

Netlify, Vercel and Cloudflare Pages all serve this fine — build with `BASE_PATH=/`, publish
`dist/`, and add a catch-all rewrite to `/index.html` (which makes `404.html` unnecessary).

---

## Installing as an app

**iOS (Safari only — Chrome on iOS can't install PWAs):** open the site → Share → *Add to Home
Screen*. It launches fullscreen with no browser chrome.

**Android (Chrome):** you'll get an install prompt, or use ⋮ → *Install app*.

**Desktop (Chrome/Edge):** install icon in the address bar.

The service worker uses `autoUpdate`, so a new deploy activates on the next launch. Supabase
requests use a network-first strategy with a 6-second timeout and a 7-day cache, which is what
lets the dashboard still render your last known data on a plane.

---

## Project structure

```
vitalsync/
├── .github/workflows/deploy.yml    GitHub Pages CI
├── public/
│   ├── 404.html                    SPA redirect for deep links
│   ├── offline.html                Offline fallback page
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   └── icons/                      192, 512 and maskable PWA icons
├── scripts/generate-icons.mjs      Zero-dependency PNG icon generator
├── src/
│   ├── main.jsx                    Entry point, router, SW registration
│   ├── App.jsx                     Routes + protected-route gate
│   ├── index.css                   Tailwind layers + theme CSS variables
│   ├── lib/
│   │   ├── supabase.js             Client + human-readable error mapping
│   │   ├── scores.js               ★ All four score algorithms
│   │   ├── insights.js             Insight generation, weekly stats, PRs
│   │   └── dates.js                Day-key helpers (yyyy-MM-dd, local time)
│   ├── store/
│   │   ├── useAuthStore.js         Session + profile (Zustand)
│   │   └── useDataStore.js         All health tables + score recomputation
│   ├── context/ThemeContext.jsx    Dark/light with no flash of wrong theme
│   ├── components/
│   │   ├── ui/index.jsx            Card, Button, Input, Modal, Toggle, …
│   │   ├── ScoreRing.jsx           Animated SVG rings + linear bars
│   │   ├── ChartTooltip.jsx        Shared Recharts tooltip
│   │   ├── InsightsPanel.jsx       Insights, weekly summary, records
│   │   ├── BottomNav.jsx           Tab bar (rail on desktop)
│   │   └── Layout.jsx              Header, error banner, online status
│   └── pages/                      Login, Onboarding, Dashboard, LogHealth,
│                                   Workouts, Sleep, Journal, Trends, Settings
└── supabase/
    ├── migrations/0001_init.sql    Schema + RLS
    └── functions/health-sync/      Apple Watch ingestion Edge Function
```

### Notes on the code

- **Data loading.** Every table is fetched once for a 120-day window and held in memory. At
  personal-log scale that's a few hundred rows, far cheaper than a round trip per screen, and it
  makes rolling baselines trivial to compute.
- **Score persistence.** After every mutation the affected day is recomputed and upserted, with an
  optimistic local update first so the rings animate immediately.
- **Error handling.** Every Supabase error passes through `describeError()`, which maps Postgres
  codes and network failures to readable sentences. Nothing renders `[object Object]`.
- **UI components.** Built in the shadcn/ui spirit — Tailwind-composed primitives owned in-repo —
  but written directly rather than generated by the CLI, which would have pulled in a TypeScript
  and path-alias setup this project doesn't otherwise need.

---

## Tech stack

| Package | Role |
|---|---|
| React 18 + Vite 6 | UI and build |
| Tailwind CSS 3 | Styling, class-based dark mode |
| Zustand 5 | State management |
| React Router 6 | Routing |
| Recharts 2 | All charts |
| Supabase JS 2 | Database, auth, storage |
| date-fns 4 | Date handling |
| Lucide React | Icons |
| vite-plugin-pwa (Workbox) | Service worker, manifest, offline |

---

## Troubleshooting

**"VitalSync needs configuring"** — the env vars aren't reaching the app. Check `.env.local` exists
(not `.env.example`), the keys start with `VITE_`, and you restarted the dev server.

**"Database tables are missing"** — the migration hasn't run. Paste `0001_init.sql` into the
Supabase SQL editor.

**"Permission denied by row-level security"** — you're not signed in, or the migration's policies
didn't apply. Re-run the RLS section of `0001_init.sql`.

**Signed in but no data** — check the `user_id` on your rows matches your auth user. Settings →
Refresh from Supabase forces a reload.

**Scores look wrong after changing the calorie target** — Settings → Rebuild all scores. (Saving a
new target does this automatically.)

**Recovery is stuck at 50** — that's the neutral fallback when there's no 7-day baseline yet. Log
HRV and resting HR for about a week.

**Blank page on GitHub Pages** — `base` doesn't match your repo name. The workflow sets it from
the repo name automatically; if you built locally, pass `BASE_PATH=/your-repo/`.

**404 on refresh** — `public/404.html` didn't make it into `dist/`, or `pathSegmentsToKeep` is
wrong for your hosting setup. See [the 404 redirect](#the-404-redirect).

**Sync returns 401** — your access token expired. Reveal a fresh one in Settings, or raise the JWT
expiry / use the refresh-token flow described [above](#about-the-token).

**Sync returns 422** — none of your field names were recognised. The response body lists every
accepted name.

**PWA won't install on iOS** — must be Safari, and must be served over HTTPS.

---

## Disclaimer

VitalSync is a personal tracking tool. Its scores are informational and **not medical advice**.
Don't use it to diagnose, treat or make decisions about a medical condition.

---

## Licence

MIT — do whatever you like with it.
