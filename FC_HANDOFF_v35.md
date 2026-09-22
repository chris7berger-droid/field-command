# Field Command — Handoff v35

**Date:** 2026-09-22
**Branch:** `main`
**Session goal:** Clear the Build 9 PowerSync release blocker (`PSYNC_S2305`).

---

## SESSION SUMMARY

Fresh Simulator connects under deployed sync config v25 died in about 60–90ms. The cause was the parameter-result budget: child streams expanded per-job and per-`call_log` id lists, and the sum exceeded 1000 before dedup. Option A was chosen. `call_log.has_live_schedule_job` was not added. Production already has parent-derived `tenant_id` on `job_wtcs`, `job_mobilizations`, and `daily_log_entries`. Sync rules now filter those tables and `call_log` with `tenant_id IN user_tenants`. `parked_scheduled_call_log` is gone. Development PowerSync is on config v26 from this commit. Physical TestFlight Build 9 Refresh returned UPDATED immediately, a fresh install received data, and Search All Jobs found #10176. Fresh Simulator stayed connected with `hasSynced` true. No `PSYNC_S2305` and no download or upload error. The release blocker is cleared.

---

## SHIPPED

- `743d88d` — `fix: tenant-scope Field Command sync streams`
- Fast-forward merge of `fix/build9-powersync-tenant-streams` to `main` at `743d88d`
- Development instance `69d81f100e377e689729db98` already running sync config v26 from that commit. This closeout did not deploy again.

---

## DECISIONS

- Option A: sync the whole tenant `call_log`. Sixteen Complete jobs may become searchable. About 256 extra same-tenant sales rows may exist locally.
- Do not add `call_log.has_live_schedule_job`.
- Leave the existing `SELECT job_id AS id, *` warning on `jobs`.
- Diagnostic instrumentation stays on `diag/build9-powersync-disconnect` and is not on `main`.

---

## DEFERRED / PENDING

- `diag/build9-powersync-disconnect` at `f51e768` remains on local and origin. It still has the temporary PowerSync logs and the `uploadData` write interlock. Do not merge it.
- Accepted Option A behavior change (Complete jobs in Search) is live with v26. No further product gate was requested.

---

## NEXT SESSION

Start on `main`. Do not merge or delete the diagnostic branch unless Chris asks. Do not redeploy PowerSync unless the rules change again.

---

## GIT

- Feature `fix/build9-powersync-tenant-streams` fast-forward merged to `main` at `743d88d`
- Local feature branch deleted after the merge
- Remote feature branch left in place
- Diagnostic branch not merged and not deleted
- Pushed `main` (never force)
