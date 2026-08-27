/**
 * PowerSync Schema for Field Command
 *
 * Read-only tables (sync down from Supabase, never written locally):
 *   - call_log        — mobilized jobs
 *   - proposal_wtc    — WTC data including field_sow
 *   - team_members    — crew roster
 *   - job_crew        — crew-to-job assignments (drives per-user sync filtering)
 *
 * Read-write tables (written locally, synced up to Supabase):
 *   - time_punches          — clock in/out, lunch, drive time
 *   - daily_production_reports — end-of-shift submission by job lead
 *
 * Column types here must match the actual Supabase schema.
 */
import { column, Schema, Table } from '@powersync/react-native';

// ── Read-Only Tables (sync down) ───────────────────────────────────

const call_log = new Table({
  job_name:           column.text,
  job_number:         column.integer,
  display_job_number: column.text,
  date:               column.text,
  stage:              column.text,
  sales_name:         column.text,
  bid_due:            column.text,
  follow_up:          column.text,
  customer_id:        column.text,
  customer_name:      column.text,
  customer_type:      column.text,
  notes:              column.text,

  // Change order
  is_change_order:    column.integer, // boolean → 0/1 in SQLite
  parent_job_id:      column.integer,
  co_number:          column.integer,
  co_standalone:      column.integer, // boolean

  // Jobsite address
  jobsite_address:    column.text,
  jobsite_city:       column.text,
  jobsite_state:      column.text,
  jobsite_zip:        column.text,

  // Billing address
  billing_address:    column.text,
  billing_city:       column.text,
  billing_state:      column.text,
  billing_zip:        column.text,
  billing_address_same: column.integer, // boolean

  // QB
  qb_customer_id:     column.text,

  // Geofence
  jobsite_latitude:   column.real,
  jobsite_longitude:  column.real,
  geofence_radius:    column.integer,

  // Prevailing wage (denormalized from proposal_wtc)
  prevailing_wage:    column.integer, // boolean

  // Flags
  new_site_build:     column.integer, // boolean
  show_cents:         column.integer, // boolean
  archived:           column.integer, // boolean

  created_at:         column.text,
});

const proposal_wtc = new Table({
  proposal_id:        column.text,
  work_type_id:       column.integer,

  // Field SOW — stored as JSONB in Postgres, text in SQLite
  field_sow:          column.text,

  // Production targets
  size:               column.real,
  unit:               column.text,
  crew_count:         column.integer,
  daily_hours:        column.real,
  start_date:         column.text,
  end_date:           column.text,

  // Materials — JSONB
  materials:          column.text,
  sub_areas:          column.text,

  // Financial
  burden_rate:        column.real,
  ot_burden_rate:     column.real,
  prevailing_wage:    column.integer, // boolean
  pw_rate:            column.real,
  pw_ot_rate:         column.real,
  regular_hours:      column.real,
  ot_hours:           column.real,
  markup_pct:         column.real,
  discount:           column.real,
  discount_reason:    column.text,
  tax_rate:           column.real,

  // Travel — JSONB
  travel:             column.text,

  // SOW
  sales_sow:          column.text,

  // Lock / sign
  locked:             column.integer, // boolean
  signer_name:        column.text,
  signed_at:          column.text,
  job_walk_type:      column.text,

  created_at:         column.text,
  updated_at:         column.text,
});

const team_members = new Table({
  name:               column.text,
  email:              column.text,
  role:               column.text,
  phone:              column.text,
  active:             column.integer, // boolean
  auth_id:            column.text,
  onboarded:          column.integer, // boolean
  apps:               column.text,    // JSONB
  created_at:         column.text,
});

const job_crew = new Table({
  job_id:             column.integer,
  team_member_id:     column.text,
  role:               column.text,
  created_at:         column.text,
});

const jobs = new Table({
  job_num:            column.text,
  job_name:           column.text,
  start_date:         column.text,
  end_date:           column.text,
  status:             column.text,
  crew_needed:        column.integer,
  work_type:          column.text,
  lead:               column.text,
  vehicle:            column.text,
  equipment:          column.text,
  power_source:       column.text,
  amount:             column.real,
  prevailing_wage:    column.text,
  notes:              column.text,
  sow:                column.text,
  call_log_id:        column.integer,
  field_sow:          column.text, // JSONB → text in SQLite
  source_proposal_id: column.text,
  source_call_log_id: column.integer,
  size:               column.real,
  size_unit:          column.text,
  scheduled_start:    column.text,
  scheduled_end:      column.text,
  deleted:            column.text,
  deleted_at:         column.text,
});

// job_wtcs — per-WTC dated SOW rows for a job (canonical, replaces the
// proposal_wtc fallback read). One row per WTC sent to Schedule. Read-only;
// synced via the all_data bucket (SELECT * FROM job_wtcs). PowerSync id is the
// implicit uuid PK. job_id is declared integer so TasksTab can query
// WHERE job_id = (SELECT id FROM jobs WHERE call_log_id = ?) — job_wtcs.job_id
// (int8) equals the Field-local jobs.id (jobs syncs `job_id AS id`). See plan
// §F1/§F2. start_date/end_date are nullable upstream ("dates TBD", §6.6).
const job_wtcs = new Table({
  job_id:             column.integer,
  proposal_wtc_id:    column.text,
  work_type_id:       column.integer,
  work_type_name:     column.text,
  position:           column.integer,
  field_sow:          column.text, // JSONB → text in SQLite
  material_status:    column.text,
  start_date:         column.text,
  end_date:           column.text,
  created_at:         column.text,
});

// ── Read-Write Tables (sync up) ────────────────────────────────────

const time_punches = new Table(
  {
    job_id:             column.integer,
    employee_id:        column.text,

    // Punch data
    punch_type:         column.text,
    punch_time:         column.text,
    punch_date:         column.text,

    // GPS
    latitude:           column.real,
    longitude:          column.real,
    on_site:            column.integer, // boolean
    gps_override:       column.integer, // boolean

    // Weather
    weather_temp:       column.real,
    weather_condition:  column.text,

    // Computed (filled on clock_out)
    hours_regular:      column.real,
    hours_ot:           column.real,
    hours_drive:        column.real,

    // Sync
    synced:             column.integer, // boolean
    created_at:         column.text,
  },
  { indexes: { by_job_date: ['job_id', 'punch_date'] } }
);

const daily_production_reports = new Table(
  {
    job_id:             column.integer,
    wtc_id:             column.text,

    report_date:        column.text,
    submitted_by:       column.text,

    // Tasks — JSONB
    tasks:              column.text,

    // Materials — JSONB
    materials_used:     column.text,

    // Hours
    hours_regular:      column.real,
    hours_ot:           column.real,

    // Photos — JSONB
    photos:             column.text,

    // Notes
    notes:              column.text,

    // Status
    status:             column.text,
    approved_by:        column.text,
    approved_at:        column.text,

    // Sync
    synced:             column.integer, // boolean
    created_at:         column.text,
  },
  { indexes: { by_job_date: ['job_id', 'report_date'] } }
);

const daily_log_entries = new Table(
  {
    job_id:             column.integer,
    employee_id:        column.text,

    // Type: SOD, MOD, EOD, or OTHER
    entry_type:         column.text,

    // Photos — JSONB array of URLs
    photos:             column.text,

    // Notes — required
    notes:              column.text,

    // Sync
    synced:             column.integer, // boolean
    created_at:         column.text,
  },
  { indexes: { by_job_date: ['job_id', 'created_at'] } }
);

// job_material_checks — crew "material loaded in truck" confirmations.
// Written locally by the crew, synced up. tenant_id is filled by the DB default
// (get_user_tenant_id()) on insert — omitted here like the other writable tables.
const job_material_checks = new Table(
  {
    job_id:             column.integer, // call_log.id
    wtc_material_id:    column.text,    // stable material id from job_wtcs.field_sow
    check_date:         column.text,    // the SOW day this material belongs to
    material_name:      column.text,    // denormalized for office display
    checked:            column.integer, // boolean
    checked_by:         column.text,    // team_members.id
    checked_by_name:    column.text,    // denormalized crew name
    created_at:         column.text,
    updated_at:         column.text,
  },
  { indexes: { by_job: ['job_id'], by_material: ['wtc_material_id'] } }
);

// ── Export Schema ──────────────────────────────────────────────────

export const AppSchema = new Schema({
  call_log,
  proposal_wtc,
  team_members,
  job_crew,
  jobs,
  job_wtcs,
  time_punches,
  daily_production_reports,
  daily_log_entries,
  job_material_checks,
});
