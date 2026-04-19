FC_HANDOFF_v1 — April 18, 2026
Session: Report tab rebuild (PRT + Daily Log), Field SOW tab, status bar alerts, background photo uploads

===============================================================================
WHAT WAS DONE
===============================================================================

1. Tab Rename: Tasks -> Field SOW (COMMITTED)
   - Renamed "TASKS" tab to "FIELD SOW" in JobDetailScreen
   - Section header changed to "PLANNED TASKS"
   - Percentage badge now reads "TARGET 20%" instead of just "20%"
   - File: src/screens/JobDetailScreen.js, src/screens/tabs/TasksTab.js

2. Material Specs Expandable (COMMITTED)
   - Material rows on Field SOW tab are now tappable
   - Expands to show: mils, coverage rate, mix time, mix speed, cure time
   - Data comes from Field SOW built in Sales Command WTC
   - File: src/screens/tabs/TasksTab.js

3. Today's Hours — Moved to Time Clock (COMMITTED)
   - Moved "TODAY'S HOURS" card from Report tab to Time Clock tab
   - Changed display from decimal hours (0.3) to hours+minutes (20m, 2h 15m)
   - Live updates every second while shift is active
   - File: src/screens/tabs/TimeClockTab.js, src/screens/tabs/ReportTab.js

4. Report Tab — Full Rebuild (COMMITTED)
   Split into two sections with toggle:

   a) PRT (Production Rate Tracker)
      - Tied to Field SOW tasks from Sales Command
      - Crew enters daily % per task, compared to planned target %
      - Visual: progress bar (target vs actual), ON TRACK / BEHIND badges
      - Notes required per task before submit
      - Hawthorne Effect: crew sees their performance vs expectations in real time
      - Save draft or submit
      - File: src/screens/tabs/ReportTab.js

   b) Daily Log
      - Three required entries: SOD (Start of Day), MOD (Mid Day), EOD (End of Day)
      - Each entry: photos + required note, submitted individually
      - "+ ADD ENTRY" for extra entries anytime during the day
      - Submitted entries display inline with timestamp and photo thumbnails
      - Status pills show which entries are done (SOD/MOD/EOD checkmarks)
      - File: src/screens/tabs/ReportTab.js

5. Background Photo Upload (COMMITTED)
   - Daily Log entries save instantly with local photo URIs (optimistic)
   - Photos upload to Cloudflare R2 in background (3 concurrent)
   - Entry patched with R2 URLs when uploads complete
   - Works offline: entry saved locally, PowerSync syncs when connected
   - Photos upload when signal returns
   - Resize: 1800px max width, 0.7 quality (good zoom detail, ~40% smaller)
   - File: src/lib/photos.js, src/screens/tabs/ReportTab.js

6. PunchStatusBar — Daily Log Alerts (COMMITTED)
   Persistent, non-dismissable alerts for Hawthorne Effect:
   - Amber "SOD LOG NEEDED" — 15 min after clock in, no SOD submitted
   - Amber "MID DAY LOG DUE" — 4 hrs on site, no MOD submitted
   - Red "EOD LOG REQUIRED" — after clock out, no EOD submitted
   - Red "PRT NOT SUBMITTED" — after clock out, no PRT submitted
   - Alerts stack below status bar, pulse animation, visible on all tabs
   - Only go away when crew takes action — cannot be dismissed
   - File: src/components/PunchStatusBar.js

7. New Database Table: daily_log_entries (COMMITTED)
   - Created in Supabase via SQL Editor
   - Added to PowerSync schema + sync rules
   - Publication added: ALTER PUBLICATION powersync ADD TABLE daily_log_entries
   - PowerSync sync rules deployed
   - Columns: id, job_id, employee_id, entry_type, photos (JSONB), notes, synced, created_at
   - File: src/lib/schema.js, powersync-sync-rules.yaml

===============================================================================
DATABASE CHANGES
===============================================================================

Table created (via Supabase SQL Editor):
  CREATE TABLE daily_log_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id bigint REFERENCES call_log(id),
    employee_id text,
    entry_type text NOT NULL,
    photos jsonb DEFAULT '[]',
    notes text NOT NULL,
    synced smallint DEFAULT 0,
    created_at timestamptz DEFAULT now()
  );

  ALTER PUBLICATION powersync ADD TABLE "public"."daily_log_entries";

PowerSync sync rules updated and deployed (edition 4).

===============================================================================
KNOWN ISSUES
===============================================================================

- Photo upload failures in background are logged but not surfaced to user
  (local URIs remain in entry — need retry mechanism)
- Daily Log queries use created_at >= today, not per-job filtering for alerts
  (works for now with single-job usage, needs refinement for multi-job days)

===============================================================================
WHAT WAS NOT DONE
===============================================================================

- Did not test DPR flow back to Schedule Command
- Did not build photo viewer / zoom-in for Daily Log photos
- Did not build manager approval queue for PRT submissions
- Did not test full offline -> reconnect photo upload cycle
- Did not push to GitHub yet (doing now)

===============================================================================
NEXT SESSION — PRIORITIES
===============================================================================

1. Test PRT submission end-to-end (submit on Field, view on Schedule Command)
2. Test Daily Log photo uploads end-to-end (R2 storage verification)
3. Build photo gallery with zoom for Daily Log entries
4. Build retry mechanism for failed background photo uploads
5. Test full offline scenario: no signal -> submit logs -> reconnect -> verify sync
6. Build DPR/PRT approval queue in Schedule Command

===============================================================================
FILES CHANGED (field-command repo)
===============================================================================

src/screens/JobDetailScreen.js    — Tab rename: Tasks -> Field SOW
src/screens/tabs/TasksTab.js      — Planned Tasks header, TARGET badge, expandable materials
src/screens/tabs/TimeClockTab.js  — Today's Hours card (h/m format), moved from Report
src/screens/tabs/ReportTab.js     — Full rebuild: PRT + Daily Log sections
src/components/PunchStatusBar.js  — Daily log alerts (SOD/MOD/EOD/PRT)
src/lib/schema.js                 — daily_log_entries table added
src/lib/photos.js                 — 1800px resize, 0.7 quality, parallel uploads
powersync-sync-rules.yaml         — daily_log_entries sync rule added

===============================================================================
BUILD / RUN (quick reference)
===============================================================================

Field Command:  cd ~/field-command && npx expo run:ios
                Cmd+R in simulator for JS-only hot reload
Schedule:       cd ~/sch-command && npm run dev        (localhost:5173)
Sales:          cd ~/sales-command && npm run dev       (localhost:5174)
