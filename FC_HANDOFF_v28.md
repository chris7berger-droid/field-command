# Field Command — Handoff v28

**Date:** 2026-09-17
**Branch:** `feat/vis1-schedule-driven-call-log-sync` (PR; do not merge until Chris approves)
**Session goal:** VIS-1 — additive PowerSync `call_log` visibility for live Parked/Scheduled jobs. No Home/View All/Refresh. No dashboard deploy.

---

## SESSION SUMMARY

#10176 stays off the phone because `call_log` 3712 is Sales stage **Wants Bid** while Schedule `jobs.status` is **Parked**. Legacy Sync Rules cannot JOIN/subquery in a data query (`docs.powersync.com/sync/supported-sql`), so VIS-1 adds a second **global** bucket whose parameter query reads live Parked/Scheduled `jobs.call_log_id`. That is the documented Sync Rules shape for “table A from table B” (`docs.powersync.com/sync/rules/parameter-queries`).

Assignment-window sync is **not** in this slice: 10176 is already Parked; a window would need `assignments` (unsupported join) and would pull historical Sold.

Existing `all_data` Sales-stage `call_log` query is unchanged. Publication unchanged. Home still will not *show* 10176 until VIS-2 drops the stage admission filter.

`SELECT *` on `call_log` matches the existing `all_data` query (full parent row). The gate is which rows, not which columns. The new bucket does **not** `SELECT * FROM call_log` unfiltered.

---

## RULE

Keep in `all_data`:

```
SELECT * FROM call_log
WHERE stage = 'Scheduled'
   OR stage = 'In Progress'
   OR stage = 'Parked'
   OR stage = 'mobilized'
   OR stage = 'in_progress'
```

Add bucket `parked_scheduled_call_log`:

```
parameters:
  SELECT call_log_id FROM jobs
  WHERE (deleted IS NULL OR deleted = 'No')
    AND (status = 'Parked' OR status = 'Scheduled')
    AND call_log_id IS NOT NULL
data:
  - SELECT * FROM call_log WHERE id = bucket.call_log_id
```

---

## PROD READ-ONLY (2026-09-17)

- Existing Field-stage call_log: **19** (unchanged)
- Additive parents: **2**
  - 3712 / 10176 / Wants Bid / jobs 1284 Parked
  - 3847 / 10252 / Sold / jobs 1278 Scheduled
- Sold-stage live-job parents **not** added: **150**

---

## NEXT

1. Merge this PR after Chris approves.
2. Deploy **only** this YAML to the Development dashboard (Sync Rules, not Streams). No instance reset. No publication change.
3. VIS-2: Home must stop requiring Sales stage, or 3712 can sync and still be hidden.

Expo Go is not a valid runtime. TF2 paused.
