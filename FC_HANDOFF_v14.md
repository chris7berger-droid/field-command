# Field Command — Handoff v14

**Date:** 2026-09-13
**Branch:** `main` at wrap (`ac6d83d` before this handoff)
**Session goal:** Field launch UI + clock/reports — Home job cards, job menu, PRT from live SOW, Job Site directions, overnight punch-out. Then a close-out routine so the next chat starts clean.

---

## SESSION SUMMARY

Continuation of v13 (`feat/sync-trip-names`). That branch **did merge** — v13’s “do not merge / dirty tree” state is stale. Live PowerSync dashboard rules still **omit** `job_mobilizations`, so phones show **Trip 1 / Trip 2**, not TAP / Sing, until Chris OKs the publication + dashboard line (FE2).

This session (Sat evening → Sun morning) shipped crew-facing Home and job navigation, then clock/report date work that had been biting overnight shifts. Chris asked to stop Bugbot loops on edge cases. Wrap committed, merged, pushed, leftover feature branches deleted. **No handoff was written at that wrap** — this file backfills it.

Pickup session 2026-09-13 also added **handoff writing** to `.cursor/rules/session-wrap.mdc` (it was missing from the routine).

---

## CHANGES SHIPPED (on `main`)

- Home / Job List: this week’s jobs, **job number (largest), name, trip title**. Parked jobs in that week show. Address dropped from the card.
- Job tap opens a **menu** (Time Clock, SOW, Reports, Customer, Job Site) instead of landing on Clock In.
- PRT reads the **live Field SOW** (`job_wtcs` / merge), not the old `jobs.field_sow` / loose `proposal_wtc` path. Home duties use local dates and the job’s full PRT day count.
- Status bar and Home follow the **same job as clock-out**.
- **Job Site** — Get Directions from the job address (Maps).
- Home puts the **punched-in job first**; reports on another job are blocked while on the clock.
- **Overnight:** leftover clock asks punch-out-now or night work. Punch-out-now starts a new day. Night work keeps the same shift past midnight (including into Monday).
- Clock-out duties (SOD / MOD / EOD / PRT) belong to **this clock-in**, not an earlier shift that day. Yesterday’s finished shift does not lock today’s clock-in.
- `.cursor/rules/session-wrap.mdc` — wrap must commit, merge, delete the feature branch, push, and say safe-to-close. Handoff added on pickup.

---

## DECISIONS

- One Bugbot pass per wrap. Fix only what would break **this slice**. Do not loop on two-shifts-in-one-day, persisted Night Work flags, or “notify office.”
- Accidental close on the phone = punch-out-now + notify office later. **FE3** (office punch-time correction) is later office/timesheet work, not Field guessing hours.
- Sunday morning SOD/MOD lights on the wrong day were leftovers from being stuck on yesterday’s clock **before** the prompt existed. Do not rewrite those log rows.
- Customer name/contact and job-site lock codes/access are **not piped yet**. Directions shipped; the rest waits for a dedicated slice.
- Trip titles still need Chris OK for live `job_mobilizations` sync. Do not add the table to the publication or dashboard until he says so.

---

## BACKLOG

- **FE2** still In Progress — client schema/rules draft is on `main`; live sync is not.
- **FE3** filed 2026-09-13 — office punch-time correction.
- **FE1 / B2** unchanged (trade labels on merged days; office one-crew-vs-two flag).

---

## VERIFICATION

- Sim preview used during Home / menu / PRT work. Overnight and next-morning clock fixes were code + Bugbot; first Bugbot pass caught yesterday’s finished shift locking today’s clock-in.
- **Not done:** live TAP / Sing on 10176 (needs publication). Customer screen. Job-site lock codes. Physical iPhone rebuild (v12 cert was due ~Sept 3).

---

## NEXT SESSION

Chris picks one slice (asked 2026-09-13 pickup):

1. **FE2 live** — publication + dashboard `job_mobilizations`, wipe+resync, open **10176** Field SOW — expect TAP / Sing.
2. **Customer screen** — name and contact from the job.
3. **Job Site extras** — lock codes / access if already on the job.
4. **Something just seen on the phone or sim.**

Parked: FE1, B2, FE3, notify-office, paid PowerSync, per-crew filtering.

Test job: **10176 / 1284 / call_log 3712**. Do not use hand-patched 10257 for pipeline checks.

---

## GIT STATE ON CLOSE

- **field-command:** `main`, clean, in sync with `origin/main` after this handoff is pushed.
- Local `feat/sync-trip-names` and `feat/job-site-directions` were deleted after merge. No leftover feature branch holds the only copy.
- Next session starts on `main`.
