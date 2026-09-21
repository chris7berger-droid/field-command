# Field Command — Handoff v33

**Date:** 2026-09-21
**Branch:** `main`
**Session goal:** Manual Refresh + PowerSync lifecycle owner, then architecture correction after independent audit.

---

## SESSION SUMMARY

Shipped a global **REFRESH** pill (automatic PowerSync stream stays primary) and an authenticated lifecycle owner that restores a truly dead stream. An independent Build-vs-Plan audit found **NOT ALIGNED** (Refresh called raw `db.connect()` beside App.js, which can tear down an in-flight stream). Smallest correction: one coalesced `connectPowerSync()` owner, Refresh waits while `connecting`, abort on logout/unmount, cooldown wakeup that cannot drop while truly dead. Independent re-audit: **A. ALIGNED**. Simulator acceptance passed (instant REFRESH, background→foreground still instant, pill UI accepted). No Bugbot, EAS, or Build 9.

---

## SHIPPED

- `95e0d7c` — `feat: add a one-tap PowerSync refresh in app chrome`
- `557f4e0` — `fix: keep a live PowerSync stream on Refresh and show a compact pill`
- `b5cdd89` — `fix: restore PowerSync when the live stream dies while signed in`
- `e7d63d3` — `fix: share one PowerSync connect between Refresh and lifecycle recovery`
- Fast-forward merge of `feat/manual-refresh` to `main` at `e7d63d3`

---

## DECISIONS

- Live connected + already synced → **UPDATED** immediately; do not tear down the stream
- Disconnected recovery is not **UPDATED** until a post-tap checkpoint
- Timeout / failure → **NO SIGNAL**; never `disconnectAndClear` on Refresh
- One owner of `db.connect()` via `createConnectCoalescer`

---

## DEFERRED / PENDING

- Build 9 / TestFlight — not started
- Notify-office still button copy (FE3)
- Physical iPhone overnight punch-out latency still waiting on a real next-morning recovery

---

## NEXT SESSION

Start on `main`. Do not start Build 9 unless Chris asks.

---

## GIT

- Feature `feat/manual-refresh` fast-forward merged to `main` at `e7d63d3`
- Pushed the feature branch, then `main`
- Local feature branch deleted after this handoff lands
- No force-push
