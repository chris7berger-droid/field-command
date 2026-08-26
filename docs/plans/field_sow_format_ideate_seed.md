# Field SOW Screen — Visual Pass Spec

**Scope:** A **Field-only visual/render pass** on the Field SOW tab (`src/screens/tabs/TasksTab.js`). Re-skin the screen to the target mockup layout, in Field Command's real palette, and wire it to read fields **that are already synced into Field**. Nothing else.

> **This supersedes the earlier "data-contract rebuild" framing of this doc, which was wrong.**
> The instructions and rich material details ARE captured upstream (Sales + Schedule) and DO
> reach Field — verified in `job_wtcs.field_sow` on 2026-08-26. The Field screen simply isn't
> rendering them yet. This is a render-layer change, not a rebuild.

## OUT OF SCOPE (do NOT do)
- No changes to Sales Command or Schedule Command.
- No new database fields, no data-contract work, no migrations.
- No rebuild of the sync layer or the day-merge logic (`mergeDaysByDate` / `buildMergedDay` stay as-is — just render what they already produce).
- Don't chase the duplicate-`jobs`-rows bug here (parked separately — see bottom).

## Target layout (the mockup Chris approved)
A single day's card:
- **Day header:** `DAY 1 OF 7` + `MON, AUG 31`, with a `1 TASK` count badge top-right.
- **Meta row (icons, one line):** `2 CREW · 16 HRS · 1,200 SQ FT · WTC 1`.
- **TODAY'S WORK:** numbered task rows (circled `1`) — task name (bold) + `TARGET: 100%`.
- **INSTRUCTIONS:** a callout card with a left teal accent bar, free text.
- **MATERIALS:** a table — columns MATERIAL / QTY / DETAILS, each row with a check-off box.
- Keep the existing horizontal **day selector** at top (the merged-day pills). Restyling those to the mockup's pill style is optional polish, not core.

## Brand palette — the one real fix vs the mockup
Use Field's tokens (`src/lib/tokens.js`), NOT the mockup's teal-on-white:
- Background: linen `#b5a896` (base), `#c8bcaa` (cards); dark blocks `#1c1814`.
- Accent: teal `#30cfac` — **only on dark backgrounds** (section bullets, accent bar, key numbers).
- Headings: Barlow Condensed (bold, uppercase, tracked); body: Barlow.
- No white backgrounds. The pay-app screens are the palette gold standard to match.

## Field mapping — every element already exists in `job_wtcs.field_sow`
Each day object in `field_sow` (what Field syncs) carries:

| Mockup element        | Field in `field_sow` day object                          |
|-----------------------|----------------------------------------------------------|
| INSTRUCTIONS text     | `scope_notes`                                            |
| Task name             | `tasks[].description`                                    |
| TARGET %              | `tasks[].pct_complete`                                   |
| `N TASK` badge count  | `tasks.length`                                           |
| Crew                  | `crew_count`                                             |
| Hrs                   | `hours_planned`                                          |
| SQ FT (per day)       | `sq_ft`                                                  |
| WTC N                 | `mobilization_seq`                                       |
| Day label / DATE      | `day_label`, `date`                                     |
| MATERIAL name         | `materials[].name`                                      |
| QTY                   | `materials[].qty_planned` + `materials[].kit_size` (unit, e.g. "3 gallon") |
| DETAILS               | `materials[].mix_time`, `materials[].mix_speed` (and `cure_time`, `coverage_rate`, `mils` if wanted) |

## Empty-state rule
Render each section **only when its data is present**. Some days legitimately have no materials (`materials: []`) or no `scope_notes` — hide that section rather than showing an empty shell. (Example: 10257 Day 1 has `scope_notes` but an empty `materials` array.)

## Verify against
Test job **#10257** (`job_wtcs.job_id` 96) has real `scope_notes`, `sq_ft` 1200, `mobilization_seq` 1, and tasks with `pct_complete`. Jobs 92 / 95 have populated `materials[]` (name, kit_size, qty_planned, cure_time) to test the materials table. Build in the browser/sim and eyeball against the mockup + Field palette.

## Pointers
- Render target: `src/screens/tabs/TasksTab.js` (day-merge logic + current render live here)
- Palette/tokens: `src/lib/tokens.js`
- Session context: `FC_HANDOFF_v8.md`

## Parked (not this task)
- Duplicate `jobs` rows (96/97/98) for one `call_log` from the Sales→Schedule handoff — Field's `SELECT id FROM jobs WHERE call_log_id = ?` picks one arbitrarily. Owner likely sch-command.
- PowerSync paid tier before real crew use (free instance tears down when idle).
