# Field Command — Handoff v26

**Date:** 2026-09-16
**Branch:** `main`
**Session goal:** Squash-merge IDENT-6 PR #9 and deploy the additive PowerSync assignments SELECT. Dashboard deploy did not complete (auth).

---

## SESSION SUMMARY

Chris approved PR #9 and the exact additive PowerSync dashboard SELECT.

**Merged.** PR #9 squash-merged to `main` as `c1f9983`. Local `main` = `origin/main`. Working tree was clean after merge.

**Dashboard deploy did not run.** PowerSync CLI 0.10.1 and 0.8.0 both report not logged in (`PS_ADMIN_TOKEN` / `powersync login` required). Dashboard URL redirected to `accounts.powersync.com/users/sign_in`. No password/PAT was entered. Publication was not touched. Instance was not reset.

Until Chris signs in (or provides a PowerSync PAT), live assignments SELECT remains:

```
SELECT id, job_id, crew_name, date, mobilization_id FROM assignments
```

Committed YAML + client schema already expect:

```
SELECT id, job_id, crew_name, date, mobilization_id, team_member_id FROM assignments
```

Phones keep seeing `team_member_id` as blank and use the HOME1 name fallback. Chris expected Home remains 0 jobs. No production assignments created. Chris not linked. TF2 paused.

---

## NEXT

1. Chris: `powersync login` (or `PS_ADMIN_TOKEN`) then deploy **only** the assignments SELECT above — `npx powersync deploy sync-config` after pulling live config and changing that one line.
2. Or paste the same line in Dashboard → Field Command → Development → Sync Rules and Deploy. Do not change other rules. Do not reset the instance.
3. Do not bulk-link crew. Do not auto-link Chris. TF2 stays paused.

Expo Go is not a valid runtime.
