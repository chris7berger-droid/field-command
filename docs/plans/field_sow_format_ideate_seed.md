# Field SOW Screen — Ideate Seed

**Purpose:** Seed for an **ideate** session (opus 4.8, xhigh) on the format of Field Command's **Field SOW tab**. Content/data now flows correctly Sales → Schedule → Field; what's left is the *presentation* — and, importantly, the *data that has to flow to support it*.

**Created:** 2026-08-26, from the session that got Field Command syncing again.
**Repo/branch this lives on:** `field-command`, branch `fix/powersync-connect-on-restored-session`.
**Spine to read first:** `command-suite-db/docs/MASTER_SCHEDULE.md` (the cross-app SOW/material-flow schedule).

---

## Status: what works now
End-to-end pipeline is proven. Test job **#10257 "TEST Field SOW flow through and format"** (Washoe Painting, `call_log` id 3855, stage In Progress) syncs to Field with correct content:
- 4 real dated days (Mon Aug 31 → Thu Sep 3)
- Task **Patching**, tagged **Urethane Cement**, target 100%
- 2 crew / 16 hrs, production target 1,200 SQ FT

So the ideate is **not** about fixing data flow. It's about the screen format + the richer data the target format needs.

---

## TARGET (the mockup Chris shared — described, since the image won't carry over)
A single day's SOW card, richer than what's built today:

- **Horizontal day selector** (chevrons ‹ ›): each pill shows weekday + date **and** a DAY label — e.g. `MON / AUG 31 / DAY 1`, `TUE / SEP 1 / DAY 2`, `WED / SEP 2 / DAY 3`, `THU / SEP 3 / DAY 4-5`, `FRI / SEP 4 / DAY 6-7`. Note the **multi-day labels** (DAY 4-5, DAY 6-7) — one calendar day can represent a *range* of plan-days.
- **Day header:** `DAY 1 OF 7` + `MON, AUG 31`, with a `1 TASK` count badge top-right.
- **Meta row (icons):** `2 CREW · 16 HRS · 1,200 SQ FT · WTC 1` — includes **per-day SQ FT** and a **WTC label**.
- **TODAY'S WORK** section: numbered tasks (black circle `1`) — `PATCH FLOOR & JOINTS`, `TARGET: 100%`.
- **INSTRUCTIONS** section: a callout with a left teal accent bar, free-text — e.g. *"Use Terrco and hand grinders to prep the concrete in all 9 rooms and 1 bathroom. Averaging 120 Sqft per room. Use 14/15 and Cabosil to patch in all joints, cracks and holes."*
- **MATERIALS** section: a **table** — columns MATERIAL / QTY / DETAILS, each row with a **checkbox**. e.g. `☐ 14/15 + Cabosil | 1 kit (3 gallon) | Mix time: 3 min, Mix speed: Medium`.
- Light/parchment theme, teal accents, Barlow Condensed headers, left teal accent bar on the day card.

## CURRENT (what Field renders today — `src/screens/tabs/TasksTab.js`)
- Day pills show **date only** (no DAY N, no multi-day range label).
- Day header `MON, AUG 31`; badges `2 crew` `16.0 hrs` (dark pills). No `DAY X OF Y`, no task-count badge.
- `PLANNED TASKS`: one card — task name + work-type tag + `TARGET 100%` + a progress bar.
- Big `PRODUCTION TARGET — 1,200 SQFT` card.
- **No** instructions, **no** materials table, **no** numbered tasks, **no** per-day SQ FT / WTC in a meta row.

---

## The data we actually have (drives the gap analysis)
Field reads **`job_wtcs.field_sow`** (canonical) joined via `jobs.call_log_id`; legacy fallback is `jobs.field_sow`. `field_sow` is a JSON array of **day objects**. Confirmed fields per day for 10257:
- `date`, `day_label` ("Day 1"…), `crew_count`, `hours_planned`
- `tasks[]` — each has `description`, `work_type_name`, and a target % (shown in UI)
- `materials[]` — present in the shape, but **empty for 10257**; on an older job (10044) materials carried only a name + qty (1), **no** unit/mix-time/mix-speed/details.

## GAPS (target needs → data doesn't have yet) — the heart of the ideate
1. **Instructions text** — mockup has a rich INSTRUCTIONS block; no such field in `field_sow` today. Where authored (Sales SOW builder?), where stored, how it flows.
2. **Rich materials** — mockup wants qty **+ unit** ("3 gallon"), **mix time**, **mix speed**, **details**, plus a crew check-off. Current material rows are name + qty only.
3. **Multi-day grouping / ranges** — mockup's `DAY 4-5`, `DAY 6-7`, and `DAY 1 OF 7`. Field has `mergeDaysByDate`/`buildMergedDay` (calendar-date merge), but the *range* labeling and "of N" total is different — reconcile.
4. **Per-day SQ FT + WTC label** in the meta row.
5. **Task-count badge** (`1 TASK`) and **numbered task list**.
6. Materials **check-off** state — is it per-crew, per-device, synced up, or display-only? (Touches the sync-up path in `connector.js`.)

## Cross-app implication (don't scope this as Field-only)
Instructions + rich materials must be **captured in Sales Command's SOW builder** and **flow through** `job_wtcs.field_sow` (or a new structure) to Field. This is a **data-contract** question, not just a Field layout question. Per the shared-data contract, each new field needs: source-of-truth (one writer), canonical location, copy-vs-reference, sync pipe (PowerSync). Contract doc: `sch-command/docs/plans/command_suite_shared_data_contract.md`.

## Parked bug (carry into the plan, not the ideate)
Sending #10257 to Schedule created **3 duplicate `jobs` rows** (job_id 96, 97, 98) for one `call_log`; only 96 got the canonical `job_wtcs` row. Identical `field_sow` on all three, so no visible drift *today*, but Field's `SELECT id FROM jobs WHERE call_log_id = ?` returns 3 rows and picks one arbitrarily — fragile. Root cause is in the Sales→Schedule handoff (likely sch-command — confirm owner).

## Pointers
- Field render: `src/screens/tabs/TasksTab.js` (see the header comment — `mergeDaysByDate`, `buildMergedDay`)
- Local schema: `src/lib/schema.js`; sync rules: `powersync-sync-rules.yaml`
- Full session writeup: `FC_HANDOFF_v8.md` (backend was dead → redeployed; PowerSync free tier tears down when idle → paid tier before real crew use)

## Suggested ideate framing
Start from the *data contract*, not the pixels: for each new element in the target (instructions, rich materials, ranges, per-day sqft/WTC), decide **what gets authored where** and **how it reaches Field**, then let the Field layout fall out of what's actually available. Keep it planning-only — no code/branches this pass.
