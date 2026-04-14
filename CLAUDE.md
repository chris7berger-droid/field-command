# Field Command

## What This Is
Field Command is a crew-facing mobile app for construction subcontractors. It's the field counterpart to Sales Command (scmybiz.com) and Schedule Command (schmybiz.com) in the Command Suite. Crew members use it to clock in/out, view tasks, fill daily production reports, and upload job photos — all offline-first.

Field Command is also a **standalone product**: mobile app + web dashboard (not yet built). When standalone, the web dashboard replaces Schedule Command's approval queue and Sales Command's Field SOW builder.

## Team
- **Chris** — developer and primary user
- **Office staff** — Joe, John, Denise (will use web dashboard)
- **Field manager** — Jonah
- **Field crew** — Troy + others (primary mobile users)

## Tech Stack
- **React Native** (Expo SDK 54) — mobile app
- **PowerSync** (op-sqlite adapter) — offline-first sync engine
- **Supabase** — database, auth, edge functions, storage
- **Cloudflare R2** — photo storage (presigned upload via edge function)
- **GitHub** — version control (repo: chris7berger-droid/field-command)

## Bundle ID
- iOS: `com.fieldcommand.app`
- Android: `com.fieldcommand.app`

## Supabase Project (shared with Sales Command + Schedule Command)
- **Project ID:** pbgvgjjuhnpsumnowuym
- **URL:** https://pbgvgjjuhnpsumnowuym.supabase.co
- **Anon key:** in `src/lib/supabase.js` (hardcoded fallback)
- **Shared DB:** All Command Suite apps use the same Supabase project

## PowerSync Cloud
- **Instance URL:** https://69d81f100e377e689729db98.powersync.journeyapps.com
- **Dashboard:** dashboard.powersync.com, org chris7berger-droid, project Field Command
- **Sync Streams (edition 3):** call_log, proposal_wtc, team_members, time_punches, daily_production_reports
- **Client Auth:** Supabase Auth with JWT secret
- **Single-tenant** — global bucket, no per-user filtering yet

## Edge Functions
- **upload-photo** — presigned URL for R2 upload, returns public dev URL
- Deploy with `--no-verify-jwt` to avoid 401s

## Cloudflare R2
- **Public dev URL:** https://pub-3b94ed6350b94427ac753fe3564cfb37.r2.dev
- **Photo path:** `/jobs/{job_id}/{date}/{uuid}_{filename}`

## Project Structure
```
App.js                          — Entry point, font loading, PowerSync provider, navigation
src/
  components/
    LinenBackground.js          — Crosshatch linen texture overlay (opacity 0.55)
    PunchStatusBar.js           — Current punch state indicator
  lib/
    connector.js                — PowerSync ↔ Supabase connector (auth + uploadData)
    location.js                 — GPS/location helpers
    photos.js                   — Photo compress + upload pipeline
    powersync.js                — PowerSync database singleton
    schema.js                   — PowerSync schema (5 tables)
    supabase.js                 — Supabase client
    tokens.js                   — Design tokens (colors, fonts, spacing, common styles)
    utils.js                    — Misc utilities
    weather.js                  — Weather fetch for punches
  screens/
    HomeScreen.js               — Job list / landing screen
    JobDetailScreen.js          — Single job with tab navigation
    JobListScreen.js            — Job list view
    LoginScreen.js              — Auth screen
    WelcomeScreen.js            — DEAD CODE (not imported, can delete)
    tabs/
      ReportTab.js              — Daily production report form
      TasksTab.js               — Task list for a job
      TimeClockTab.js           — Clock in/out, lunch, drive time
supabase/
  functions/
    upload-photo/index.ts       — R2 presigned URL edge function
```

## PowerSync Schema (src/lib/schema.js)

### Read-only tables (sync down from Supabase):
- **call_log** — jobs (id is INTEGER, stage values capitalized: 'Sold', 'Has Bid', etc.)
- **proposal_wtc** — WTC data including field_sow JSONB
- **team_members** — crew roster

### Read-write tables (written locally, synced up):
- **time_punches** — clock in/out, lunch, drive time (indexed by job_id + punch_date)
- **daily_production_reports** — end-of-shift submission by job lead (indexed by job_id + report_date)

## Database Notes
- `call_log.id` is INTEGER (not UUID)
- No `tenant_id` on any table — single-tenant
- JSONB fields stored as text in SQLite (field_sow, materials, tasks, photos, etc.)
- `prevailing_wage` lives on both call_log (denormalized) and proposal_wtc

## Design System (Command Suite)
Must match the visual design across Sales Command, Schedule Command, and AR Command.

### Colors (src/lib/tokens.js)
- Background: warm linen — `#b5a896` (base), `#c8bcaa` (cards), `#a89b88` (deep)
- Dark header/nav: `#1c1814`
- Primary accent: teal `#30cfac` — always on dark (`#1c1814`) background
- Content accent: Command Green `#5BBD3F` (available but not primary on mobile)
- Text: `#1c1814` (headings), `#2d2720` (body), `#6b6358` (light), `#887c6e` (faint)
- NO white backgrounds anywhere

### Typography
- Display/headings: Barlow Condensed — bold, uppercase, letter-spacing
- Body: Barlow — normal weight
- Fonts loaded via expo-font + @expo-google-fonts

### Linen Texture
- Crosshatch PNG overlay at opacity 0.55 — core brand element, not just flat color
- LinenBackground.js wraps screens

## Design Decisions (resolved)
- Daily Production Report submitted by **Job Lead only**, not every crew member
- Photos: general array on report (not per-task), notes required
- One report per job — two jobs = two separate reports
- GPS is **MANDATORY** for punching — hard block, not warn
- Locked 30-min lunch auto-punch-back-in
- Crew submission target: under 2 minutes at end of shift
- No sign-out on mobile — crew devices are assigned, sign-out is a web dashboard function

## Build / Run
```bash
# Full native rebuild (needed after config changes)
npx expo run:ios

# JS-only hot reload
Cmd+R in simulator

# Deploy edge function
supabase functions deploy upload-photo --no-verify-jwt
```

## Critical Rules
- **Offline-first is a hard requirement** — assume no signal by default
- Teal text must always sit on a dark (`#1c1814`) background (pill/badge)
- No white backgrounds — everything is linen/parchment
- Data flows forward only: Sales Command -> Field Command -> Schedule Command -> AR Command
- Field Command records reality — it does not make financial decisions
- Always deploy edge functions with `--no-verify-jwt`
- PostgREST caps at 1000 rows — paginate with `.range()` if querying Supabase directly
