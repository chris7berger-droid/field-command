/**
 * Crew-facing trip titles. Schedule labels live on job_mobilizations; Field
 * falls back to "Trip N" from mobilization_seq until those rows sync.
 */
import { parseJSON } from './utils';

export function tripSeq(day) {
  const seq = Number(day?.mobilization_seq);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

// Uses the Schedule label when present; otherwise "Trip N".
export function tripTitle(seq, trips) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n <= 0) return null;
  const row = (trips || []).find((t) => Number(t.seq) === n);
  const label = (row?.label || '').trim();
  return label || `Trip ${n}`;
}

// Live Schedule job — jobs.deleted is TEXT ('No'/'Yes'), not deleted_at.
export const LIVE_JOB_FILTER = `(j.deleted IS NULL OR j.deleted = 'No')`;

// Current / next trip for a job card. Multiple TBD trips are joined so TAP
// and Sing both stay visible. Dated trips pick the window that contains
// today, else the next upcoming, else the most recent.
export function tripLine(trips, today, weekStart, weekEnd) {
  if (!trips || trips.length === 0) return null;
  const named = (t) => tripTitle(t.seq, trips);

  if (weekStart && weekEnd) {
    const inWeek = trips.filter((t) => overlapsWeek(t.start_date, t.end_date, weekStart, weekEnd));
    if (inWeek.length === 1) return named(inWeek[0]);
    if (inWeek.length > 1) {
      const current = inWeek.find((t) => {
        const start = t.start_date;
        const end = t.end_date || t.start_date;
        return start && end && start <= today && today <= end;
      });
      if (current) return named(current);
      return inWeek.map(named).filter(Boolean).join(' · ');
    }
  }

  if (trips.length === 1) return named(trips[0]);

  const inWindow = trips.find((t) => {
    const start = t.start_date;
    const end = t.end_date || t.start_date;
    return start && end && start <= today && today <= end;
  });
  if (inWindow) return named(inWindow);

  const upcoming = trips
    .filter((t) => t.start_date && t.start_date > today)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0];
  if (upcoming) return named(upcoming);

  const allUndated = trips.every((t) => !t.start_date && !t.end_date);
  if (allUndated) return trips.map(named).filter(Boolean).join(' · ');

  const past = [...trips]
    .filter((t) => t.end_date || t.start_date)
    .sort((a, b) => String(b.end_date || b.start_date).localeCompare(String(a.end_date || a.start_date)))[0];
  return named(past || trips[0]);
}

// Group trip rows by call_log.id. Prefer job_mobilizations; if a live job has
// none, harvest unique mobilization_seq values from job_wtcs.field_sow.
export function tripsByCallLog(mobRows, wtcRows) {
  const map = new Map();
  for (const r of (mobRows || [])) {
    const id = String(r.call_log_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({
      seq: Number(r.seq),
      label: r.label,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
    });
  }
  const hasMobs = new Set(map.keys());
  for (const w of (wtcRows || [])) {
    const id = String(w.call_log_id);
    if (hasMobs.has(id)) continue;
    if (!map.has(id)) map.set(id, []);
    const existing = new Set(map.get(id).map((t) => t.seq));
    for (const day of parseJSON(w.field_sow, [])) {
      const seq = tripSeq(day);
      if (seq == null || existing.has(seq)) continue;
      existing.add(seq);
      map.get(id).push({
        seq,
        label: null,
        start_date: day.date || null,
        end_date: null,
      });
    }
  }
  for (const trips of map.values()) {
    trips.sort((a, b) => a.seq - b.seq);
  }
  return map;
}

// Bare job number for crew cards. call_log.display_job_number is an office
// composite ("10176 - TEST Exact Penny Pricing") — never use it as the title.
export function jobNumber(job) {
  if (job?.job_number != null && String(job.job_number).trim() !== '') {
    const n = String(job.job_number).trim();
    const co = job.is_change_order && job.co_number != null ? ` CO${job.co_number}` : '';
    return `#${n}${co}`;
  }
  const display = (job?.display_job_number || '').toString().trim();
  if (!display) return null;
  const bare = display.split(' - ')[0].replace(/^#/, '').trim();
  return bare ? `#${bare}` : null;
}

// Inclusive range overlap on YYYY-MM-DD strings. One-sided spans use the
// known side; no dates at all is not "this week" (matches Schedule Home).
export function overlapsWeek(start, end, weekStart, weekEnd) {
  if (!weekStart || !weekEnd) return false;
  if (!start && !end) return false;
  const s = start || end;
  const e = end || start;
  return s <= weekEnd && e >= weekStart;
}

export function collectSowDates(wtcRows) {
  const map = new Map();
  for (const w of (wtcRows || [])) {
    const id = String(w.call_log_id);
    if (!map.has(id)) map.set(id, []);
    for (const day of parseJSON(w.field_sow, [])) {
      if (day?.date) map.get(id).push(day.date);
    }
  }
  return map;
}

function hasWorkDates({ trips, sowDates, scheduledStart, scheduledEnd }) {
  if (scheduledStart || scheduledEnd) return true;
  if ((trips || []).some((t) => t.start_date || t.end_date)) return true;
  if ((sowDates || []).some(Boolean)) return true;
  return false;
}

// Crew-Home "active this week": trip window, Field SOW day, or live job
// scheduled span overlaps Mon–Sun. Undated jobs stay off Home (use VIEW ALL).
export function isActiveThisWeek(
  { trips, sowDates, scheduledStart, scheduledEnd },
  weekStart,
  weekEnd,
) {
  if (overlapsWeek(scheduledStart, scheduledEnd, weekStart, weekEnd)) return true;
  for (const t of (trips || [])) {
    if (overlapsWeek(t.start_date, t.end_date, weekStart, weekEnd)) return true;
  }
  for (const d of (sowDates || [])) {
    if (d && d >= weekStart && d <= weekEnd) return true;
  }
  return false;
}

// VIEW ALL: this week's jobs, plus undated live jobs so crew can punch in
// when the office has not put the job on Home yet.
export function isListedThisWeek(args, weekStart, weekEnd) {
  if (isActiveThisWeek(args, weekStart, weekEnd)) return true;
  return !hasWorkDates(args);
}
