# FC_HANDOFF_v6 — June 16, 2026
**Repo:** field-command · **Branch:** feat/sow-vertical
**Session:** Activate + smoke-test the Field SOW vertical (BACKLOG **D1**) — DONE

---

## TL;DR

D1 is **closed**. The Field SOW vertical now works end-to-end on a device:
Sales/Schedule write the dated SOW → `job_wtcs` → PowerSync syncs it → Field
Command renders it day-grouped on the Field SOW tab. Getting there meant
clearing **four stacked PowerSync↔Supabase infra layers**, none of which were
code. The app code (F1/F2/F3) was already correct and committed.

**Verification artifact:** `docs/handoffs/assets/fc_d1_sow_smoke_20260616.png`
(Field SOW tab, job #10044 "Field Sow to Field Command to PRT report" — Day 1–4
tabs, Test Task 1 / TARGET 20%, Vocomp 25 sealer, Production Target 10,000 SQFT).

---

## What was blocking it (the four layers, in the order they surfaced)

PowerSync's Development instance had been parked since April; reconnecting it
peeled back one problem at a time. Each fix exposed the next.

1. **IPv6-only direct connection.** While parked, Supabase migrated the direct
   DB connection (`db.pbgvgjjuhnpsumnowuym.supabase.co:5432`) to **IPv6-only**.
   PowerSync requires the *direct* connection (logical replication; the pooler
   won't stream the WAL) and was getting `ECONNREFUSED` on the IPv6 address.
   **Fix:** Supabase → Project Settings → Add-ons → **Dedicated IPv4 address**
   (~$4/mo). DNS then resolved to a dedicated IPv4 (`52.8.157.147`), AAAA record
   gone. This is additive, not a downgrade — IPv4 is the universally-reachable
   path until the IPv6 transition completes.

2. **Stale `postgres` password.** After IPv4, the error became
   `28P01 password authentication failed`. The password saved in the sheet was
   from *before* an earlier (uncommitted) reset and no longer matched. **Fix:**
   Supabase → Project Settings → Database → **Reset database password** (clean
   alphanumeric, no symbols — symbols break PowerSync's URI parsing), updated
   PowerSync's connection + the password sheet. Low blast radius: the web apps
   (Sales/Schedule Command) auth via the anon key, not the DB password, so the
   reset didn't touch production.
   *Gotcha that ate ~15 min:* a Supabase password reset isn't applied until you
   click the green confirm, and the old password keeps working until then —
   looks exactly like "new password fails, old works."

3. **Network restrictions** — checked and confirmed **open** ("accessed by all
   IP addresses"). Not the cause; ruled out.

4. **Wedged replication worker.** After all the above, the error was *back* to
   `ECONNREFUSED 52.8.157.147:5432` — but with a telling split: the endpoint was
   reachable from outside (verified `nc` 14/14 OPEN) **and** PowerSync's own
   *Test Connection passed*, yet the **replication worker** got persistent
   refusals. Recreating the connection didn't clear it. **Fix:** PowerSync →
   Settings → Danger zone → **Deprovision instance**, then **redeploy the sync
   rules** (full reprovision). The fresh instance got a worker with a working
   route. (Safe here — dev instance, no field clients, config preserved.)

Then the actual D1 action: PowerSync → Sync Rules → **Deploy** the `job_wtcs`
draft. It had been sitting as an *undeployed dashboard Draft* — the deployed
rules (version 1) never included `SELECT * FROM job_wtcs`. Deploying it (after
the connection was healthy) is what made the canonical SOW sync down.

---

## Smoke result (F2 + F3 verified live)

Field Command on iPhone 17 sim → signed in → HomeScreen showed `● Synced` and
real jobs. Opened **#10044** → **Field SOW** tab:

- **F2 — reads canonical `job_wtcs`** ✅ — Planned Tasks (Test Task 1, TARGET
  20%), Materials (Vocomp 25, water-base acrylic sealer), Production Target
  10,000 SQFT. Not the old `proposal_wtc` fallback.
- **F3 — day-grouped render** ✅ — Day 1 / Day 2 / Day 3 / Day 4 tabs
  (`mergeDaysByDate`). Day 1 = 2 crew · 16.0 hrs.

---

## Open / follow-ups

- **B1 (still open, now top item):** redeploy `upload-photo` edge fn (R2 public
  URL fix committed but live fn is the pre-`c379a99` v8). We deferred it this
  session. Deploy: `supabase functions deploy upload-photo --project-ref
  pbgvgjjuhnpsumnowuym --no-verify-jwt`, then smoke that the returned
  `public_url` loads without auth.
- **F3 calendar-date path unverified.** Job #10044 has no assigned calendar
  dates (banner: "DATES TBD — schedule hasn't assigned calendar dates yet"), so
  `mergeDaysByDate` fell back to sequential Day 1–4. The *by-actual-date*
  grouping branch is not yet exercised on device — open a job with assigned
  dates to prove it.
- **`CLAUDE.md` doc drift.** Its PowerSync section lists 5 sync tables /
  "Sync Streams edition 3"; the deployed rules now sync ~9 tables incl.
  `job_wtcs`, `jobs`, `job_crew`, `daily_log_entries`. Worth refreshing.

---

## Infra state for next session

- **Supabase:** Dedicated IPv4 add-on **ON** (~$4/mo, `52.8.157.147`). DB
  password rotated — current value is in the password sheet (dated/labeled).
- **PowerSync:** Development instance **live and healthy**, sync rules **Active**,
  `job_wtcs` deployed. NOTE: on the **Free/parked** model the instance
  deactivates after ~1 week idle (that's what caused this whole saga). If Field
  stays in active dev, Pro ($49/mo) removes the parking/reprovision cycle.
- **Simulator:** Field Command built + installed on iPhone 17 (iOS 26.x),
  running via `npx expo run:ios` (Metro on :8081).

## Build / run quick ref
```
cd ~/field-command && npx expo run:ios     # native build + launch
Cmd+R in simulator                          # JS hot reload
```
