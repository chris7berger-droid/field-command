# Field Command — Handoff v17

**Date:** 2026-09-13
**Branch:** `main` after wrap (`71005d7` before this handoff commit)
**Session goal:** Pickup from v16. Home / clock polish. Customer pipe started, then paused for Sales fields.

---

## SESSION SUMMARY

Picked up on clean `main`. Home **OPEN JOB** became a small chip on the job-number row.

Time Clock now says which job you are punching and has **CHOOSE A DIFFERENT JOB** (this-week list, tap opens that clock). ON SITE chip removed until geofencing is tied to Google navigation.

Duty bars go to the matching form: SOD / MOD / EOD open Daily Log for that type; PRT stays on the production form. Daily log library pick is multi-select.

Get Directions now sends the phone GPS as the route origin. Simulator still starts from its fake pin (Union Square). Test on a real iPhone later.

Customer information was next. Chris paused to add Sales fields on `jobs.field_sow` first (customer contact, access, lock codes, security). No customer sync landed this session.

---

## CHANGES SHIPPED (on `main`)

- `HomeScreen.js` — OPEN JOB chip beside the job number; duty bars pass SOD/MOD/EOD/PRT.
- `JobDetailScreen.js` / `ReportTab.js` — Reports opens Daily Log or PRT from the duty bar. Header stays REPORTS (toggle can switch). Library multi-select for log photos.
- `TimeClockTab.js` — punch-into banner + choose a different job; ON SITE chip gone.
- `JobListScreen.js` — `pickFor: 'TimeClock'` picker.
- `JobSiteScreen.js` — Get Directions uses current GPS as origin.

Customer pipe: not started in code. Branch was named `feat/customer-contacts` then merged with the polish only.

---

## DECISIONS

- Duty bar destination matches the bar. SOD does not open PRT.
- Clock escape hatch copy is **CHOOSE A DIFFERENT JOB**, not "NOT THIS JOB."
- Geofence chip parked. GPS on punch and off-site flag stay.
- Get Directions origin is device GPS. Simulator location is not the Mac's location.
- **Customer SoT:** phone/email already live on Sales `customers` / `customer_contacts`. Access / lock / security can live on the job or Field SOW. Do not also copy contacts onto `field_sow` or Field will have two writers. Decide in Sales before Field reads it.
- One Bugbot pass. Fixed header stuck on DAILY LOG after toggling to PRT. No second pass.

---

## BACKLOG

- **FE1 / B2 / FE3** unchanged.
- Customer / Job Site extras wait on the Sales field work.
- Physical iPhone: Get Directions + TestFlight still parked.

---

## NEXT SESSION

1. Sales Command: add the Field SOW / job fields Chris wants (access, lock, security). Keep customer contact on the customer record unless Sales deliberately moves the writer.
2. Then Field: pipe those fields onto Customer and Job Site.
3. Physical iPhone: Get Directions from current location.
4. Optional: FE1 trade labels on merged days.

Test job: **10176 / 1284 / call_log 3712**. Do not use hand-patched 10257.

---

## GIT STATE ON CLOSE

- **field-command:** `main`, clean, in sync with `origin/main` after this handoff is pushed.
- Local `feat/customer-contacts` deleted after merge.
- Next session starts on `main`.
- Sales Command work is a different repo and a different chat.
