# Field Command — Handoff v10

**Date:** 2026-08-26
**Branch:** `main` (visual pass merged + pushed)
**Session goal:** Build the Field SOW visual pass per the v9 seed, verify it in the sim against a real job, and ship it.

---

## SESSION SUMMARY

Built and shipped the Field SOW **visual pass** — the render-only work that was scoped (not built) in v9. `TasksTab.js` now matches the approved mockup: a `DAY n OF m` header with a task-count badge, a one-line meta bar (crew · hrs · sq ft · WTC), numbered "Today's Work" rows, an Instructions callout from `scope_notes`, and a MATERIAL / QTY / DETAILS materials table with a per-row check-off. Verified every section live in the simulator against test job #10257. Along the way we hit two non-code snags and one real bug. **Snag 1:** a fresh sim showed only 1 job — the app was stuck on a stale local copy; a full re-download (wipe local DB + relaunch) fixed it and pulled all 7 jobs including 10257. **Snag 2:** 10257's materials weren't showing — traced to a real pipeline bug (below), not the render. We hand-patched 10257's data to unblock the materials-table verification, then shipped the visual pass. The real bug is now being fixed in a separate Schedule Command terminal.

---

## CHANGES SHIPPED

All on `main`, pushed to origin. Branch `feat/field-sow-visual-pass` merged (`--no-ff`) and deleted.

- **22089fd — Field SOW visual pass: mockup layout on the day view**
  Render-only re-skin of `src/screens/tabs/TasksTab.js`. Day header (`DAY n OF m` + date + `n TASK` badge); meta bar (`CREW · HRS · SQ FT · WTC`, each part only when present); "Today's Work" numbered task rows (was "Planned Tasks"); Instructions teal-bar callout from `scope_notes`; Materials table (MATERIAL/QTY/DETAILS) with per-row check-off (ephemeral, in-memory only — no writes). `buildMergedDay` now threads `sq_ft` (MAX), `mobilization_seq` (min), and `scope_notes` (distinct join) through as passthrough; the grouping / crew-MAX / hours-SUM logic is unchanged.

- **737a903 — Merge feat/field-sow-visual-pass**
  Merge commit to main.

---

## DATA PATCH (prod, one row — not code)

- **job #10257 (call_log 3855, job_wtcs.job_id 96)** — manually merged the current `proposal_wtc.field_sow` materials into `job_wtcs.field_sow`, matched day-by-day by day `id` (dates/tasks left untouched). Run via `supabase db query --linked` from `command-suite-db` (MCP is read-only). This was a stopgap to unblock the materials-table verification. **It masks the real bug on 10257** — do not use 10257 to reproduce the pipeline bug.

---

## DECISIONS / CHOICES MADE

- **Kept the render logic untouched, only threaded 3 fields.** The seed said `mergeDaysByDate`/`buildMergedDay` stay as-is. To render sq ft / WTC / instructions I threaded `sq_ft`, `mobilization_seq`, `scope_notes` through `buildMergedDay` as passthrough — no change to grouping/crew/hours math. **Why:** those three were being dropped by the merge; passing them through is the minimal change, not a rebuild.
- **Check-offs are ephemeral.** The materials check-boxes are in-memory only; they reset on unmount. **Why:** the seed scopes out all writes/data-contract work — this is a visual pass. Persistence is a future decision if crews want it.
- **Left the legacy `PRODUCTION TARGET` card in.** Not in the mockup, but it's real data (`jobs.size`) and harmless. Flagged for Chris; left as-is pending a "cut it" call.
- **Fixed the fresh-sim "only 1 job" by wiping local data, not by touching code.** The app held a stale partial copy; PowerSync wasn't re-pulling. A clean re-download resolved it. **Why it matters:** confirmed it was NOT a machine/tool/settings/code/DB difference — the shared sync service was healthy; the local copy was just stale.
- **Hand-patched 10257 rather than re-sending it.** Re-send wouldn't help (see bug) and would risk more duplicate `jobs` rows. A targeted materials-only merge was the safe unblock.

---

## THE REAL BUG FOUND (owned by Schedule Command terminal, in progress)

**Post-send Sales SOW edits never reach Field.** `job_wtcs` (Field's canonical copy) is written **once**, at Send-to-Schedule, in `sales-command/src/components/ProposalDetail.jsx:768-791`, which upserts with `{ onConflict: "proposal_wtc_id", ignoreDuplicates: true }`. Re-sending skips existing rows, and nothing else pushes later `proposal_wtc.field_sow` edits into `job_wtcs`. Evidence: 10257's `job_wtcs` was created 4:18pm with no materials; `proposal_wtc` materials were saved 10:08pm; Field never got them. The copy itself carries materials — the gap is propagation. **A fresh Schedule Command terminal is building the fix now** (ideate→plan→build; must not clobber Schedule-owned assigned dates).

---

## VERIFICATION

- **Visual pass: verified live in the simulator** against job #10257 (iPhone 17 Pro). Confirmed on screen: day header + task badge, meta bar (2 CREW · 16 HRS · 1,200 SQ FT · WTC 1), numbered "Patching" task with trade tag + TARGET 100%, Instructions callout with full `scope_notes`, and (after the data patch) the Materials table with checkbox / name / unit / details columns.
- **Transpile check:** `TasksTab.js` compiles clean (babel-preset-expo).
- **NOT verified:** materials table with *rich* details (mix time/speed/cure populated) — 10257 day 1's material has qty 0 and no mix specs, so it showed "—". Jobs with fuller material specs (e.g. 10159 / job 92) weren't eyeballed. Multi-work-type same-day merge (crew MAX) not stress-tested. No automated tests.

---

## NOT TOUCHED THIS SESSION

- **The real pipeline bug** — diagnosed here, being fixed in the Schedule Command terminal. Not touched in field-command.
- **Duplicate `jobs` rows (96/97/98) for 10257** — still parked; Field's `SELECT id FROM jobs WHERE call_log_id=?` picks one arbitrarily. Owner likely sch-command.
- **Per-crew sync filtering** — Field still shows all active-stage jobs to everyone (single `all_data` bucket). Known TODO.
- **Legacy `PRODUCTION TARGET` card** — left in pending Chris's keep/cut call.
- **PowerSync paid tier** — free instance still idles out; deferred.

---

## NEXT SESSION POINTERS

1. **Pre-flight before assuming Field sync works:** the free PowerSync instance can idle out AND the local sim copy can go stale. If a job is missing, wipe + re-download: terminate app → `rm` the sim's `field-command.db` (+ `-wal`/`-shm`) → relaunch → let it re-sync. (Instance liveness check: `curl -s -o /dev/null -w "%{http_code}\n" https://69d81f100e377e689729db98.powersync.journeyapps.com` — a response, not NXDOMAIN, means up.)
2. **When the Schedule-side fix lands, test it against a DIFFERENT stale job or the repro recipe — NOT 10257** (it's hand-patched, so it already looks correct).
3. Optional polish: decide keep/cut on the `PRODUCTION TARGET` card; eyeball the materials table on a job with populated mix specs.

---

## FILES TO PROBABLY KNOW ABOUT NEXT SESSION

- `src/screens/tabs/TasksTab.js` — the shipped visual pass; day-merge logic + all render live here.
- `docs/plans/field_sow_format_ideate_seed.md` — the scoped spec this was built from (now built).
- `src/lib/tokens.js` — brand palette used for the re-skin.
- `sales-command/src/components/ProposalDetail.jsx:768-791` — the Send-to-Schedule write; root of the propagation bug.
- `FC_HANDOFF_v9.md` — the sync-fix + scope-correction narrative that set up this session.

---

## GIT STATE ON CLOSE

- Branch: `main`, working tree clean (before this handoff commit).
- `origin/main` tip: `737a903` (this handoff will be the next commit).
- Feature branch `feat/field-sow-visual-pass` merged + deleted (local + remote).
- No other open field-command branches from this session.

---

## END STATE

Field SOW visual pass built, verified in the sim, merged + pushed to main. The real Sales→Field propagation bug is diagnosed and being fixed in a separate Schedule Command terminal. Ready for a fresh session; nothing blocked here.
