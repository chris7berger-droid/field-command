# Field Command — Handoff v21

**Date:** 2026-09-15
**Branch:** `fix/testflight-static-env-inline` (do not merge until Chris approves)
**Session goal:** Fix TestFlight 1.0.0 build 2 white screen. Docs + `env.js` only. No EAS build 3 yet.

---

## SESSION SUMMARY

TestFlight 1.0.0 **build 2** (`3a37b775-b503-4eeb-8b2e-52cfb71f052d`) installed on Chris’s iPhone and launched to a **persistent white screen** — no login, no Home.

Root cause: `src/lib/env.js` read `process.env[name]` dynamically. Expo production inlining only replaces **static** `process.env.EXPO_PUBLIC_*`. The store JS bundle had **none** of the three public values, so `requiredPublicEnv` threw at import time, before React mounted. Production has no redbox, so the window stayed white.

The activation-gate simulator success was on an earlier commit that still had silent JS fallbacks. This is not a PowerSync/RLS/activation bug.

Fix: pass each required value as a static `process.env.EXPO_PUBLIC_*` argument. Fail-closed if a value is genuinely missing. No hardcoded URLs/keys, no fallbacks.

---

## VERIFICATION

- Production export (`NODE_ENV=production npx expo export --platform ios --no-bytecode --no-minify`): Supabase host, PowerSync host, and `sb_publishable_` key each appear once. `process.env[name]` count is 0. Inlined calls look like `requiredPublicEnv('EXPO_PUBLIC_SUPABASE_URL', "https://pbgvgjjuhnpsumnowuym.supabase.co")`.
- Missing env still fail-closed: production Babel with vars unset inlines `undefined`; helper throws `Missing EXPO_PUBLIC_SUPABASE_URL`.
- `npx expo-doctor` 18/18.
- `npx expo run:ios --configuration Release` on iPhone 17 simulator reached the Field Command **SIGN IN** screen (not white). Caveat: local Release still opened via `expo-development-client` + Metro because `expo-dev-client` is in the app. The production-export grep is the store-bundle proof. TestFlight standalone still needs build 3.

---

## BACKLOG

- **TF1** — TestFlight build 2 is installed but unusable (white screen). Next: merge this fix, then EAS production build 3 + submit.
- **FE1 / B2 / FE3** unchanged.

---

## NEXT SESSION

1. Merge this PR after Chris approves.
2. Then, only if Chris asks: `npx eas-cli build --platform ios --profile production` (build 3). Review on TestFlight before treating TF1 as done.

Expo Go is not a valid runtime. Test job **10176 / 1284 / call_log 3712**.
