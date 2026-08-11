# FC_HANDOFF_v7 — Next session seed: prove the real-calendar-date SOW render (F3)

**Repo:** `field-command` (github.com/chris7berger-droid/field-command) · **Branch:** `main`
**Mode:** smoke / verification (build-adjacent — opus 4.8, medium). No feature branch
needed for a pure smoke; if it exposes a code fix, branch *then*.
**Written:** 2026-08-11, at the end of the pre-connect cleanup session.

---

## Why this is the next session

It's the **last unverified link in the Sales→Field connect path.** Everything else
in that path is now proven: SOW syncs down (`job_wtcs`), photos serve publicly
(B1 smoke, HTTP 200 no-auth), the publication is in the ledger (MIG-3). The one
thing never exercised on a device is the **by-actual-calendar-date** render of the
Field SOW — because every job we've smoked so far had *no* assigned dates and fell
back to the sequential "Day 1 / Day 2" path.

## What F3 is (and the exact code)

`src/screens/tabs/TasksTab.js` → `mergeDaysByDate(taggedDays)` (lines ~29–62).
It splits each WTC's day objects into two buckets:

- **`dated`** — days where `day.date` is truthy → grouped by ISO date, sorted
  chronologically, rendered as real date pills via `fmtDayLabel(date)`, **no**
  "DATES TBD" banner. **← THIS BRANCH HAS NEVER RUN ON A DEVICE.**
- **`undated`** — days with no `date` → "Day N (TBD)" pills; when *all* days are
  undated, `allTbd = true` and the render shows the yellow
  "DATES TBD — schedule hasn't assigned calendar dates yet" banner.

Where `day.date` comes from: each element of `job_wtcs.field_sow` (JSONB array,
parsed at TasksTab.js:108). When Schedule assigns calendar dates, it writes a
`date` (ISO `YYYY-MM-DD`) onto each day in `field_sow`. No date written = TBD path.

So F3 = confirm that a job whose `job_wtcs.field_sow` days carry real `date`
values renders the dated branch correctly on a device.

## What's already verified vs. not

- ✅ **TBD / sequential fallback** — job #10044 (single WTC) and #10159
  (multi-WTC "ZZ TEST — SOW SMOKE", both trades on 6/23 & 6/24) — but #10159's
  "dates" live only inside the day objects as the *merge key*, confirmed via the
  merged render; the **`allTbd=false` dated-pill path with `fmtDayLabel`** was
  not the thing on screen. Re-confirm which branch #10159 actually hit — if its
  field_sow days already carry ISO `date`s, F3 may be closer to done than it looks.
- ❌ **Dated branch on device** — never proven: real date-labeled pills, no TBD
  banner, chronological sort, multi-WTC still merging under one date.

## Setup — a job with real assigned dates

Two ways to get one; pick whichever is less work at the time:

1. **Real path:** have Schedule Command assign calendar dates to a job's WTCs so
   `job_wtcs.field_sow[].date` gets populated, then sync down. (Closest to prod;
   also spot-checks the upstream date-write.)
2. **Direct fixture:** on a throwaway test job, set `date` on each element of the
   `job_wtcs.field_sow` JSONB directly (shared project `pbgvgjjuhnpsumnowuym`).
   Use a clearly-labeled `ZZ TEST` job and tear it down after. **Coordinate — do
   not write to the shared DB while another session (e.g. Chris in sales-command)
   is mid-change.**

## Acceptance criteria (all on device)

1. Open the dated job's **Field SOW** tab → day pills show **real dates**
   (`fmtDayLabel` output, e.g. "Mon 6/23"), **not** "Day N", and **no** DATES-TBD
   banner.
2. Pills are in **chronological order**.
3. On a shared date with two WTCs, both trades' tasks still **merge under the one
   date pill** (the F2/F3 merge already proven for the TBD path — confirm it holds
   on the dated path too).
4. **Ground truth, not just pixels:** read the simulator's local PowerSync SQLite
   (`<app container>/Library/field-command.db`) and confirm the opened job's
   `job_wtcs.field_sow` actually carries the `date` values driving the render —
   this is the check that caught the D1 false positive (honor
   [[feedback_edge_fn_post_deploy_smoke]] / smoke-the-side-effect discipline).

## Infra you'll likely have to wake first (from FC_HANDOFF_v6)

- **PowerSync** is on the **free/parked** plan and deactivates after ~1 week idle.
  Last active 2026-06-16; it has almost certainly parked. Expect to reconnect it
  before anything syncs — worst case a deprovision + redeploy of sync rules (the
  full v6 saga). Decision on record: stay free through the build, flip to Pro
  ($49/mo flat at our scale) at crew go-live — a mid-build wake is fine to eat.
- **Supabase:** Dedicated IPv4 add-on is ON (`52.8.157.147`); DB password is in
  the password sheet (rotated 2026-06-16).
- **Simulator:** `cd ~/field-command && npx expo run:ios` (Metro on :8081),
  `Cmd+R` for JS hot reload.

## Guardrails
- Field-command build/smoke only. **Do not touch sales-command.** Any shared-DB
  write (fixture setup) waits until whoever's in Supabase is clear.
- If F3 passes: file it closed in `docs/BACKLOG.md` (it isn't a filed row yet —
  add it to the Completed Log) and tear down any fixture job.
- If F3 fails: it becomes a real Field code fix — branch then, don't patch on main.

## Backlog state going in
- Open: **B2** (office-set one-crew-vs-two toggle — decided, upstream storage
  DESIGN-OPEN, needs a plan session), **FE1** (SOW trade labels on merged days).
- Housekeeping: delete `feat/sow-vertical` branch; clean `ZZ TEST` jobs from prod.
