# Field Command — Handoff v28

**Date:** 2026-09-17
**Branch:** `main`
**Session goal:** VIS-1 — additive PowerSync `call_log` visibility for live Parked/Scheduled jobs. Merged + Development dashboard deployed.

---

## SESSION SUMMARY

PR #10 squash-merged `09ebde5`. Development Sync Rules validated and deployed (`sync-config` only). Live dashboard now has `all_data` (unchanged Sales-stage `call_log`) plus `parked_scheduled_call_log`. Publication unchanged. No instance reset. No Streams.

#10176 / `call_log` 3712 is **sync-eligible** (`jobs.status=Parked`, `deleted=No`). Home still stage-gates and will not *show* it until VIS-2. Chris → 10176 assignment untouched. TF2 paused.

---

## LIVE RULE (Development)

`all_data` call_log:

```
SELECT * FROM call_log
WHERE stage = 'Scheduled'
   OR stage = 'In Progress'
   OR stage = 'Parked'
   OR stage = 'mobilized'
   OR stage = 'in_progress'
```

`parked_scheduled_call_log`:

```
parameters:
  SELECT call_log_id FROM jobs
  WHERE (deleted IS NULL OR deleted = 'No')
    AND (status = 'Parked' OR status = 'Scheduled')
    AND call_log_id IS NOT NULL
data:
  - SELECT * FROM call_log WHERE id = bucket.call_log_id
```

Assignments SELECT still: `id, job_id, crew_name, date, mobilization_id, team_member_id`.

---

## PROD (2026-09-17)

- Additive parents: **2** (3712 Wants Bid / 10176 Parked; 3847 Sold / 10252 Scheduled)
- Sold-stage live-job parents **not** added: **150**
- 3712 vis1_qualifies = 1

---

## NEXT — VIS-2

Home still requires `call_log.stage IN ('Scheduled','In Progress','Parked','mobilized','in_progress')`, so 3712 can sync and still be hidden.

Starting point: `src/screens/HomeScreen.js` stage admission. Do **not** change View All, Refresh, Schedule, Team, assignments, or production data in VIS-2 unless Chris expands the slice. Phone wipe/re-sync after VIS-1 is optional for proving 3712 is in local SQLite.

Expo Go is not a valid runtime. TF2 paused.
