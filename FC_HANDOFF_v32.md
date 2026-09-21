# Field Command — Handoff v32

**Date:** 2026-09-20
**Branch:** `main`
**Session goal:** Overnight corrective Punch Out latency — smallest PunchStatusBar-only fix.

---

## SESSION SUMMARY

Inspected overnight **PUNCH OUT NOW AND NOTIFY OFFICE** vs current Clock In / Clock Out. Recovery lives in `PunchStatusBar.punchOutNow`, not Time Clock Clock Out. It was waiting on High GPS plus blocking weather (~8s on a next-morning iPhone), same pattern as the old Clock In path.

Shipped the smallest fix: reuse Clock In’s last-known → Balanced → High ladder, INSERT the corrective `clock_out` immediately with weather null, patch weather on the same punch id asynchronously, release busy after the local write. GPS-fail recovery, lat/lng / `on_site` / `gps_override`, overnight association, Night Work, Notify Office copy, and in-flight `busy` guard are unchanged. Time Clock Clock Out was not touched. No Bugbot, EAS, or Build 9.

---

## SHIPPED

- `de9a45e` — `fix: accept a recent GPS fix on overnight punch-out without waiting for weather`
- `src/components/PunchStatusBar.js` only for the runtime change
- `scripts/verify-overnight-punch-out-gps-latency.cjs` plus existing Clock In GPS script still passing

---

## DEFERRED / PENDING

- **Physical iPhone overnight latency verification** — wait for the next natural missed clock-out. Do not manufacture production punch data to test it.
- Notify-office is still button copy (FE3 / office time correction later)
- Normal Time Clock Clock Out still uses High GPS and awaits weather (out of scope)

---

## NEXT SESSION

Start on `main`. Do not start Build 9 unless Chris asks. When a real next-morning recovery happens on the physical iPhone, confirm Punch Out Now no longer feels like the old ~8s Clock In wait. Simulator GPS is not a latency proof.

---

## GIT

- Feature `fix/overnight-punch-out-latency` fast-forward merged to `main` at `de9a45e`
- Pushed the feature branch, then `main`
- Local feature branch deleted after this handoff lands
- No force-push
