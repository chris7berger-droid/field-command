# Field Command — Handoff v29

**Date:** 2026-09-17
**Branch:** `feat/vis2-home-schedule-assignment` (PR; do not merge until Chris approves)
**Session goal:** VIS-2 — Home admits assigned live Schedule jobs without a Sales-stage veto.

---

## SESSION SUMMARY

VIS-1 already delivers `call_log` 3712. Home still hid it because it queried `call_log WHERE stage IN (...)`. VIS-2 drops that gate on Home only.

Admission is now `buildHomeWeekJobs`: this user's Home-week assignment (UUID first, name fallback only when UUID blank) on a live `jobs` row (`deleted` null/No), or this-user open punch. Missing `call_log` parents are skipped. View All / PowerSync / Refresh unchanged.

---

## HOME CHANGE

Was:

```
SELECT * FROM call_log WHERE stage IN ('Scheduled', 'In Progress', 'Parked', 'mobilized', 'in_progress')
```

then assignment + trip-window filter.

Now:

```
SELECT * FROM call_log ORDER BY date ASC
```

Cards come from `buildHomeWeekJobs` (`src/lib/crew.js`). Assignments still join live `jobs` via `LIVE_JOB_FILTER`.

---

## #10176

Expected after merge + app reload (VIS-1 already live): Chris canonical assignments 9/14 + 9/15, jobs 1284 Parked / deleted No, call_log 3712 Wants Bid → **Home shows #10176**. Phone wipe optional if local SQLite is stale.

---

## NEXT AFTER MERGE

Reload the Field binary (no PowerSync dashboard change). Confirm Home shows #10176 for Chris this week. Do not start View All / Refresh unless Chris opens that slice. TF2 stays paused until Chris confirms Home.

Expo Go is not a valid runtime.
