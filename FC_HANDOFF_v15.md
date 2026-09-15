# Field Command — Handoff v15

**Date:** 2026-09-13
**Branch:** `main` after wrap (`c3fb999` before this handoff commit)
**Session goal:** Live trip names (TAP / Sing) on the phone, then SOW “today” + load-out checks. Wrap at ~75% context.

---

## SESSION SUMMARY

Picked up from v14 on a clean `main`. Chris chose slice 1: real trip names.

**FE2 went live.** `job_mobilizations` added to the Postgres `powersync` publication (command-suite-db `20260913120000`, on that repo’s `main`). Chris pasted/deployed dashboard Sync Rules (not Sync Streams). Sim DB wiped; **10176 Field SOW showed TAP / Sing.**

SOW still said **DATES TBD** because Field only read empty `field_sow` day dates. Send already nulls those; the calendar is the trip. Filled empty day dates from `job_mobilizations` start/end. Do **not** strip `date` off Field SOW days.

Also this session: load-out checks are **calendar today** (yesterday’s check does not show loaded). TODAY pill + open on today’s dated day when one exists. 10176 on Sun Sep 13 has no TODAY (TAP starts Sep 14). Wrap rule offers close-out at ~75% context. Chris asked how to refresh the sim — Cmd+R is unreliable; agent relaunches.

---

## CHANGES SHIPPED (on `main`)

- `.cursor/rules/session-wrap.mdc` — offer wrap at ~75%; handoff required on close-out.
- `powersync-sync-rules.yaml` — trip rows: `id, job_id, seq, label, start_date, end_date` (not the office SOW blob).
- `TasksTab.js` / `ReportTab.js` — trip dates fill empty SOW days; TODAY / load-out follow local calendar today. Trip-date fill is **per work type + seq** so two WTCs share Day 1. TODAY is the pill whose `date` is today (not the whole trip window).
- `docs/BACKLOG.md` — **FE2 Closed**. `CLAUDE.md` — publication + dashboard now live.

**command-suite-db (already on its `main`):** `20260913120000_powersync_job_mobilizations.sql` applied to prod.

---

## DECISIONS

- Trip titles need live `job_mobilizations` sync. Done.
- Empty Field SOW day date + dated trip = show the trip calendar, not TBD. Leave the `date` key on field_sow days (Send nulls it; Schedule may still date a day).
- Load-out copy says **today** — a new calendar day starts unchecked. Office still has the row.
- Do not invent “today” on DATES TBD jobs or before the trip starts.
- One Bugbot pass per wrap. Fixed two slice bugs (TODAY vs trip window; multi-WTC date offsets). Did not loop.

---

## BACKLOG

- **FE2** Closed 2026-09-13.
- **FE1 / B2 / FE3** unchanged.
- Desktop Field Command menu already exists in Sales (`/field/*`); may be hidden if the “field” app is off for the login. Not built this session.
- Physical iPhone: v12 on-device install died ~Sept 3. Rebuild or TestFlight next. React Native = iOS and Android from one app; crew distribution = TestFlight. **Correction 2026-09-15:** team `7T26H9PCGN` is the paid ADP Individual team (renews 2027-04-10), not a free Personal Team — see v20.

---

## VERIFICATION

- Sim: 10176 SOW showed TAP / Sing after dashboard deploy + wipe.
- Trip-date fill and today/load-out were code + hot reload; confirm pills **Mon, Sep 14** / **Mon, Oct 5** and Armorhard unchecked after a restart.

---

## NEXT SESSION

1. Confirm 10176 SOW: no TBD banner, date pills from trips, TAP/Sing, Armorhard unchecked until tapped today.
2. Tomorrow (Sep 14) TODAY should land on TAP.
3. Chris’s physical iPhone rebuild, or TestFlight path for crew.
4. Optional: Customer screen, Job Site lock codes, desktop Field menu visibility in Settings.

Test job: **10176 / 1284 / call_log 3712**. Do not use hand-patched 10257.

---

## GIT STATE ON CLOSE

- **field-command:** `main`, clean, in sync with `origin/main` after this handoff is pushed.
- Local `feat/sow-today`, `feat/powersync-job-mobilizations`, `feat/live-trip-titles` deleted after merge.
- **command-suite-db:** `main` already includes the publication migration.
- Next session starts on `main`.
