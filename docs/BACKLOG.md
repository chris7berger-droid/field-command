# Field Command — Backlog

**Single source of truth for all outstanding work.** Update on every session
that completes, defers, or discovers an item. Status values: `Open`,
`In Progress`, `Blocked`, `Done` (move Done items to the Completed Log
at the bottom and out of the active table within a session or two).

Last updated: 2026-09-13 (**FE2 live:** trip titles + trip dates on Field SOW. Load-out checks are calendar-today.)

## Tier definitions

- **T0** — Drop everything. Active prod breakage, in-flight security incident.
- **T1** — This session. High-severity-and-likely × low-cost. Quick wins on customer-facing surfaces.
- **T2** — This sprint. High strategic leverage, or unblocks T1/T2 work.
- **T3** — When convenient. Low-severity bugs, refactor, polish.
- **T4** — Only if forced. Items needing a re-trigger before they can move.

---

## Active

### Bugs

| ID  | Tier | Status | Item                                                       | Source                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|-----|------|--------|------------------------------------------------------------|-----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| B2  | T2   | Open   | Merged multi-WTC day crew/hours rollup — office-set one-crew-vs-two toggle | D1 multi-WTC smoke 2026-06-16; decision 2026-08-11 (Chris) | **DECISION (2026-08-11, Chris): the office decides, per shared day, whether same-day trades are ONE shared crew or SEPARATE crews. Default = separate/additive.** Field renders the stored answer consistently — no more MAX-crew + SUM-hours guessing. Same crew → crew = MAX, hours = MAX (e.g. 2 / 16). Separate crews → crew = SUM, hours = SUM (e.g. 4 / 32). This is now a **cross-app item, not a pure Field fix** — it grows a small upstream piece. Two build spots: (1) **upstream** — where the office sets the flag when scheduling same-day trades + where it's stored (per shared-data-contract: needs source-of-truth = office/Schedule, canonical location, copy-vs-ref, PowerSync sync-down — DESIGN-OPEN, for the plan); (2) **Field** — `mergeDaysByDate`/`buildMergedDay` in `src/screens/tabs/TasksTab.js` reads the flag and rolls up consistently (per-task `work_type_name` already present). Original symptom: job #10159, 6/23 = `100% Solids Epoxy` (2 crew, 16h) + `Caulking` (2 crew, 16h) → currently renders 2 / 32h. |

### Features

| ID  | Tier | Status | Item | Source | Notes |
|-----|------|--------|------|--------|-------|
| FE1 | T2   | Open   | Field SOW tab: label which WTC/trade each task belongs to on merged days | D1 multi-WTC smoke 2026-06-16 | When two+ WTCs land work on the same calendar date, `mergeDaysByDate` concatenates their tasks into one flat "PLANNED TASKS" list with **no trade attribution** — crew can't tell `100% Solids Epoxy` work from `Caulking` work (verified live on job #10159, 6/23). Data is ready: every merged task already carries `work_type_name` (`buildMergedDay` tags it). **Design direction (discussed 2026-06-16, not yet built):** Option A — group tasks under small work-type sub-headers within the existing day tab (recommended; preserves the day-centric mental model, scales to N trades); optionally Option B — a compact per-task trade badge/pill. Avoid Option C (per-WTC swipe carousel) — adds a second nav axis, crew could miss a trade. Build in a dedicated design/build session (design conversations stay planning-only). |
| FE3 | T2   | Open   | Office punch-time correction after a missed clock-out | Field overnight 2026-09-13 (Chris) | Crew forgot-to-clock-out now punches out immediately and flags the office. **Later:** ask the crew what time they should have punched out, match other crew members' clock-out on that job, and let the office apply the real time. Needs the office time-clock / timesheet work that is not in Field yet. Do not guess hours on the phone. |

### Refactor

(none filed yet)

### Cleanup / Ops

| ID  | Tier | Status | Item | Source | Notes |
|-----|------|--------|------|--------|-------|
(none open)

---

## How to use this file

- File new items at the bottom of the appropriate section. Match the pipe-table format used in sales-command (`sales-command/docs/BACKLOG.md`).
- Close items by changing `Status: Open` → `Status: Closed <YYYY-MM-DD>` in the same row. Once a few are closed, move them down to **Completed Log**.
- Surface dependencies as `Blocks: <ID>` / `Blocked by: <ID>` in the first line of Notes.
- Update the `Last updated:` line at top with a brief one-line description of what changed this session.

---

## Completed Log

| ID  | Tier | Closed     | Item | Resolution |
|-----|------|------------|------|------------|
| FE2 | T2   | 2026-09-13 | Sync Schedule trip titles into Field SOW (replace `WTC N`) | **LIVE.** `job_mobilizations` on the `powersync` publication (command-suite-db `20260913120000`) + dashboard rules. 10176 shows TAP / Sing. Empty Field SOW day dates fill from the trip window — not TBD if the trip is dated. Do not strip `date` off field_sow days (Send already nulls it). Load-out checks are calendar-today; TODAY pill only when a SOW/trip day is today. |
| B1  | T2   | 2026-08-11 | Redeploy `upload-photo` edge fn — R2 public URL fix | **Already deployed + smoke-verified — no redeploy needed. The 2026-05-27 audit premise was stale.** Live `upload-photo` is version 12 and its deployed source already returns the public `pub-3b94…r2.dev/${key}` URL (not the `cloudflarestorage` one), confirmed by reading the deployed function directly. Real smoke against an existing uploaded photo (job 48, 2026-04-10): `curl` with no auth → `HTTP 200`, `Content-Type: image/jpeg`, 776 KB. So the photo-viewing path other apps depend on works today. Line 86's `cloudflarestorage` endpoint is correct — that's the presigned *upload* target, not the public read URL. Honored [[feedback_edge_fn_post_deploy_smoke]]: verified the side effect, not the deploy exit code. |
| D2  | T2   | 2026-08-11 | Capture `job_wtcs` publication add as a migration | **Already done — closed as verified, no new work.** The `ALTER PUBLICATION powersync ADD TABLE job_wtcs` (run live during the D1 fix) was captured in command-suite-db as `20260715120000_powersync_publication.sql` ("MIG-3"), committed to `main` and applied 2026-07-15. It's guarded/idempotent, includes all 9 member tables, is safe on a from-scratch rebuild, and is a deliberate no-op against prod — its only job is to make the ledger describe current prod so a rebuild reproduces the publication instead of silently losing it. Confirmed applied: 14 later migrations sit on top of it on `main`. This backlog (last touched 2026-06-16) simply predated it. Sync-rules half is tracked separately in command-suite-db as MIG-9 (PowerSync dashboard, unreachable by migration). |
| D1  | T2   | 2026-06-16 | Deploy `job_wtcs` PowerSync sync-rule + run F2/F3 SOW smoke | Activated the Field SOW vertical end-to-end and smoke-verified on the iOS simulator. PowerSync wouldn't connect — cleared through four stacked infra layers: (1) Supabase moved the direct connection to **IPv6-only** while the instance was parked → enabled the **Dedicated IPv4 add-on** (~$4/mo, `52.8.157.147`); (2) the stored `postgres` password was stale (the earlier sheet value was pre-reset) → **reset the DB password** in Supabase and updated PowerSync + the password sheet; (3) network restrictions confirmed open (all IPs); (4) the replication **worker stayed wedged** on a failed route (Test Connection passed + endpoint reachable externally 14/14, but the worker got persistent `ECONNREFUSED`) → **deprovisioned + redeployed the instance** (full reprovision), which got a fresh worker with a working route. Then the SOW path itself. A first smoke on #10044 *appeared* to pass but was a **FALSE POSITIVE** — it rendered the legacy `jobs.field_sow` fallback, because `job_wtcs` was actually **missing from the deployed dashboard sync rules** (the draft was dropped during the deprovision churn) **and from the `powersync` publication**. A deliberate multi-WTC test (job #10159 "ZZ TEST — SOW SMOKE", two WTCs both working 6/23 **and** 6/24) exposed it: the device's local PowerSync SQLite showed `job_wtcs` count = 0 while everything else synced. **Real fix (both required):** added `- SELECT * FROM job_wtcs` to the dashboard sync rules + ran `ALTER PUBLICATION powersync ADD TABLE job_wtcs` in the Supabase SQL editor + redeployed sync rules → device `job_wtcs` 0→2. **NOW genuinely verified:** both trades (`100% Solids Epoxy` + `Caulking`) merge onto the shared 6/23 and 6/24 days via `mergeDaysByDate`, reading canonical `job_wtcs` (F2 + F3 truly proven, confirmed by device DB read + on-screen). Artifacts: `docs/handoffs/assets/fc_d1_sow_smoke_20260616.png` (the earlier *fallback* render) + `fc_d1_sow_merge_20260616.png`. Full chain: `FC_HANDOFF_v6.md`. **Spawned follow-ups:** FE1 (WTC trade labeling on merged days), B2 (crew/hours rollup MAX-vs-SUM), D2 (capture the publication add as a migration). Also still open: B1; `CLAUDE.md` PowerSync section stale (lists 5 tables / "edition 3"; deployed rules now sync ~9 incl. `job_wtcs`). |
