# Field Command — Handoff v31

**Date:** 2026-09-18
**Branch:** `main`
**Session goal:** Close ANDROID-1 by landing the proven EAS Android internal APK `preview` profile.

---

## SESSION SUMMARY

ANDROID-1 native Android baseline is **closed on `main`**.

The successful EAS Android internal APK (`01e92d30-1d8d-43e6-9939-78de30f6c49a`, profile `preview`, internal, APK, not Play) was built from Mac-local commit `a9c9749b` (parent `6d38189`, `eas.json` +11 only). That commit was never on GitHub. The exact `build.preview` object was restored onto then-current `origin/main` `f3421c5` as `2ec56b6` (PR #12), fast-forward merged.

`eas.json` `development`, `production`, and iOS `submit` were not changed. No new EAS build, no Play submit, no field-phone install, no TF2 writes.

This Cursor Linux VM cannot run a hardware-accelerated Android emulator. Runtime stays Mac / physical device.

---

## SHIPPED

- `main` `2ec56b6` — `build: preserve Android internal APK preview profile`
- `build.preview`: `distribution: internal`, `android.buildType: apk`, same three `EXPO_PUBLIC_*` env values as the successful build

---

## DEFERRED (not this slice)

- First Android field-user install + read-only verification (after Chris’s iOS test/approval)
- Google Play
- System Back triangle does not navigate; in-app `< JOB` / `< JOBS` works
- Forgot Password (shared LoginScreen; not Android-specific)
- TF2 production writes

---

## NEXT SESSION

Do **not** install the APK on a field phone until Chris signs off iOS. Then: first already-Field-enabled Android install, read-only (Home / View All / Customer / Job Site). No Time Clock, SOW checks, Reports, photos, punch-out. No new EAS build unless Chris asks. Expo Go is not a valid runtime.

---

## GIT

- `main` after merge: `2ec56b6c08aca0b17a4a41322b355468dcd489a1`
- Feature branch `cursor/android-eas-internal-preview-805e` merged FF; local branch deleted after this handoff lands
- PR #12
