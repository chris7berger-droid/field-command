# Field Command — Handoff v16

**Date:** 2026-09-13
**Branch:** `main` after wrap (`868cc5b` before this handoff commit)
**Session goal:** Pickup from v15. Home card polish, then Field SOW hours + live crew names.

---

## SESSION SUMMARY

Picked up from v15 on a clean `main`. Chris asked about Home showing Sunday Sep 13 at the top and **Mon, Oct 5 of 2** on the 10176 card. That line was the SOW production-day pick (old PRT count skipped to Sing). He kept the logic and dropped the date line.

Then: week-strip key on the left + hairlines; View All limited to this week plus undated live jobs (last-minute punch-in); **OPEN JOB** on the Today card.

SOW labor first read WTC bid OT (100 hrs / 10 OT). Wrong source. Sales enters **Crew Count** and **Hours Planned** on Field SOW days. 10176 days are empty, so the labor block hides. Send to Schedule now blocks empty crew/hours (sales-command). Crew names live on Schedule **`assignments`** (Little, Adam · Antonio on TAP), not empty `job_crew`. Publication + dashboard rules deployed; sim wipe showed the names. `jobs.lead` is still blank.

---

## CHANGES SHIPPED (on `main`)

- `HomeScreen.js` — dropped SOW date line; week key left-aligned with hairlines; **OPEN JOB**; crew names under the trip.
- `JobListScreen.js` / `trips.js` — View All = this week + undated live jobs.
- `TasksTab.js` — SOW labor from `field_sow` day boxes; crew from `assignments` (job_crew fallback).
- `src/lib/crew.js`, `schema.js`, `powersync-sync-rules.yaml`, `CLAUDE.md` — assignments sync.

**command-suite-db:** `20260913140000_powersync_assignments.sql` applied to prod. Commit that file if it is still untracked.

**sales-command:** Send review blocks days missing crew or hours. Commit `ProposalDetail.jsx` if still dirty.

---

## DECISIONS

- Home date line (`Mon, Oct 5 of 2`) does not earn its space. Removed.
- View All is the last-minute punch-in list, not the whole company job book.
- Hours on Field SOW = Field SOW day `hours_planned` / `crew_count`. Never `proposal_wtc` bid OT.
- Named crew = `assignments.crew_name`. Lead = `jobs.lead` when filled. Do not invent a lead from the two names.
- One Bugbot pass. Clean.

---

## BACKLOG

- **FE1 / B2 / FE3** unchanged.
- 10176 Field SOW days still have empty crew/hours — expected until Sales fills the boxes. Already sent, so the new send gate does not unsend it.
- Physical iPhone / TestFlight still parked.

---

## VERIFICATION

- Sim: 10176 SOW showed TAP dates, **Little, Adam · Antonio**, lead not assigned, no fake OT.
- Dashboard rules must include `SELECT id, job_id, crew_name, date, mobilization_id FROM assignments` (deployed this session after v20 missed that line).

---

## NEXT SESSION

1. Fill 10176 Field SOW day crew/hours in Sales if you want that block on the phone, or leave it empty.
2. Optional: put `jobs.lead` on 10176 if there is a named lead.
3. Physical iPhone rebuild or TestFlight.
4. FE1 trade labels on merged days, or Customer / Job Site extras.

Test job: **10176 / 1284 / call_log 3712**. Do not use hand-patched 10257.

---

## GIT STATE ON CLOSE

- **field-command:** `main`, clean, in sync with `origin/main` after this handoff is pushed.
- Local `feat/home-drop-sow-date` deleted after merge.
- **command-suite-db / sales-command:** companion commits may still need push if they were dirty at wrap.
- Next session starts on `main`.
