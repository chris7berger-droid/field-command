# Field Command — Handoff v18

**Date:** 2026-09-15
**Branch:** `cursor/production-activation-gate-a21d` (not merged; waiting on Chris)
**Implementation:** `bb0a7b6` Fail-close Field Command activation and writer identity
**Session goal:** Close out the activation/identity slice after Chris runtime-verified it on the native iOS simulator. Docs + PR only. No merge until Chris approves.

---

## SESSION SUMMARY

Activation-gate runtime verification is complete. Chris ran the branch locally on his Mac with the native iOS development build (`npx expo run:ios`) on the iPhone 17 simulator.

Activated `team_members` accounts with the `"field"` entitlement reached Home and loaded real current job/crew data. Accounts without Field entitlement stopped on **FIELD COMMAND NOT ACTIVE** and never entered the operational Home UI. **SIGN OUT** on that screen returned to login.

No PowerSync reset or redeploy was required. This close-out did not change RLS, PowerSync rules, database schema, user entitlements, or desktop Subcon Command. EAS / TestFlight was not started.

---

## WHAT SHIPPED (on this branch, not yet on `main`)

Fail-close Field Command activation + canonical writer identity:

- `src/lib/activation.js` — `team_members.active` plus `apps` includes `"field"`; require a real `team_members.id` on writes.
- `App.js` — lookup by `auth_id` then email; blocked screen with SIGN OUT; PowerSync connects only after activation is allowed.
- `src/lib/connector.js` — upload path refuses rows missing a canonical actor id.
- Time Clock, PunchStatusBar, Report, Tasks, JobDetail — writes use the canonical id, not email-fallback / empty-string identity.

Email-derived fallback users and the `crew` table login fallback are gone. If the row is missing, inactive, or not entitled to Field, the phone does not enter the operational UI.

---

## RUNTIME VERIFICATION (Chris, native iOS)

Environment: Mac, iPhone 17 simulator, **`npx expo run:ios`**. Native development build installed and launched.

1. Existing active `team_members` account with `"field"` entitlement authenticated and reached the normal Home screen.
2. Home loaded real current job/crew data — the operational/sync path stayed functional.
3. Existing authenticated `team_members` account **without** Field entitlement was blocked at:

   **FIELD COMMAND NOT ACTIVE**
   Your account is not currently activated for Field Command.
   Contact the office if you need access.

4. Blocked account did not enter the operational Home UI.
5. **SIGN OUT** on the blocked screen returned to the Field Command login screen.
6. Native iOS development build installed and launched successfully.

### Expo Go is not a valid runtime

Field Command uses custom native modules including PowerSync / OP-SQLite. **Expo Go cannot run this app.** Do not spend a future session trying to validate Field Command through Expo Go. Use `npx expo run:ios` (or a later EAS/TestFlight native build).

---

## DECISIONS

- Activation SoT is `team_members`: must be `active` and `apps` must include `"field"`. Fail closed.
- Writer identity is `team_members.id`. Empty string / email / `crew` table fallbacks are not writers.
- Operational screens still have no everyday sign-out. The blocked/non-activated screen has **SIGN OUT** so the wrong account can leave.
- No PowerSync reset was needed for this slice.
- Do not merge until Chris approves the PR. Do not start EAS/TestFlight in the same breath.

---

## FINAL REVIEW

Compared `origin/main...HEAD` before the docs commit. Only these files changed for the product slice:

- `App.js`
- `src/lib/activation.js` (added)
- `src/lib/connector.js`
- `src/components/PunchStatusBar.js`
- `src/screens/JobDetailScreen.js` (`user?.id || ''` → `null`)
- `src/screens/tabs/ReportTab.js`
- `src/screens/tabs/TasksTab.js`
- `src/screens/tabs/TimeClockTab.js`

No unintended files. No RLS, PowerSync yaml, schema, entitlement, or Subcon Command edits.

---

## BACKLOG

- **AG1** (this slice) → Completed Log.
- **FE1 / B2 / FE3** unchanged.
- Physical iPhone / EAS / TestFlight still parked. Do not start that next unless Chris asks.

---

## NEXT SESSION

1. After Chris approves: merge this PR to `main` (fast-forward when possible), check out `main`, delete the local feature branch, push `main`.
2. Then, only if Chris asks: EAS / TestFlight on a real iPhone.
3. Otherwise: Sales Field SOW extras → Customer / Job Site pipe, or FE1 trade labels.

Test job: **10176 / 1284 / call_log 3712**. Do not use hand-patched 10257.

---

## GIT STATE ON THIS CLOSE-OUT

- **On** `cursor/production-activation-gate-a21d`, not `main`.
- Implementation commit: `bb0a7b6`.
- This handoff is a documentation commit on the same branch, then a PR for review.
- **Do not merge until Chris approves.**
- Local `main` may be stale; `origin/main` is the merge base for this branch.
- Next session should not assume this is already on `main`.
