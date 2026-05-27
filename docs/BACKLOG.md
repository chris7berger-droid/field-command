# Field Command — Backlog

**Single source of truth for all outstanding work.** Update on every session
that completes, defers, or discovers an item. Status values: `Open`,
`In Progress`, `Blocked`, `Done` (move Done items to the Completed Log
at the bottom and out of the active table within a session or two).

Last updated: 2026-05-27 (Initial file. Cross-repo deploy audit from sales-command session surfaced **B1 — `upload-photo` deployed version is stale**. Field Command not yet in production use, so no live impact; filed for the next FC session.)

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

### Features

(none filed yet)

### Refactor

(none filed yet)

### Cleanup / Ops

(none filed yet)

---

## How to use this file

- File new items at the bottom of the appropriate section. Match the pipe-table format used in sales-command (`sales-command/docs/BACKLOG.md`).
- Close items by changing `Status: Open` → `Status: Closed <YYYY-MM-DD>` in the same row. Once a few are closed, move them down to **Completed Log**.
- Surface dependencies as `Blocks: <ID>` / `Blocked by: <ID>` in the first line of Notes.
- Update the `Last updated:` line at top with a brief one-line description of what changed this session.

---

## Completed Log

(empty)
