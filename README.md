# VitalSync

A personal health, recovery and readiness dashboard — an Athlytic-style PWA you host yourself.
Log HRV, resting heart rate, sleep, workouts and daily habits; VitalSync turns them into four
scores that answer one question each morning: **how hard should I go today?**

Built as a static site (React + Vite), backed entirely by Supabase, and installable to your home
screen on iOS and Android.

---

## This deployment

| | |
|---|---|
| **Live app** | https://singhavinash2915.github.io/vitalsync/ |
| **Repo** | https://github.com/singhavinash2915/vitalsync |
| **Supabase project** | `vbyhumvshwsvbjtpwrmx` — https://vbyhumvshwsvbjtpwrmx.supabase.co |
| **Sync endpoint** | `https://vbyhumvshwsvbjtpwrmx.supabase.co/functions/v1/health-sync` |

Already done: schema + RLS migrated, `health-sync` Edge Function deployed, GitHub Actions secrets
set, Pages building from `main`. Push to `main` and it redeploys.

The generic setup instructions below are kept for rebuilding from scratch or pointing at a
different project.

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
| **Settings** | Profile, calorie target, theme, sync status, Apple Health import, sync keys, JSON/CSV export |

Everything works offline once loaded — the service worker serves the app shell from cache and
falls back to your last-synced data.

---

## The four scores

All four are 0–100 and recalculated automatically after every entry. The implementation lives in
[`src/lib/scores.js`](src/lib/scores.js) — pure functions, no side effects, easy to tune.

### Recovery

Measures autonomic readiness against **your own 60-day rolling baseline**, not population norms.

| Input | Weight | Direction |
|---|---|---|
| HRV vs 60-day baseline | 60% | Higher is better |
| Resting HR vs 60-day baseline | 40% | Lower is better |

> The baseline was 7 days and that was too short: a bad week *becomes* the baseline, so the next
> ordinary day scores like a personal best. On real data an HRV of 48.9 ms — about 10% above a
> long-run average of 44 — scored **98** on a 7-day baseline purely because the preceding week had
> been poor. On a 60-day baseline the same day scores 79. Sixty days is stable against a rough
> patch yet still follows genuine seasonal change, and matches the window Training Today's RTT
> uses. Below 5 readings the sub-score stays a neutral 50 rather than pretending to know.

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

If nothing was logged the score is **null, not 0** — "I didn't record it" is a different claim from
"I slept badly", and scoring the former as zero quietly cost 30 points of readiness to anyone who
doesn't wear a watch overnight.

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

**Unlogged components are excluded and the remaining weights renormalised.** With no sleep record,
readiness is `(recovery × 0.5 + (100 − exertion) × 0.2) / 0.7`. Only a genuine null counts as
missing — an exertion of 0 is a real rest day, not an absence.

### Tuning your calorie target

The 600 default is a guess. If it lands near your average burn, exertion pegs at 100 on half your
days, carries no information, and permanently docks readiness by the full 20-point weight.

Settings shows a suggestion computed from your own logged days once you have at least a week:
`median ÷ 0.7`, rounded to 50 — which aims a typical day at 70% and leaves headroom for a hard one.

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
git clone https://github.com/singhavinash2915/vitalsync.git
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

[`0002_sync_keys_and_workout_dedupe.sql`](supabase/migrations/0002_sync_keys_and_workout_dedupe.sql)
then adds long-lived sync keys and a unique index that makes re-importing an export idempotent.

With the CLI instead:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

**3. Configure auth.** Under **Authentication → Providers**, Email is on by default. For a
single-user personal app you probably want:

- **Authentication → Providers → Email → Confirm email: off** — lets you sign in immediately
- **Authentication → URL Configuration → Site URL** — set to
  `https://singhavinash2915.github.io/vitalsync/` so magic links and password resets come back to
  the right place. Add `http://localhost:5173` to **Redirect URLs** for local development.

> These two are the only steps not already applied to this project — they're auth settings, so
> flip them yourself at
> [the auth settings page](https://supabase.com/dashboard/project/vbyhumvshwsvbjtpwrmx/auth/providers).
> Email/password sign-up works without them; only magic links and password resets need the Site URL.

**4. Deploy the sync function** (only if you want Apple Watch sync):

```bash
supabase functions deploy health-sync --no-verify-jwt
```

`--no-verify-jwt` is required: the gateway's default JWT check rejects any request without an
`Authorization` header, including the `X-Sync-Key` requests this endpoint exists to serve. It does
**not** make the function public — it authenticates every caller itself and 401s otherwise.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
no extra secrets needed.

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

So the data gets **pushed in**. Three ways, from most to least automatic:

| | Effort | Runs by itself? |
|---|---|---|
| [Health Auto Export → REST API](#option-a--health-auto-export-fully-automatic) | 5 min setup, paid app | ✅ Yes — hourly or daily |
| [iOS Shortcut automation](#option-b--ios-shortcut-free) | 20 min setup, free | ✅ Yes — daily at a set time |
| [Apple's own export.xml](#option-c--apples-own-export-free-no-third-party-app) | One-time backfill, free | ❌ No — see note |
| [Manual JSON import](#option-d--manual-json-import) | Per export | ❌ No |

All three hit the same endpoint:

```
https://vbyhumvshwsvbjtpwrmx.supabase.co/functions/v1/health-sync
```

### Get a sync key first

Automation needs a credential that doesn't expire. In the app: **Settings → Apple Watch sync →
Create sync key**. You get something like `vsk_a1b2c3…`, shown **once**.

Send it as a header on every request:

```
X-Sync-Key: vsk_a1b2c3...
```

Why not the session token? Supabase access tokens expire in about an hour. They're fine for a
one-off `curl` test and useless for a 7am automation. Sync keys never expire, are stored only as a
SHA-256 hash, and can be revoked in the app at any time. The endpoint still accepts
`Authorization: Bearer <access_token>` if you prefer.

### Option A — Health Auto Export (fully automatic)

The most reliable route. [Health Auto Export](https://apps.apple.com/app/health-auto-export-json-csv/id1115567069)
reads HealthKit in the background and posts on a schedule.

1. Install the app and grant it Health read access.
2. **Automations → Add Automation → REST API**.
3. **URL:** the endpoint above.
4. **Method:** POST · **Format:** JSON · **Aggregation:** Daily.
5. **Headers:** add `X-Sync-Key` with your key as the value.
6. **Metrics:** Heart Rate Variability, Resting Heart Rate, Step Count, Active Energy, Sleep
   Analysis, and — if your watch records them — Blood Oxygen and Apple Sleeping Wrist Temperature.
7. **Include workouts:** on. They land in your workout log automatically.
8. **Frequency:** hourly, or daily at ~7am.

That's it. The endpoint understands Health Auto Export's native envelope, including its `workouts`
array, and upserts on date — so overlapping exports never duplicate anything.

### Option B — iOS Shortcut (free, and the right answer for daily use)

Shortcuts is built into iOS. This is the only route that is both free and automatic, so it's what
you actually want running every morning. Roughly ten minutes to build once.

The endpoint accepts a **form body**, which matters here: Shortcuts lets you add key/value pairs
in its own UI, so you never have to hand-write JSON inside a Text action.

**1. New automation**
Shortcuts → **Automation** tab → **+** → **Time of Day** → 7:00 am → Daily → **Run Immediately**
(turn *Notify When Run* off).

**2. Pull each metric**
For each of the five below, add these three actions in order:

| Action | Setting |
|---|---|
| **Find Health Samples** | type as per table, **Sort by** Start Date, **Order** Latest First, **Limit** 1 |
| **Get Details of Health Sample** | Detail: **Value** |
| **Set Variable** | name it, e.g. `hrv` |

| Metric | Health sample type | Variable |
|---|---|---|
| HRV | Heart Rate Variability | `hrv` |
| Resting heart rate | Resting Heart Rate | `rhr` |
| Steps | Steps — set **Limit** off, add **Calculate Statistics → Sum** | `steps` |
| Active energy | Active Energy — **Limit** off, **Calculate Statistics → Sum** | `cal` |
| Sleep | Sleep — **Limit** off, **Calculate Statistics → Sum**, Detail: **Duration** | `sleep` |

For Steps, Active Energy and Sleep, set the Find action's date filter to **Start Date is today**
(or *yesterday* for sleep) so you sum one day rather than all history.

**3. Send it**
Add **Get Contents of URL**:

- **URL:** `https://vbyhumvshwsvbjtpwrmx.supabase.co/functions/v1/health-sync`
- **Method:** POST
- **Headers:** `X-Sync-Key` → your `vsk_…` key from Settings
- **Request Body:** **Form** ← not JSON
- Add fields, dropping the matching variable into each value:

  | Key | Value |
  |---|---|
  | `hrv` | `hrv` variable |
  | `resting_hr` | `rhr` variable |
  | `steps` | `steps` variable |
  | `active_calories` | `cal` variable |
  | `sleep_hours` | `sleep` variable |

Every field is optional and `date` defaults to today, so start with two or three and add the rest
once it works.

**4. Test it**
Run the shortcut manually. You want `{"ok": true, ...}` back. Add a **Show Result** action while
testing, then delete it.

**5. Confirm it keeps working**
The dashboard carries a status strip, and Settings has the detail. It reports two different things
on purpose:

- **Data arrived** — when a row was last *written*. Tells you the automation is alive.
- **Covers up to** — the newest *date* held. Tells you the data is current.

Either alone can mislead. A shortcut that keeps firing but exports a stale range shows a fresh
write time with dates falling behind; a shortcut that died looks fine for a day on write time
alone. The strip turns amber if either goes wrong, and shows an **Auto** badge only when a push has
genuinely landed in the last 36 hours.

Sleep duration usually comes back in **minutes** or **seconds** — that's fine, the endpoint infers
the unit from magnitude and converts.

### Option C — Apple's own export (free, no third-party app)

Health Auto Export is a paid app once its free exports run out. iOS has a built-in export that
costs nothing and actually contains *more* data:

1. iPhone **Health** app → your photo, top right → **Export All Health Data**.
2. Share the resulting `export.zip` to **Files** (or AirDrop it to a Mac).
3. In Files, long-press the zip → **Uncompress**. You now have `export.xml`.
4. VitalSync → **Settings → Apple Watch sync → Import health JSON** → **Choose file** →
   `export.xml`.

**Use this once, for backfill — not daily.** The export is your entire health history every time,
so a daily 880 MB round trip is not a workflow. Set up the Shortcut above for ongoing data.

**Import it on a computer, not the phone.** The scanner is size-agnostic, but mobile Safari caps
tab memory at roughly 200–400 MB and will kill the page before the file is even handed over. Open
the app on a Mac or PC, import there once, and it's done. VitalSync warns you rather than crashing
if you try it on a phone with a file over 250 MB.

The catch is size — a few years of Apple Watch data is routinely 200 MB to over 1 GB, which is why
most tools won't touch it. VitalSync reads it in 4 MB slices with a streaming scanner
([`src/lib/appleHealthXml.js`](src/lib/appleHealthXml.js)), so memory stays flat no matter how big
the file is. Measured: a **1.14 GB export with 4,844,448 records parses in 3.1 seconds** with no
net heap growth.

It extracts HRV, resting heart rate, SpO₂, wrist temperature, steps and active energy (summing the
hundreds of per-day samples rather than averaging them), and reconstructs sleep by summing the
`Asleep*` stage records — attributing each night to the morning it ended, and ignoring `InBed`
time you were awake.

### Option D — manual JSON import

Same screen, if you already have a Health Auto Export JSON: choose the file or paste the contents.
You'll see a preview — days, date range, metrics found, workouts, anything ignored — before
anything is written.

Re-importing is always safe: daily rows upsert on date, and workouts deduplicate on Apple's own
workout UUID.

### What the endpoint accepts

**Body formats:** JSON, `application/x-www-form-urlencoded`, `multipart/form-data`, or plain query
parameters — `POST /health-sync?hrv=48.9&resting_hr=53` works on its own. The form and query
support exists so an iOS Shortcut can send data through its own key/value UI without composing
JSON by hand.

Field names are matched loosely — `heart_rate_variability`, `hrv_sdnn` and `hrv` all work — and
values outside physiological ranges are dropped rather than stored, because one bad reading poisons
a 7-day rolling baseline for a week.

**Units are read from the payload, not assumed.** This matters more than it sounds: Health Auto
Export reports energy in **kilojoules** on a lot of devices, and 2708 kJ vs 2708 kcal both look
plausible to a range check. Storing kJ as kcal would overstate active calories by 4.2× and peg your
exertion score at 100 every single day. Energy is converted from kJ, sleep from minutes or seconds,
and temperature from Fahrenheit, all based on the declared units.

| Response | Meaning |
|---|---|
| `200` | `{ ok: true, health_logs: 31, sleep_logs: 2, workout_logs: 4, dates: [...] }` |
| `401` | Missing, unknown or revoked credential |
| `422` | No recognised metrics — the response lists every accepted field name |

Scores are deliberately **not** computed by the Edge Function. Recovery depends on a 7-day rolling
baseline the app already holds in memory, and it recalculates the moment you open VitalSync — so
the algorithm lives in exactly one place, in JavaScript.

---

## Deploying to GitHub Pages

> Already set up for this repo — steps 1–4 are done, and pushing to `main` redeploys. Note that
> **Pages requires a public repo** unless you're on GitHub Pro or Team; that's why this one is
> public. Your health data isn't affected: it lives in Supabase behind row-level security, and the
> anon key in the bundle is designed to be public.

**1. Push to GitHub.** The repo name matters: `vite.config.js` defaults `base` to `/vitalsync/`.
The workflow overrides it with your actual repo name, so any name works — but if you build locally
for a differently-named repo, set `BASE_PATH=/your-repo-name/`.

**2. Add your Supabase secrets.** Settings → Secrets and variables → Actions → New repository
secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**3. Turn on Pages.** Settings → Pages → **Source: GitHub Actions**.

**4. Push to `main`.** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs,
lints, builds and publishes `dist/` — here, to
https://singhavinash2915.github.io/vitalsync/.

**5. Update Supabase URLs.** Authentication → URL Configuration → set **Site URL** to your Pages
URL, or magic links will redirect to the wrong origin.

> Order matters: add the secrets **before** the first push. Vite inlines env vars at build time, so
> a build that runs without them produces a bundle that shows the setup screen. If that happens,
> add the secrets and re-run the workflow (Actions → Deploy to GitHub Pages → Run workflow).

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
│   │   ├── healthImport.js         Apple Health export parser (units, workouts)
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
│   │   ├── ImportHealthModal.jsx   Paste/upload an export, preview, bulk import
│   │   ├── BottomNav.jsx           Tab bar (rail on desktop)
│   │   └── Layout.jsx              Header, error banner, online status
│   └── pages/                      Login, Onboarding, Dashboard, LogHealth,
│                                   Workouts, Sleep, Journal, Trends, Settings
└── supabase/
    ├── config.toml                 verify_jwt = false for health-sync
    ├── migrations/                  Schema + RLS, then sync keys
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

**Import fails the second time / nothing happens when picking a file** — two causes, both fixed in
`0003` and the current build. Apply the latest migrations (`supabase db push`): a *partial* unique
index on `workout_logs` cannot satisfy `ON CONFLICT`, so re-imports aborted with `42P10`. The other
was the file input keeping its previous value, so re-picking the same filename fired no event.

**Everything reads "Poor" even on a good morning** — you probably aren't logging sleep. Unlogged
components are now excluded from readiness rather than scored 0, so make sure you're on the current
build; then check Settings → Rebuild all scores.

**Recovery is stuck at 50** — that's the neutral fallback when there's no 7-day baseline yet. Log
HRV and resting HR for about a week.

**Everything stopped working / "Failed to fetch" everywhere** — the Supabase project is probably
paused. The free tier pauses after 7 days without activity, and a paused project stops resolving in
DNS entirely, so the app can't reach it at all:

```bash
nslookup vbyhumvshwsvbjtpwrmx.supabase.co
# NXDOMAIN  ->  paused.  An address  ->  awake.
```

Your data is safe. Restore it from
[the dashboard](https://supabase.com/dashboard/project/vbyhumvshwsvbjtpwrmx) — one click, a couple
of minutes. To stop it recurring, [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)
pings the database daily; the Apple Health sync automation also keeps it awake on its own once it's
running. (GitHub disables scheduled workflows on a repo with no commits for 60 days, so the two
together are better than either alone.)

**Blank page on GitHub Pages** — `base` doesn't match your repo name. The workflow sets it from
the repo name automatically; if you built locally, pass `BASE_PATH=/your-repo/`.

**404 on refresh** — `public/404.html` didn't make it into `dist/`, or `pathSegmentsToKeep` is
wrong for your hosting setup. See [the 404 redirect](#the-404-redirect).

**Sync returns 401** — if you're using a session token, it expired; switch to a sync key
(Settings → Apple Watch sync → Create sync key), which never does. If you're already using a key,
it may have been revoked — create a new one.

**Active calories look ~4× too high** — the export is in kilojoules and something isn't converting.
VitalSync reads the `units` field and divides by 4.184 for kJ; if a custom exporter omits units,
convert before sending.

**Sleep score is 0 despite wearing the watch** — Apple only records sleep if Sleep Focus / sleep
tracking is enabled in the Watch app *and* you wear it overnight. Short daytime entries are naps,
not nights. You can always log sleep by hand on the Sleep tab.

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
