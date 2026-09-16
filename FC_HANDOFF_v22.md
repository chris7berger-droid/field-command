# Field Command — Handoff v22

**Date:** 2026-09-15
**Branch:** `fix/eas-remote-ios-build-number` (do not merge until Chris approves)
**Session goal:** Fix the duplicate iOS build-number 2 so the next production EAS build is 1.0.0 (3). No EAS build or submit.

---

## SESSION SUMMARY

Two production binaries both shipped as **1.0.0 (2)**. App Store Connect already has that number, so the second upload was rejected. Do **not** retry that submission.

| Binary | EAS build | Git | App version | iOS build | Notes |
|--------|-----------|-----|-------------|-----------|--------|
| White-screen TestFlight | `3a37b775-b503-4eeb-8b2e-52cfb71f052d` | pre-env-fix | 1.0.0 | **2** | Installed, unusable. Env-inlining bug. |
| Env-fix binary | `d6ce5a1f-d5ec-4473-9600-47229f8e6df1` | `ddbf6bf` (PR #5) | 1.0.0 | **2** | Contains the white-screen fix. Submit failed: duplicate 1.0.0 (2). |

Root cause: `eas.json` used `cli.appVersionSource: "local"` with production `autoIncrement: true`. The first production build read committed `ios.buildNumber` **1**, built **2**, and mutated the working-tree `app.json` to `"2"`. That mutation was never committed. The next clean-main production build started from **1** again and autoIncremented to **2** again.

Expo documents this: with a local version source, autoIncrement edits the project files, and **you must commit that change** for the bump to persist.

Fix: switch to EAS **remote** version source (recommended). Seed the remote last-used iOS `buildNumber` to **2** (what App Store Connect already has). Keep production `autoIncrement: true`. Leave marketing version **1.0.0**. Do not touch the env white-screen fix.

`app.json` `ios.buildNumber` stays `"1"` in git. With remote source, EAS ignores that field at build time (EAS CLI warns; `expo-constants` may still show the local value). Remote is the source of truth.

---

## VERIFICATION (no build / no submit)

- `eas.json`: `cli.appVersionSource` = `"remote"`; production `autoIncrement` = `true`; `version` remains 1.0.0.
- `npx eas-cli build:version:get -p ios -e production --json` → `{ "buildNumber": "2" }`.
- EAS CLI `resolveRemoteBuildNumberAsync` + `getNextBuildNumber`: if remote is `2` and the profile has `autoIncrement`, the next production iOS build writes **3** to the remote store and uses **3** as `CFBundleVersion`. After that, remote is 3 so the following production build is 4, then 5, …
- Next production EAS iOS build = **1.0.0 (3)**, not another (2).
- Subsequent production builds increment on EAS servers. They do not depend on committing a local `app.json` bump.

---

## BACKLOG

- **TF1** — TestFlight build 2 is still the white-screen binary. The ddbf6bf binary has the env fix but was also numbered 2 and was **not** submitted. After this PR merges: EAS production build (will be 3) + submit. Do not resubmit `d6ce5a1f`.
- **FE1 / B2 / FE3** unchanged.

---

## NEXT SESSION

1. Merge this PR after Chris approves.
2. Then, only if Chris asks: `npx eas-cli build --platform ios --profile production` (must be **1.0.0 (3)**). Then submit that new binary. Do not submit `d6ce5a1f`.

Expo Go is not a valid runtime. Test job **10176 / 1284 / call_log 3712**.
