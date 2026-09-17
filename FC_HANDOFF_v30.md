# Field Command — Handoff v30

**Date:** 2026-09-17
**Branch:** `main`
**Session goal:** Close VIS-2 after Build 5 physical-iPhone acceptance. Docs only.

---

## SESSION SUMMARY

Build 5 on Chris’s physical iPhone **passed** the VIS-2 / VIS-1 Home fixture.

#10176 (`call_log` 3712, Sales **Wants Bid**, Schedule **Parked**):

- Chris Berger assigned Mon 9/14 + Tue 9/15 in Crew Scheduler
- Field Home showed **#10176**
- Job opened normally from Home
- Chris removed from those assignments in Crew Scheduler
- Job left Field Home **immediately** via PowerSync — no manual refresh
- Chris is currently **unassigned**
- No Field production writes

VIS-2 code is on `main` (`0c5c8e8`, PR #11). VIS-1 dashboard `parked_scheduled_call_log` remains live. View All / Refresh not started. TF2 stays paused.

---

## NEXT

Do not start View All, Refresh, or TF2 writes until Chris asks. Expo Go is not a valid runtime.
