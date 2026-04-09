/**
 * PowerSync Schema for Field Command
 *
 * Read-only tables (sync down from Supabase, never written locally):
 *   - call_log        — mobilized jobs
 *   - proposal_wtc    — WTC data including field_sow (jsonb stored as text)
 *   - team_members    — crew roster
 *
 * Read-write tables (written locally, synced up to Supabase):
 *   - time_punches          — clock in/out, lunch, drive time
 *   - daily_production_reports — end-of-shift submission by job lead
 */
import { column, Schema, Table } from '@powersync/react-native';

// ── Read-Only Tables (sync down) ───────────────────────────────────

const call_log = new Table({
  // Job identification
  customer_id:      column.text,
  job_name:         column.text,
  job_number:       column.text,
  address:          column.text,
  city:             column.text,
  state:            column.text,
  zip:              column.text,

  // Geofence
  latitude:         column.real,
  longitude:        column.real,
  geofence_radius:  column.real,   // meters, default 150

  // Job status
  status:           column.text,   // mobilized / in_progress / complete
  prevailing_wage:  column.integer, // 0/1

  // Dates
  start_date:       column.text,
  end_date:         column.text,

  // Tenant
  tenant_id:        column.text,
  created_at:       column.text,
});

const proposal_wtc = new Table({
  proposal_id:      column.text,
  work_type_id:     column.text,

  // Field SOW — stored as JSON text, parsed in app
  field_sow:        column.text,

  // Production targets
  size:             column.real,
  unit:             column.text,   // SQFT / LF / EA / HR / TON / CY
  crew_count:       column.integer,
  daily_hours:      column.real,
  start_date:       column.text,
  end_date:         column.text,

  // Materials — stored as JSON text
  materials:        column.text,

  // Financial (read-only reference for % complete context)
  regular_hours:    column.real,
  ot_hours:         column.real,

  // Lock status
  locked:           column.integer, // 0/1

  tenant_id:        column.text,
  created_at:       column.text,
});

const team_members = new Table({
  name:             column.text,
  email:            column.text,
  role:             column.text,   // crew / lead / foreman / manager
  phone:            column.text,
  active:           column.integer, // 0/1
  tenant_id:        column.text,
});

// ── Read-Write Tables (sync up) ────────────────────────────────────

const time_punches = new Table(
  {
    job_id:           column.text,   // FK → call_log
    employee_id:      column.text,   // FK → team_members
    tenant_id:        column.text,

    // Punch data
    punch_type:       column.text,   // clock_in / clock_out / lunch_start / lunch_end / drive_start / drive_end
    punch_time:       column.text,   // ISO timestamp
    punch_date:       column.text,   // YYYY-MM-DD for easy grouping

    // GPS
    latitude:         column.real,
    longitude:        column.real,
    on_site:          column.integer, // 0/1 — within geofence
    gps_override:     column.integer, // 0/1 — crew acknowledged off-site

    // Weather
    weather_temp:     column.real,
    weather_condition: column.text,  // clear / rain / snow / etc.

    // Computed (filled on clock_out)
    hours_regular:    column.real,
    hours_ot:         column.real,
    hours_drive:      column.real,

    // Sync
    synced:           column.integer, // 0/1
    created_at:       column.text,
  },
  { indexes: { by_job_date: ['job_id', 'punch_date'] } }
);

const daily_production_reports = new Table(
  {
    job_id:           column.text,   // FK → call_log
    wtc_id:           column.text,   // FK → proposal_wtc
    tenant_id:        column.text,

    report_date:      column.text,   // YYYY-MM-DD
    submitted_by:     column.text,   // FK → team_members (job lead)

    // Tasks — JSON text array: [{ task, pct_complete_today, cumulative_pct, notes }]
    tasks:            column.text,

    // Materials — JSON text array: [{ name, qty_used }]
    materials_used:   column.text,

    // Hours (from time clock aggregation)
    hours_regular:    column.real,
    hours_ot:         column.real,

    // Photos — JSON text array of Supabase storage URLs
    photos:           column.text,

    // Notes (required)
    notes:            column.text,

    // Status
    status:           column.text,   // draft / submitted / approved / edited_approved
    approved_by:      column.text,   // FK → team_members (manager in Schedule Command)
    approved_at:      column.text,

    // Sync
    synced:           column.integer, // 0/1
    created_at:       column.text,
  },
  { indexes: { by_job_date: ['job_id', 'report_date'] } }
);

// ── Export Schema ──────────────────────────────────────────────────

export const AppSchema = new Schema({
  call_log,
  proposal_wtc,
  team_members,
  time_punches,
  daily_production_reports,
});
