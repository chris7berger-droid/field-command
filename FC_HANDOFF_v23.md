# Field Command — Handoff v23

**Date:** 2026-09-16
**Branch:** `docs/tf1-build-3-verified` (do not merge until Chris approves)
**Session goal:** Document TestFlight 1.0.0 (3) physical-iPhone success. Docs only. No code, EAS, build, submit, or production writes.

---

## SESSION SUMMARY

**TF1 is done.** Build 3 is the first successful physical-iPhone TestFlight production build.

Git starting point for today: `main` `7561aa9f1694e7196de86d28177dcd5567392904` (PR #6, remote iOS versioning).

| Binary | EAS build | Git | App version | iOS build | Outcome |
|--------|-----------|-----|-------------|-----------|---------|
| White-screen TestFlight | `3a37b775-b503-4eeb-8b2e-52cfb71f052d` | pre-env-fix | 1.0.0 | **2** | Failed. Persistent white screen. Still on TestFlight as history — do not treat as current. |
| Env-fix, duplicate number | `d6ce5a1f-d5ec-4473-9600-47229f8e6df1` | `ddbf6bf` (PR #5) | 1.0.0 | **2** | Contained the env fix. Apple rejected submit (1.0.0 (2) already existed). Do **not** resubmit. |
| First good phone build | `236f4c9e-f334-436e-8711-b4a5204d9c14` | `7561aa9` (PR #6) | 1.0.0 | **3** | Built, submitted, processed. Testing in internal Team (Expo). Chris updated the physical iPhone 2 → 3. |

Keep that history. Do not delete or rewrite it.

---

## PHYSICAL IPHONE VERIFICATION (build 3)

Passed on Chris’s phone, TestFlight **1.0.0 (3)**:

1. Launches — no white screen.
2. SIGN IN screen renders normally.
3. Signed in with an existing Field-enabled production account.
4. Activation gate allowed the entitled account through.
5. Home / “Hey, Chris” loaded.
6. Real current production jobs loaded.
7. Opened a real job successfully.

**Not tested (intentionally — no production writes yet):**

- time punch
- daily log
- PRT
- material check
- photo submission

---

## BACKLOG

- **TF1** — Closed 2026-09-16. Build 3 verified on the physical iPhone.
- **TF2** — Open. Next work: **controlled production write verification**, one write path at a time, before activating additional crew users.
- **FE1 / B2 / FE3** unchanged.

---

## NEXT SESSION

**Objective:** CONTROLLED PRODUCTION WRITE VERIFICATION on TestFlight 1.0.0 (3).

- Device: Chris’s physical iPhone, current TestFlight build 3. Expo Go is not valid.
- One write path at a time. Do not batch. Stop and record after each path.
- Paths still unverified: time punch, daily log, PRT, material check, photo submission.
- Do not activate additional crew users until write paths are proven.
- Do not invent a new EAS build unless a write-path bug requires a code fix.

Expo Go is not a valid runtime. Test job **10176 / 1284 / call_log 3712** remains the known simulator/SOW smoke job; today’s writes should use a real job Chris chooses on the phone.
