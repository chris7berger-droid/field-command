# Field Command — Handoff v19

**Date:** 2026-09-15
**Branch:** `feat/eas-testflight-ios` (PR to `main`; do not merge until Chris approves)
**Session goal:** EAS / TestFlight **release-readiness configuration only**. No EAS build. No TestFlight submit.

---

## SESSION SUMMARY

Prepared Field Command for a repeatable iOS EAS production build (store / TestFlight path). Expo project is linked. Client environment values are explicit. Expo Go is not a valid runtime.

Chris logged into Expo as `@chris7berger`. `eas init` created and linked `@chris7berger/field-command`. No build and no submit were started.

The first real-phone/TestFlight binary is **not** in this slice. It is gated on Chris’s paid Apple Developer Program status and Apple signing/credentials. Local Xcode Personal Team `7T26H9PCGN` is the free 7-day device path from v12 — not the TestFlight signing path.

---

## EXPO / EAS LINKAGE

- **Account:** `@chris7berger`
- **Project:** `@chris7berger/field-command`
- **projectId:** `9b762fbe-c0d1-46a6-a2bb-efe014e7b489`
- Lives in `app.json` → `expo.extra.eas.projectId` with `owner: chris7berger`. `app.config.js` passes that config through.

---

## WHAT THIS SLICE SHIPPED (on the branch, pending merge)

- `eas.json` — `development` (dev client, internal) and `production` (`distribution: store`, `autoIncrement: true`) with explicit `EXPO_PUBLIC_*` env.
- `.env` — same three **publishable** client values for local `npx expo run:ios`.
- `src/lib/env.js` — runtime fail-closed if a required public value is missing. Refuses a service-role key. No silent JS fallbacks.
- `app.config.js` — config-time check; skips the missing-env throw when `EXPO_NO_DOTENV` is set so `eas init` / EAS config probes can run. Does not invent values.
- `app.json` — iOS `buildNumber` 1, `ITSAppUsesNonExemptEncryption: false`, EAS project link.
- SDK 54 alignment: `babel-preset-expo` off 55, `expo-dev-client` added. Expo Go remains invalid.

**Not done:** `eas build`, `eas submit`, Apple credentials, TestFlight testers.

---

## RUNTIME / BUILD RULES

- **Expo Go is not a valid Field Command runtime.** PowerSync / OP-SQLite need a native development or production build (`npx expo run:ios` or EAS).
- **Production profile** is the store/TestFlight path (`distribution: store`).
- Production client env is explicit in `eas.json` production `env` (and local `.env`). No silent runtime fallbacks. No service-role key.
- Future work may move these publishable values to EAS-managed environments. Do not redesign that in this slice.

---

## VERIFICATION (this close-out)

- Diff review: release-config files only; no activation/UI/RLS/PowerSync-rules/schema/entitlement changes.
- No service-role / private secrets in the commit. Anon key is `sb_publishable_…`.
- `npx expo config --json` — owner `chris7berger`, projectId `9b762fbe-c0d1-46a6-a2bb-efe014e7b489`.
- `npx eas-cli config --platform ios --profile production` — all three `EXPO_PUBLIC_*` loaded from the production profile `env`.
- `npx expo-doctor` — 18/18.
- `npx expo export --platform ios` — succeeded.

---

## DECISIONS

- Fail-closed at runtime; config evaluation may proceed under `EXPO_NO_DOTENV` so EAS can read the project.
- Local Personal Team `7T26H9PCGN` stays for cable/simulator installs only.
- Do not start the first EAS iOS production build until Chris confirms paid Apple Developer Program enrollment.

---

## BACKLOG

- **REL1** (this slice) → Completed Log (config ready, no binary yet).
- **TF1** (next) — first EAS iOS production build + TestFlight submit, blocked on paid Apple Developer Program.
- **FE1 / B2 / FE3** unchanged.
- **AG1** already on `main` (`54e4ceb`).

---

## NEXT SESSION

1. Merge this PR only after Chris approves.
2. Confirm paid Apple Developer Program (not the free Personal Team).
3. Then, only if Chris asks: `npx eas-cli build --platform ios --profile production`. Let EAS manage credentials under the **paid** team. Do not submit until that build is reviewed.
4. After Chris approves the binary: `npx eas-cli submit --platform ios --profile production`, then App Store Connect → TestFlight → Internal Testing.

Test job still **10176 / 1284 / call_log 3712**.

---

## GIT STATE ON THIS CLOSE-OUT

- On `feat/eas-testflight-ios`, not `main`.
- PR opened; **do not merge until Chris approves.**
- No EAS build artifact exists yet.
