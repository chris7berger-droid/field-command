# Field Command — Handoff v27

**Date:** 2026-09-17
**Branch:** `main`
**Session goal:** Finish IDENT-6 — deploy the approved additive PowerSync assignments SELECT.

---

## SESSION SUMMARY

PowerSync CLI auth was already stored. Pulled live Development sync-config (`69d81f100e377e689729db98`), changed **only** the assignments line, deployed `sync-config` only. No other rule lines. No publication change. No instance reset. Production instance not touched.

Live assignments SELECT is now:

```
SELECT id, job_id, crew_name, date, mobilization_id, team_member_id FROM assignments
```

That matches committed `powersync-sync-rules.yaml` and client `schema.js`. Other bucket lines unchanged (call_log filter, job_mobilizations columns, etc.).

Chris still has no canonical assignment and no matching legacy name — expected Home remains 0 jobs. TF2 paused.

---

## NEXT

Do not bulk-link the remaining 27 crew. Do not auto-link Chris. TF2 stays paused until a later TestFlight Chris asks for. Android can resume against this additive dashboard state.

Expo Go is not a valid runtime.
