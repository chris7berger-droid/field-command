# Field Command — Handoff v24

**Date:** 2026-09-16
**Branch:** `fix/home-person-assignments` (do not merge until Chris approves)
**Session goal:** Person-specific Home. No EAS build/submit. No production writes.

---

## SESSION SUMMARY

Home was listing every live job this week. Crew Scheduler assignment is `assignments` (person × job × day). Field-enabled only opens the app.

Fix: Home shows jobs where the logged-in `team_members.name` matches `assignments.crew_name` this week (Schedule `flipName`, case-insensitive), **or** this user has an **open clock-in** in the Home punch window. Same rule for Chris/admin. View All / JobList is unchanged.

Do **not** use `job_crew`.

Chris production (read-only): `team_members.name` = `Chris Berger`, Field-enabled, **no** `crew` row, **no** `assignments`. Stale unmatched clock-in on job 3485 dated **2026-04-14** is outside Home lookback, so it does not keep a card. **Expected Home = 0 jobs.** View All still has live jobs (~18 `call_log` in live stages).

TF2 writes remain paused. No new TestFlight binary in this slice.

---

## VERIFICATION

- `node scripts/verify-home-visibility.cjs` — all checks passed (name flip, week scope, other people, own open punch vs someone else’s punch, Chris with no assignments → empty).
- `npx expo-doctor` — 18/18.
- JobList still selects all live-stage `call_log` rows (no person filter).
- Production not written. No assignment created to make Home look populated.

---

## BACKLOG

- **HOME1** — Closed. Person-specific Home (this PR).
- **TF2** — Still open, still paused. After merge + a later TestFlight build, confirm Chris’s phone Home is empty, then one write path at a time.
- **FE1 / B2 / FE3** unchanged.

---

## NEXT SESSION

1. Merge this PR after Chris approves.
2. Do **not** start TF2 writes on build 3 (it still has the all-jobs Home). A new production EAS build is required before phone confirmation — only when Chris asks.
3. After that binary: empty Home for Chris, View All still lists live jobs, then TF2.

Expo Go is not a valid runtime.
