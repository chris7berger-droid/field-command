# Field Command — Backlog

**Single source of truth for all outstanding work.** Update on every session
that completes, defers, or discovers an item. Status values: `Open`,
`In Progress`, `Blocked`, `Done` (move Done items to the Completed Log
at the bottom and out of the active table within a session or two).

Last updated: 2026-06-16 (**Closed D1, then corrected.** The first smoke (job #10044) was a FALSE POSITIVE — it rendered the legacy `jobs.field_sow` fallback, not canonical `job_wtcs`, because `job_wtcs` was missing from BOTH the deployed dashboard sync rules and the Postgres `powersync` publication. A deliberate multi-WTC test (job #10159) exposed it. Real fix: added `- SELECT * FROM job_wtcs` to the dashboard rules + `ALTER PUBLICATION powersync ADD TABLE job_wtcs` + redeploy → device `job_wtcs` 0→2; both trades now merge on shared days (6/23 & 6/24); F2/F3 GENUINELY verified. New follow-ups **FE1** (WTC trade labeling), **B2** (crew/hours rollup), **D2** (publication migration). **B1** still top bug. Prior: 2026-06-16 amended D1 re: stale credential; 2026-06-14 filed D1; 2026-05-27 initial file with **B1**.)

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
| B1  | T2   | Open   | Redeploy `upload-photo` edge fn — R2 public URL fix is committed but not deployed | Cross-repo deploy audit 2026-05-27 (from sales-command session) | **Deployed `upload-photo` is at v8 from 2026-04-10 (pre-`c379a99` commit).** Commit `c379a99` (2026-04-10 14:19 PDT) changed `public_url` from `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}` to `https://pub-3b94ed6350b94427ac753fe3564cfb37.r2.dev/${key}` — but deploy timestamp `2026-04-10 20:42 UTC` (= 13:42 PDT) is BEFORE that commit. So the live function returns the cloudflarestorage URL, which requires authenticated access; the r2.dev subdomain is the public read URL. Symptom-when-it-matters: photos upload fine, but the returned `public_url` won't load when anyone tries to view the photo. No live impact today (FC not in production use). **Cross-repo gotcha:** function source lives in `field-command/supabase/functions/upload-photo/index.ts` but deploys to sales-command's Supabase project (`pbgvgjjuhnpsumnowuym`) — see memory `project_shared_supabase_project.md`. **Deploy:** `cd ~/field-command && supabase functions deploy upload-photo --project-ref pbgvgjjuhnpsumnowuym --no-verify-jwt`. **Smoke:** upload a test photo via app (or POST a test payload), then verify the returned `public_url` loads in a browser without auth. Honor [[feedback_edge_fn_post_deploy_smoke]] — deploy exit 0 ≠ working. |
| B2  | T2   | Open   | Decide crew/hours rollup on merged multi-WTC days (MAX vs SUM) | D1 multi-WTC smoke 2026-06-16 | `mergeDaysByDate` in `src/screens/tabs/TasksTab.js` (`buildMergedDay`) currently rolls a merged day up as **crew = MAX** across the work types and **hours = SUM** — which is internally inconsistent (if it's one shared 2-person crew, hours can't be 32 in a 16h day; if it's two crews = 4 people, crew should be 4). The code itself flags this "⚠ PENDING JONAH confirmation (MAX vs SUM)". Real example surfaced: job #10159, 6/23 = `100% Solids Epoxy` (2 crew, 16h) + `Caulking` (2 crew, 16h) → renders crew 2 / 32h. **Decision needed from Jonah:** do same-day work types share one crew, or are they distinct crews (additive)? Then make crew + hours consistent (both MAX or both SUM, or a per-task breakdown). Per-task `work_type_name` is already on every task, so either model is computable. |

### Features

| ID  | Tier | Status | Item | Source | Notes |
|-----|------|--------|------|--------|-------|
| FE1 | T2   | Open   | Field SOW tab: label which WTC/trade each task belongs to on merged days | D1 multi-WTC smoke 2026-06-16 | When two+ WTCs land work on the same calendar date, `mergeDaysByDate` concatenates their tasks into one flat "PLANNED TASKS" list with **no trade attribution** — crew can't tell `100% Solids Epoxy` work from `Caulking` work (verified live on job #10159, 6/23). Data is ready: every merged task already carries `work_type_name` (`buildMergedDay` tags it). **Design direction (discussed 2026-06-16, not yet built):** Option A — group tasks under small work-type sub-headers within the existing day tab (recommended; preserves the day-centric mental model, scales to N trades); optionally Option B — a compact per-task trade badge/pill. Avoid Option C (per-WTC swipe carousel) — adds a second nav axis, crew could miss a trade. Build in a dedicated design/build session (design conversations stay planning-only). |

### Refactor

(none filed yet)

### Cleanup / Ops

| ID  | Tier | Status | Item | Source | Notes |
|-----|------|--------|------|--------|-------|
| D2  | T2   | Open   | Capture `job_wtcs` publication add as a migration | D1 fix 2026-06-16 | The fix for D1 required `ALTER PUBLICATION powersync ADD TABLE job_wtcs;`, run live in the Supabase SQL editor (shared project `pbgvgjjuhnpsumnowuym`) — but it is **not yet in a migration file**, so it's not reproducible / not in the ledger. Write a guarded, re-runnable migration (`ALTER PUBLICATION ... ADD TABLE job_wtcs` with existence check) and record it per the migration discipline (`npm run db:push` wrapper + collision check; see CLAUDE.md). The matching sync-rule line (`- SELECT * FROM job_wtcs`) is already committed in `powersync-sync-rules.yaml` and now deployed on the single PowerSync instance. NOTE: there is ONE PowerSync instance + ONE shared DB, so this fix is already live everywhere — D2 is purely about reproducibility/record. |

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
| D1  | T2   | 2026-06-16 | Deploy `job_wtcs` PowerSync sync-rule + run F2/F3 SOW smoke | Activated the Field SOW vertical end-to-end and smoke-verified on the iOS simulator. PowerSync wouldn't connect — cleared through four stacked infra layers: (1) Supabase moved the direct connection to **IPv6-only** while the instance was parked → enabled the **Dedicated IPv4 add-on** (~$4/mo, `52.8.157.147`); (2) the stored `postgres` password was stale (the earlier sheet value was pre-reset) → **reset the DB password** in Supabase and updated PowerSync + the password sheet; (3) network restrictions confirmed open (all IPs); (4) the replication **worker stayed wedged** on a failed route (Test Connection passed + endpoint reachable externally 14/14, but the worker got persistent `ECONNREFUSED`) → **deprovisioned + redeployed the instance** (full reprovision), which got a fresh worker with a working route. Then the SOW path itself. A first smoke on #10044 *appeared* to pass but was a **FALSE POSITIVE** — it rendered the legacy `jobs.field_sow` fallback, because `job_wtcs` was actually **missing from the deployed dashboard sync rules** (the draft was dropped during the deprovision churn) **and from the `powersync` publication**. A deliberate multi-WTC test (job #10159 "ZZ TEST — SOW SMOKE", two WTCs both working 6/23 **and** 6/24) exposed it: the device's local PowerSync SQLite showed `job_wtcs` count = 0 while everything else synced. **Real fix (both required):** added `- SELECT * FROM job_wtcs` to the dashboard sync rules + ran `ALTER PUBLICATION powersync ADD TABLE job_wtcs` in the Supabase SQL editor + redeployed sync rules → device `job_wtcs` 0→2. **NOW genuinely verified:** both trades (`100% Solids Epoxy` + `Caulking`) merge onto the shared 6/23 and 6/24 days via `mergeDaysByDate`, reading canonical `job_wtcs` (F2 + F3 truly proven, confirmed by device DB read + on-screen). Artifacts: `docs/handoffs/assets/fc_d1_sow_smoke_20260616.png` (the earlier *fallback* render) + `fc_d1_sow_merge_20260616.png`. Full chain: `FC_HANDOFF_v6.md`. **Spawned follow-ups:** FE1 (WTC trade labeling on merged days), B2 (crew/hours rollup MAX-vs-SUM), D2 (capture the publication add as a migration). Also still open: B1; `CLAUDE.md` PowerSync section stale (lists 5 tables / "edition 3"; deployed rules now sync ~9 incl. `job_wtcs`). |
