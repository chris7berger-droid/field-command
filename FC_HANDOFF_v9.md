# Field Command — Handoff v9

**Date:** 2026-08-26
**Branch:** `main` (all work merged + pushed)
**Session goal:** See the rebuilt Field SOW render in the Field app end-to-end, then scope the remaining formatting work.

---

## SESSION SUMMARY

Two arcs this session. **First**, we got Field Command syncing again after it had been dead: the PowerSync cloud instance (free tier) had been torn down when idle, its URL stopped resolving, and the app was frozen on stale data showing "Offline." Chris redeployed the instance; we re-pointed its database connection (the password auth was failing) and redeployed sync rules; and a code fix was landed so the app connects on a *restored* session, not only on fresh login. After a clean reinstall + login, the test job synced and rendered correct content end-to-end (Sales → Schedule → Field). **Second**, we scoped the remaining work: the Field SOW *content* is right, but the *format* doesn't match the layout Chris wants. He shared an approved mockup. An initial seed doc over-scoped this as a data-contract rebuild; we corrected it — the instructions and rich materials the mockup shows are **already captured upstream and already synced into Field** (verified in the DB), so the remaining work is a **Field-only visual/render pass**, not a rebuild. The seed doc was rewritten to that tight scope. Nothing about the visual pass is built yet.

---

## CHANGES SHIPPED

All on `main`, pushed to origin.

- **a817867 — Fix: connect PowerSync on restored session, not just fresh login**
  `App.js` only called `connectPowerSync()` in `handleLogin` (fresh login). On a normal relaunch with a saved session, it rendered the signed-in UI but never connected the sync engine → permanent "Offline" on every reopen (would break sync for every crew device). Now connects whenever the DB is ready AND a session exists, guarded to run once; resets the guard on sign-out. Also added FC_HANDOFF_v8.

- **cb9880a — Add Field SOW format ideate seed** (original)
  First cut of the seed doc. **Superseded** — it wrongly framed the work as a data-contract rebuild.

- **f24ccdc — Update handoff v8**
  Amended v8 to record that Field now syncs and content is verified; only formatting remained open.

- **c176d1b — Rewrite Field SOW seed: scoped to Field-only visual pass**
  Corrected the seed. The instructions (`scope_notes`) and rich materials (`kit_size`, `mix_time`, `mix_speed`, etc.) ARE already in `job_wtcs.field_sow`. New doc is a render-only spec with an exact field-mapping table, out-of-scope guardrails, and an empty-state rule.

---

## INFRA CHANGED (PowerSync dashboard — done by Chris, not code)

- PowerSync instance **redeployed** — came back at the same URL (`69d81f100e377e689729db98.powersync.journeyapps.com`), so no code URL change needed.
- **Database Connection** re-fixed — was "password authentication failed for user postgres"; correct password entered → "Connection Successful."
- **Sync Rules** redeployed (9 tables; `powersync-sync-rules.yaml`); error cleared; deploy provisioned.

---

## DECISIONS / CHOICES MADE

- **Scope correction: visual pass, NOT a rebuild.** The biggest call. The first seed sent a parallel ideate terminal toward rebuilding the SOW pipeline from scratch. Chris flagged the over-engineering. We verified the mockup's data (instructions, rich materials) is already synced into Field, so the work is Field render-layer only. This is now pinned in the rewritten seed's OUT-OF-SCOPE section. **Why it matters:** prevents a from-scratch rebuild of a pipeline that already works.
- **Field mapping is the anchor:** INSTRUCTIONS = `scope_notes`; MATERIALS details = `materials[].kit_size / qty_planned / mix_time / mix_speed`; meta row = `sq_ft`, `mobilization_seq` (WTC), `crew_count`, `hours_planned`; tasks = `description` + `pct_complete`. All already in `job_wtcs.field_sow`.
- **Merged the fix to main** (not held on the branch): the connect fix is proven in-app and is a real crew-device bug, so it belongs on trunk. Chris approved.
- **PowerSync paid tier is a real future line item** — the free instance tears down when idle; fine for testing, not for daily crew use. Deferred decision.

---

## VERIFICATION

- **Sync + content: verified live in the simulator.** Test job #10257 ("TEST Field SOW flow through and format," Washoe Painting) synced and rendered correct content: dated days Aug 31–Sep 3, task "Patching" tagged Urethane Cement, 2 crew / 16 hrs, 1,200 SQ FT. "Synced" badge confirmed.
- **The connect fix: verified** by clean reinstall + login → app connected (was "Offline").
- **NOT tested / not built:** the SOW visual/format pass. No render code has changed yet — the mockup layout is spec only.

---

## NOT TOUCHED THIS SESSION

- **Field SOW visual pass** — spec'd, not built (this is next session's main work).
- **Duplicate `jobs` rows bug** — sending #10257 to Schedule created 3 `jobs` rows (96/97/98) for one `call_log`; only 96 got the canonical `job_wtcs`. Field's `SELECT id FROM jobs WHERE call_log_id = ?` picks one arbitrarily. Owner likely sch-command. Parked.
- **Per-crew sync filtering** — Field still shows all active-stage jobs to everyone (single `all_data` bucket, no crew filter). Known TODO, not this work.

---

## NEXT SESSION POINTERS

1. **Pre-flight: confirm the PowerSync instance is alive** before assuming sync works — the free instance can idle out. Quick check: `curl -s -o /dev/null -w "%{http_code}\n" https://69d81f100e377e689729db98.powersync.journeyapps.com` (a response ≠ NXDOMAIN means it's up). If dead, redeploy in the dashboard.
2. **Build the Field SOW visual pass** per `docs/plans/field_sow_format_ideate_seed.md` — render-only, in `src/screens/tabs/TasksTab.js`, Field palette from `tokens.js`. Keep it light; honor the OUT-OF-SCOPE list.
3. Verify in the sim against test job #10257 (has `scope_notes` + `sq_ft`); use jobs 92/95 to test the materials table (they have populated `materials[]`).

---

## FILES TO PROBABLY KNOW ABOUT NEXT SESSION

- `docs/plans/field_sow_format_ideate_seed.md` — the scoped visual-pass spec + field mapping (start here).
- `src/screens/tabs/TasksTab.js` — the Field SOW render target; day-merge logic lives here.
- `src/lib/tokens.js` — brand palette to skin against.
- `App.js` — the connect-on-restored-session fix (a817867).
- `FC_HANDOFF_v8.md` — full narrative of the sync-fix arc.

---

## GIT STATE ON CLOSE

- Branch: `main`, clean working tree.
- `origin/main` tip: `c176d1b` (this handoff will be the next commit).
- 0 ahead / 0 behind before this handoff commit.
- No open feature branches (fix branch merged + deleted; stale `feat/sow-vertical` and `retire/migration-consolidation` deleted this session).

---

## END STATE

Field syncs and renders correct content; sync fix merged + pushed to main; the SOW **visual pass** is scoped and ready to build next session. Nothing blocked.
