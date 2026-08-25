# Field Command — Handoff v8

**Date:** 2026-08-25
**Branch:** `fix/powersync-connect-on-restored-session`
**Session goal:** See the rebuilt Field SOW render in the Field Command mobile app, using a real end-to-end test job pushed from Sales Command → Schedule Command.

---

## Where this stands right now

- **Backend is fixed.** The whole sync engine (PowerSync) was dead and is now rebuilt and healthy.
- **App still shows "Offline"** and the old job (10031). One step left to get it actually connecting — see "Next steps."

Nothing is on fire. The hard part (a fully dead backend) is behind us.

---

## What happened this session

### The test job (built end-to-end, worked)
- Job **10257 – "TEST Field SOW flow through and format – Urethane Cement"**, customer **Washoe Painting**.
- Pushed through Sales Command → Schedule Command successfully. It's live in the shared database.
- In the database it is: `call_log` id **3855**, stage **"In Progress"** — which the Field app is *supposed* to sync.
- Its SOW data is present: a 4-day `field_sow`, one work type (Urethane Cement).

### Why nothing showed on the phone (the real problem)
The Field app's sync engine — **PowerSync Cloud** — was **completely dead**. Its internet address had stopped existing (DNS "NXDOMAIN"). The app had been quietly dialing a dead server, which is why the phone was frozen on stale data (job 10031) and showing "Offline."

**Root cause:** PowerSync's **free tier tears the instance down when it sits idle.** This has now bitten twice. To keep it always-on for real daily crew use, it needs a **paid tier** — a real budget decision, but for *later*, not a blocker for testing.

### What we fixed on the backend (all done, in the PowerSync dashboard)
1. Chris **redeployed** the PowerSync instance. It came back at the **same address**
   (`69d81f100e377e689729db98.powersync.journeyapps.com`), so no code URL change was needed.
2. The redeploy left the instance blank/misconfigured. We fixed:
   - **Sync Rules** — redeployed (the 9 Field tables; config lives in `powersync-sync-rules.yaml`).
   - **Database Connection** — was failing with "password authentication failed." Re-entering the
     correct database password fixed it → **"Connection Successful."**
   - Sync Rules error cleared; deploy completed / provisioned.

### What we fixed in the code (this branch)
**`App.js`** — the app only connected the sync engine on a *fresh login*. On a normal app relaunch
(which restores a saved login), it rendered the signed-in screen but **never connected**, leaving it
permanently "Offline." This would have broken sync for **every crew member every time they reopened
the app.** Fix: connect whenever the database is ready and a session exists — covering both fresh
login and restored session. (Committed on this branch.)

---

## Next steps (first thing next time)

1. **Get the app to connect.** ⌘R (JS reload) did not do it. Start clean instead:
   delete Field Command from the simulator, then relaunch (`npm run ios`) so it opens to the
   **login screen**. A fresh login gets a fresh token *and* runs the connect path for certain.
2. **Confirm the job syncs** — old job 10031 drops off, **10257 – Washoe Painting** appears.
   (10031 is stage "Sold," which the sync rules correctly exclude, so it should disappear once
   the app is truly live-synced.)
3. **The real goal:** open 10257 → **Tasks tab** → check how the rebuilt SOW renders.

## Parked items (not addressed this session)
- **Duplicate job records:** this one test job created **3 `jobs` rows** (ids 96, 97, 98) for the
  same job; only one got the canonical `job_wtcs` row. Real data-integrity bug in the
  Sales→Schedule handoff. Won't show as 3 in the Field list (that list is keyed off `call_log`,
  which has one row), but needs fixing. Owner likely sch-command — confirm before filing.
- **PowerSync paid tier** decision, before real crew use (see root cause above).

---

## How to launch from a fresh machine (e.g. the laptop)
```bash
git clone <field-command repo>            # chris7berger-droid/field-command
cd field-command
git checkout fix/powersync-connect-on-restored-session
npm install                               # JS dependencies
cd ios && pod install && cd ..            # native iOS dependencies
npm run ios                               # build + launch in the iPhone simulator
```
Config (Supabase URL/key, PowerSync URL) is hardcoded as fallbacks in
`src/lib/supabase.js` and `src/lib/connector.js`, so no `.env` file is required to run.

## Key references
- Sync engine (PowerSync) dashboard: dashboard.powersync.com → org `chris7berger-droid` → project **Field Command**
- Shared database (Supabase): project `pbgvgjjuhnpsumnowuym`
- Sync rules file in this repo: `powersync-sync-rules.yaml`
