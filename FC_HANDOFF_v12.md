# Field Command — Handoff v12

**Date:** 2026-08-27
**Branch:** `main` (nothing new committed to code since v11; this handoff only)
**Session goal (this segment):** Get the current build onto Chris's physical iPhone so he can use it in-hand, after the v11 feature work was merged + shipped.

---

## SESSION SUMMARY

Continuation of the v11 session (all crew-side + office + DB work is in FC_HANDOFF_v11.md, already merged to main and live in prod). This segment stood up the first **on-device build** of Field Command on Chris's physical iPhone (a standalone Release build via `npx expo run:ios --device`). No code changed — this was a device-provisioning exercise. It required crossing several first-time Apple/device gates (documented below so it's a checklist next time or for other devices). App installed and launched; Chris signed in and confirmed it "looks good," but **flagged some unspecified issues seen on-device** — deferred to next session at his call (he was done for the day).

---

## CHANGES SHIPPED

None (no code commits this segment). All feature work landed in v11.

---

## DEPLOYED

- **Field Command Release build → Chris's physical iPhone** (device id `00008030-0019553E01E0C02E`, iOS 26.6). Standalone (JS bundled, no Metro/cable needed to run). Free-Apple-ID dev cert → **expires ~7 days** (2026-09-03-ish); rebuild to refresh.
- Build command: `cd ~/field-command && npx expo run:ios --device 00008030-0019553E01E0C02E --configuration Release`.
- Talks to the same **shared prod** Supabase/PowerSync as the sim — on-device actions (clock-ins, PRTs, material checks) are real records.

**First-time device gates crossed (checklist for next device / next cert refresh):**
1. Xcode → Settings → Accounts → add Apple ID (creates the Personal Team + dev cert).
2. Xcode → open `ios/FieldCommand.xcworkspace` → target FieldCommand → Signing & Capabilities → Automatically manage signing + Team = Chris Berger.
3. A transient "PLA Update available / no profiles" error cleared just by signing into **developer.apple.com/account** once (free account, no separate agreement to accept) then Xcode → Try Again. Signing Cert became `Apple Development: Chris Berger (SC66T34Z2T)`.
4. **Developer Mode** on the iPhone: Settings → Privacy & Security → Developer Mode → On → restart. (Build failed with "Developer Mode disabled" until this was done.)
5. Keychain prompt "codesign wants to access key…" → enter **Mac login password** → **Always Allow**.

---

## DECISIONS / CHOICES MADE

- **Release build, not Debug.** So the app runs standalone on the phone with no dev server — Chris can carry it around and use it. Trade-off: a code change requires a rebuild (no live reload), which is fine for kicking the tires.

---

## NEW BACKLOG ITEMS

- **On-device issues (unspecified) — to triage.** Chris saw "some issues" on the physical phone but stopped for the day without enumerating them. First next-session action is to have him list what he saw.

## CLOSED THIS SESSION

- Getting the app onto a real device (the "needs a native build to reach phones" pointer from v11) — done for Chris's iPhone.

---

## VERIFICATION

- App **built, installed, and launched** on Chris's iPhone (install log `✔ Complete 100%`); Chris signed in successfully and confirmed the UI "looks good."
- **NOT verified:** the specific on-device issues Chris flagged (not yet described). Also still carrying v11's unverified paths — the **clock-out block** (needs a job with no PRT) and **Scheduled/Parked → In Progress on clock-in** (10261 was already In Progress) — both now testable on the real phone.

---

## NOT TOUCHED THIS SESSION

- Everything from v11's NOT TOUCHED list still stands (per-crew sync filtering, PowerSync paid tier, office "expected-but-not-reported" PRT cross-ref, QB-sync cron migration lands after ours).

---

## NEXT SESSION POINTERS

1. **Ask Chris to enumerate the on-device issues** he saw, then triage.
2. The dev cert **expires ~7 days out** — if the app won't launch, rebuild with the command above (phone plugged in, Developer Mode already on).
3. Now that it's on a real phone, exercise the two still-unverified flows: clock out of a job with **no** PRT (expect "Submit your PRT first"); clock in on a **Scheduled** job (expect auto → In Progress + a `job_changes` row, source `field_clock_in`).
4. Pre-flight unchanged: free PowerSync instance can idle out; wipe+resync recipe in v11.

---

## FILES TO PROBABLY KNOW ABOUT NEXT SESSION

- Same set as v11 (TasksTab / ReportTab / TimeClockTab / connector.js / utils.js in field-command; PRTModal/LogsModal/LoadOutModal in sch-command; the three command-suite-db migrations). No file changes this segment.
- `ios/FieldCommand.xcworkspace` — now has signing configured for Chris's Personal Team (Automatically manage signing).

---

## GIT STATE ON CLOSE

- **field-command:** branch `main`, in sync with origin/main after this handoff is pushed. Working tree: only gitignored build artifacts (DerivedData, Pods) from the device build — nothing tracked to commit beyond this handoff.
- **sch-command / command-suite-db:** unchanged since v11 (`c221cff` / `bf73ec2`), on main, in sync.
- No open PRs; feature branches already deleted.

---

## END STATE

All v11 work merged + deployed + verified against prod; app now running on Chris's physical iPhone (standalone Release, ~7-day cert). Unspecified on-device issues flagged for next session. Ready for a fresh session.
