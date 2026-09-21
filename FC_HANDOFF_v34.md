# Field Command — Handoff v34

**Date:** 2026-09-21
**Branch:** `main`
**Session goal:** Architecture-lane Photo Library latency — measure, then smallest production fix.

---

## SESSION SUMMARY

FROM LIBRARY was intermittently slow after Add. Investigation found Daily Log SOD/MOD/EOD/ADL share one picker; PRT does not pick photos; upload/compress run on Submit only. Physical A/B on the same photo: `quality: 0.7` Add→visible 828 ms vs `quality: 1` 102 ms (~8×), almost all in native export before JS. T4 Build-vs-Plan: **ALIGNED**. Production change is library `quality: 1` so iOS can use Expo’s fast path. TAKE PHOTO, Submit compress, R2, and representation mode unchanged. Temporary A/B harness fully removed. No Bugbot, EAS, or Build 9.

---

## SHIPPED

- `cb45209` — `fix: pick Daily Log library photos on the iOS fast path`
- Fast-forward merge of `feat/library-picker-fast-path` to `main` at `cb45209`

---

## DECISIONS

- Library picker `quality: 1` (fast-path). Do not compress at pick time.
- Submit still compresses to 1800px JPEG 0.7 in `src/lib/photos.js`.
- iCloud/edited Photos slowness is native; no Field workaround.

---

## DEFERRED / PENDING

- Build 9 / TestFlight — not started
- Notify-office still button copy (FE3)
- Physical iPhone overnight punch-out latency still waiting on a real next-morning recovery

---

## NEXT SESSION

Start on `main`. Do not start Build 9 unless Chris asks. Simulator already has the clean Debug build at sign-in if a local accept pass is needed.

---

## GIT

- Feature `feat/library-picker-fast-path` fast-forward merged to `main` at `cb45209`
- Pushed `main` (never force)
- Local feature branch deleted after this handoff lands
- No force-push
