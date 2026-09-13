# Field Command — Handoff v13

**Date:** 2026-09-11
**Branch:** `feat/sync-trip-names` (uncommitted app work; not merged)
**Session goal:** Field launch pass — contract smoke first, then bring Schedule trip titles into Field.

---

## SESSION SUMMARY

Read Field `main` at `eaf70ef` (v12). Contract-smoked existing two-trip job **10176 / job 1284 / call_log 3712**: trips TAP (seq 1, Sep 14–15) and Sing (seq 2, Oct 5–6) stay distinct in Schedule; Field SOW days keep `mobilization_seq` 1 and 2; day dates are null (TBD). Field still labels **WTC N** and does not sync `job_mobilizations`, so TAP/Sing never reach the phone. Chris authorized the sync/schema change on this branch for sim preview, not production app merge.

PowerSync free instance was parked (NXDOMAIN). Chris redeployed it (1.26.0, completed ~23:37). Sync Rules had been wiped (empty Sync Streams prompt). Restored last-good rules **without** `job_mobilizations` (publication not updated). Wiped sim `field-command.db` and relaunched. Home first showed 0 jobs; a few minutes later **5 jobs** synced. Chris stopped for the night.

---

## CHANGES ON BRANCH (not committed)

- `powersync-sync-rules.yaml` + `src/lib/schema.js` — add `job_mobilizations` (client-ready; dashboard rules do **not** include this table yet).
- `src/screens/tabs/TasksTab.js` — live-job lookup (skip deleted twin 1283); keep two trips on the same date unmerged; meta bar uses trip `label` or `Trip N` instead of `WTC N`.
- `docs/BACKLOG.md` — **FE2** In Progress. `CLAUDE.md` table list updated.

Do not merge. Do not push publication. Do not add `job_mobilizations` to dashboard rules until Chris OKs that live sync step.

---

## DECISIONS

- Trip titles need `job_mobilizations` in PowerSync. App-only fallback is `Trip N`.
- Daily Field work should keep the free instance awake; paid tier still deferred.
- After a wake-up: instance deploy first, then re-paste Sync Rules. Do not migrate to Sync Streams tonight.
- iPhone v12 issues: Chris does not remember specifics; pick up after the other launch items.

---

## VERIFICATION

- Live DB read of 1284: two trips, seq-tagged SOW days, Armorhard on Day 1. Merge function keeps TAP/Sing distinct; same-date would still blend without the branch grouping fix.
- PowerSync host answers 404 (up). Sim home later showed 5 Scheduled/In Progress jobs.
- **10176 was not on Home.** Home + Job List query only `Scheduled` / `In Progress` — they omit **Parked**. 10176 is Parked.

---

## NEXT SESSION

1. Confirm sim still Synced. Open **VIEW ALL JOBS**.
2. Add **Parked** to Home + Job List (else 10176 stays hidden).
3. Then, only with Chris OK: publication + dashboard line for `job_mobilizations`, wipe+resync, open 10176 Field SOW — expect TAP / Sing (until then, Trip 1 / Trip 2).
4. Leave PRT old reader, clock-out gate, and physical iPhone for after that.

---

## GIT STATE

- `feat/sync-trip-names` ahead of `eaf70ef`, dirty (5 files). No commit, no push.
- Metro may still be running from this session (`expo start --ios`).
- Test job: 10176 / 1284. Do not use hand-patched 10257 for pipeline checks.
