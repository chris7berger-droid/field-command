# Field Command — Handoff v11

**Date:** 2026-08-27
**Branch:** `main` (all work merged + pushed; `feat/material-confirmation` deleted)
**Session goal:** Pick up Field Command, run a fresh test job end-to-end through Sales→Schedule→Field, and build the crew material load-out confirmation. Grew into a full PRT/daily-log overhaul, an office (Schedule Command) production view, and two DB fixes.

---

## SESSION SUMMARY

Cross-repo session touching **field-command**, **sch-command**, and **command-suite-db**. Started by syncing this desktop to the laptop's overnight work, then ran test job **10261** (call_log 3862) through the whole pipeline. Built the crew **material load-out confirmation** (persistent per-material "loaded in truck" checkbox on the Field SOW, backed by a new `job_material_checks` table). Along the way, found and fixed a **4.5-month-old invisible bug** — a broken trigger (`fn_auto_in_progress`) referenced a non-existent `updated_at` column and silently rejected every `time_punches` insert since 2026-04-14, jamming the whole PowerSync upload queue. Overhauled the PRT: sticky Save/Submit bar, notes required only on worked tasks, submitted-view shows only worked tasks, Edit & Resubmit, ahead-of-schedule entry, a persistent "SENT TO OFFICE" indicator, and a **JSONB double-encoding** fix. Added a **daily-log sticky button** and a **clock-out gate** (must submit today's PRT first). On the office side, built **Load-Out / PRT / Daily Log** card modals in Schedule Command (the old `/jobs/:jobId` JobDetail is retired), with the PRT view reworked into a **plan-vs-actual production picture measured by day count**. Rebuilt the clock-in→In Progress behavior correctly as a `SECURITY DEFINER` trigger. Everything merged to main, migrations applied to prod, baseline reconciled (`--against-prod` GREEN).

---

## CHANGES SHIPPED

### field-command — `main` @ 5160e3b (Merge feat/material-confirmation)
- **311ea5e** — persistent material load-out confirmation on the Field SOW. Cut the work-type tag from task rows; MATERIALS gets an instruction line + per-material spec-expand chevron; checkbox persists to `job_material_checks` (syncs up with crew + timestamp); fixed mix-time render (it's a string like "5 min", not a `Number()`).
- **dc1ab45** — pin PRT Save/Submit in a sticky action bar (was below the fold, so crew lost work never reaching it). Wrapped in KeyboardAvoidingView.
- **96e05a3** — PRT requires notes only on tasks worked today (a task left at 0% wasn't touched; don't force a note). Names the specific task; blocks an empty submit.
- **9c6c44e** — JSONB double-encoding fix. The app `JSON.stringify`'d tasks and the connector sent that string to a JSONB column → stored as a JSON *string*, double-encoded after the sync round-trip → submitted-view `.map` crashed. `parseJSONArray` parses twice defensively; connector now parses known JSON columns before upsert so JSONB stores real arrays going forward.
- **64a1059** — PRT submitted-view shows only worked tasks + Edit & Resubmit (reopens the flat list prefilled, allows ahead-of-schedule entry).
- **906b028 / 7e269f9** — submit confirmation alert, then replaced with a **persistent "✓ SENT TO OFFICE" badge** on the submitted view (a flashing popup is useless after you navigate away).
- **1741761** — clock-out requires today's PRT submitted for that job ("Submit your PRT first"); approval not required.
- **5d8ba2f** — pin the Daily Log SUBMIT button in a sticky bar too.

### sch-command — `main` @ c221cff (office side; parallel session merged my branch + added nav-tooltips on top)
- **4a43af7 → 306a3c9** — Load-Out office view; then pivoted PRT/LOGS/LOAD-OUT off the retired JobDetail page into **card modals** (LoadOutModal / PRTModal / LogsModal), matching the live expanded-card pattern.
- **77d688f** — fix modal titles duplicating the job name.
- **4cb84a1 / 88cf7a8 / ffc851c** — office PRT view reworked into **plan-vs-actual production**: overall JOB PROGRESS bar (actual vs plan) measured by **day count** (not literal calendar date), per-day task actual-vs-plan + notes; dropped the naive per-task tag that mislabeled ahead-of-schedule work.
- **564863a → af13c26** — added, then removed, an office Approve button (approval isn't part of the workflow — submission is the gate).
- *(c221cff / 5a90aea — nav-icon-tooltips, parallel work, not mine.)*

### command-suite-db — `main` @ bf73ec2 (Merge feat/material-confirmation)
- **6902ef0** — `job_material_checks` table (tenant-scoped RLS, indexes, PowerSync publication) + **dropped the broken `fn_auto_in_progress`** that was silently rejecting every clock-in. Baseline snapshot + EXPECT_* refreshed.
- **9e02233** — rebuilt clock-in→In Progress as `fn_clockin_set_in_progress` (`SECURITY DEFINER`; promotes only Scheduled/Parked; audit-log exception-guarded). Baseline debt from the trigger drop reconciled.

---

## DEPLOYED

- **Shared Supabase** (ref `pbgvgjjuhnpsumnowuym`) — 3 migrations pushed + verified live:
  - `20260827130000_job_material_checks.sql`
  - `20260827140000_fix_time_punches_broken_trigger.sql`
  - `20260827150000_clockin_auto_in_progress.sql`
- **Schedule Command** — main merge triggers Vercel production deploy to **schedulecommand.com** (office Load-Out/PRT/Daily-Log modals go live).
- **Field Command** — code on main, but NOT on real crew phones: reaches devices only via a native rebuild / TestFlight. The iOS sim was the test surface this session.

---

## DECISIONS / CHOICES MADE

- **PRT progress measured by day count, not calendar date.** Literal SOW dates made a not-yet-started job read "plan 0%". Day count (which production day the crew is on = number of PRT days reported) means ahead-of-schedule work reads correctly as positive.
- **Submission gates clock-out; approval removed entirely.** Requiring *approval* to punch out would strand crews waiting on the office. Submission is the crew's responsibility and the gate; the office Approve button was built then pulled.
- **Office views are card modals, not JobDetail tabs.** `/jobs/:jobId` (JobDetail.jsx) is a retired screen; the live surface is the expanded StageJobCard with inline modals. PRT/LOGS were also wrongly pointing at the dead page — fixed both.
- **Trigger safety:** `SECURITY DEFINER` (so the crew's session needs no `call_log`/`job_changes` grants — a missing grant would reject the clock-in, exactly the failure we fixed), and the audit-log INSERT is exception-guarded so it can never break a punch.
- **PRT saves only worked tasks** (pct_today > 0), so the confirmation reflects real production instead of a wall of 0%s.
- **Connector parses JSON columns before upsert** to stop JSONB double-encoding — the right fix at the write side, with defensive double-parse on reads for legacy rows.

---

## NEW BACKLOG ITEMS

None filed with formal IDs. Deferred items are tracked under NOT TOUCHED / NEXT SESSION POINTERS below.

## CLOSED THIS SESSION

- The invisible clock-in sync failure (broken trigger) — closed by `20260827140000` (command-suite-db). First successful time punch since 2026-04-14 confirmed in prod.

---

## VERIFICATION

- **Field (sim, iPhone 17):** material checks sync up clean (2 rows, correct crew/date/material); PRT submit + Edit & Resubmit landed clean as a **proper JSONB array** (2 tasks: Patching 90% + ahead-of-schedule Joint Fill 25%); daily log synced with **clean photos array** (1 photo); clock-in trigger installed + SECURITY DEFINER confirmed via SQL.
- **Office (Vercel branch preview):** Load-Out modal (2 of 5 confirmed), PRT plan-vs-actual (Day 1 of 4, 29% vs plan 25%, +4% ahead), title dedup — all confirmed by Chris.
- **DB:** migrations rehearsed on a prod-shaped throwaway; `--against-prod` GREEN post-merge (column_grants 9171, all EXPECT_* match, invoice REVOKE intact, QB-stream columns preserved).
- **NOT verified:** field-command on **real devices** (sim only). The **clock-out block** path (10261 already had a submitted PRT, so only the pass-through case was exercised). The **auto-in-progress promotion actually flipping a stage** (10261 was already In Progress — trigger presence verified, but a Scheduled→In Progress transition was not observed live).

---

## NOT TOUCHED THIS SESSION

- **Field native build / TestFlight** — crew-side work is on main but not on phones.
- **Office PRT "expected-but-not-reported" cross-ref** (the B(ii) option) — surfacing SOW tasks expected today but not in the PRT; deferred pending a PRT-date→SOW-day mapping rule.
- **Per-crew PowerSync sync filtering** — still a single global bucket (known TODO).
- **PowerSync paid tier** — free instance still idles out.
- **QB-payment-sync cron migration** — lands in command-suite-db AFTER this session's migrations (parallel stream, FYI only); it takes the next free timestamp > `20260827150000`.

---

## NEXT SESSION POINTERS

1. **Cut a field-command native build** (`npx expo run:ios`, or a TestFlight/internal build) to get the crew-side work onto real phones — everything's been sim-only.
2. **Test the two unverified paths:** (a) clock out of a job with **no** PRT → should block with "Submit your PRT first"; (b) clock in on a **Scheduled** or **Parked** job → should auto-flip to In Progress (audit row in `job_changes`, source `field_clock_in`).
3. **Pre-flight:** the free PowerSync instance can idle out (NXDOMAIN) and the sim's local copy can go stale. If a job is missing, wipe + re-download (terminate app → `rm` the sim's `field-command.db`/`-wal`/`-shm` → relaunch → re-sync). Liveness: `curl -s -o /dev/null -w "%{http_code}\n" https://69d81f100e377e689729db98.powersync.journeyapps.com` (404 = up).
4. A Metro dev server was left running in the background this session — kill it if stale before starting a fresh sim.

---

## FILES TO PROBABLY KNOW ABOUT NEXT SESSION

- `src/screens/tabs/TasksTab.js` — Field SOW render + persistent material load-out checkbox.
- `src/screens/tabs/ReportTab.js` — PRT + Daily Log; sticky bars, worked-tasks-only, Edit & Resubmit, sent indicator.
- `src/screens/tabs/TimeClockTab.js` — clock-out PRT gate.
- `src/lib/connector.js` — `JSON_COLUMNS` map that stops JSONB double-encoding on upload.
- `src/lib/utils.js` — `parseJSONArray` (handles double-encoded JSON).
- `sch-command/src/components/{PRTModal,LogsModal,LoadOutModal}.jsx` — office card modals; `PRTModal` is the plan-vs-actual/day-count view.
- `command-suite-db/supabase/migrations/2026082713–15*.sql` — the three migrations; baseline snapshot refreshed.

---

## GIT STATE ON CLOSE

- **field-command:** branch `main` @ 5160e3b, in sync with origin/main. Working tree clean. `feat/material-confirmation` deleted (local; never pushed).
- **sch-command:** `main` @ c221cff (my work + parallel nav-tooltips), in sync with origin. `feat/material-confirmation` deleted (local + remote).
- **command-suite-db:** `main` @ bf73ec2, in sync with origin. `feat/material-confirmation` deleted (local; never pushed).
- No open PRs from this session. Other pre-existing branches in sch-command/command-suite-db left untouched (not mine).

---

## END STATE

Merged, deployed (3 migrations live + Schedule Command to prod), verified against prod (main == prod). Field-command crew work is on main but needs a native build to reach phones. Ready for a fresh session.
