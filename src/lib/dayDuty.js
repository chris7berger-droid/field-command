/**
 * Today's expected work: SOD / MOD / EOD / PRT.
 * Windows are counted from clock-in so a late start still has a real due time.
 * Clock-out is blocked until all four are done.
 */
import { localYmd, tod, addDaysYmd } from './utils';

const nightWorkAck = new Set();

export function punchLookbackDate(today = tod()) {
  return addDaysYmd(today, -2);
}

export function punchDay(punch) {
  if (!punch) return null;
  if (punch.punch_time) {
    const d = new Date(punch.punch_time);
    if (!Number.isNaN(d.getTime())) return localYmd(d);
  }
  return punch.punch_date || null;
}

export function openClockInPunch(punches) {
  const open = new Map();
  const sorted = [...(punches || [])].sort((a, b) =>
    String(a.punch_time || '').localeCompare(String(b.punch_time || ''))
  );
  for (const p of sorted) {
    const id = String(p.job_id || '');
    if (!id || id === 'null') continue;
    if (p.punch_type === 'clock_in') open.set(id, p);
    if (p.punch_type === 'clock_out') open.delete(id);
  }
  let best = null;
  for (const p of open.values()) {
    if (!best || String(p.punch_time) > String(best.punch_time)) best = p;
  }
  return best;
}

export function ackNightWork(clockInId) {
  if (clockInId) nightWorkAck.add(String(clockInId));
}

export function isNightWorkAcked(clockInId) {
  return !!clockInId && nightWorkAck.has(String(clockInId));
}

export function shiftDate(punches, today = tod()) {
  return punchDay(openClockInPunch(punches)) || today;
}

export function isOvernightShift(punches, today = tod()) {
  const open = openClockInPunch(punches);
  if (!open) return false;
  const day = punchDay(open);
  if (day && day < today) return true;
  if (!open.punch_time) return false;
  const start = new Date(open.punch_time);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() < new Date(`${today}T00:00:00`).getTime();
}

// Punches that belong to the live shift: the open clock-in onward, or
// today's punches only if nobody is on the clock. Yesterday's finished
// shift must not lock Time Clock or the status bar.
export function punchesForOpenShift(punches, jobId, today = tod()) {
  const list = punches || [];
  const open = openClockInPunch(list);
  if (open && (jobId == null || String(open.job_id) === String(jobId))) {
    const id = String(open.job_id);
    const start = String(open.punch_time || '');
    return list.filter((p) => String(p.job_id) === id && String(p.punch_time || '') >= start);
  }
  return list.filter((p) => {
    if (jobId != null && String(p.job_id) !== String(jobId)) return false;
    return punchDay(p) === today;
  });
}

export const DUTY_LOGS = [
  { key: 'SOD', label: 'START OF DAY', short: 'SOD', dueAfterMs: 15 * 60 * 1000, dueHour: null },
  { key: 'MOD', label: 'MID DAY', short: 'MOD', dueAfterMs: 4 * 60 * 60 * 1000, dueHour: 12 },
  { key: 'EOD', label: 'END OF DAY', short: 'EOD', dueAfterMs: 6 * 60 * 60 * 1000, dueHour: 15 },
];

export const PRT_DUTY = {
  key: 'PRT',
  label: 'PRODUCTION REPORT',
  short: 'PRT',
  dueAfterMs: 6 * 60 * 60 * 1000,
  dueHour: 15,
};

export function isDutyDue(clockInTime, now, dueAfterMs, dueHour) {
  if (!clockInTime) return false;
  const elapsed = now.getTime() - new Date(clockInTime).getTime();
  if (elapsed >= dueAfterMs) return true;
  if (dueHour != null && now.getHours() >= dueHour) return true;
  return false;
}

export function dutyState({ done, clockInTime, now, dueAfterMs, dueHour }) {
  if (done) return 'done';
  if (isDutyDue(clockInTime, now, dueAfterMs, dueHour)) return 'due';
  return 'upcoming';
}

// Job with an open clock-in (no matching clock-out). Lunch and drive
// punches do not change it. Null = not on a job.
export function openClockJobId(punches) {
  const p = openClockInPunch(punches);
  return p ? String(p.job_id) : null;
}

export function reportClockGate(targetJobId, punches) {
  if (!Array.isArray(punches)) return { allowed: true, openId: null };
  const openId = openClockJobId(punches);
  const target = String(targetJobId);
  if (openId === target) return { allowed: true, openId };
  if (openId) return { allowed: false, kind: 'other', openId };
  return { allowed: false, kind: 'none', openId: null };
}

/** Daily Log / ADL access. PRT keeps reportClockGate. */
export function dailyLogAccessGate(targetJobId, punches, { eligible = false } = {}) {
  if (!Array.isArray(punches)) return { allowed: true, openId: null, kind: 'unknown' };
  const openId = openClockJobId(punches);
  const target = String(targetJobId);
  if (openId === target) return { allowed: true, openId, kind: 'clocked' };
  if (openId) return { allowed: false, kind: 'other', openId };
  if (eligible) return { allowed: true, openId: null, kind: 'eligible' };
  return { allowed: false, kind: 'none', openId: null };
}

export function dailyLogAccessCopy(kind, openLabel) {
  if (kind === 'other') return reportClockCopy('other', openLabel);
  return {
    title: 'No work day on this job to report.',
    body: 'Daily Logs follow a day you were assigned or punched — not a new clock-in.',
    confirm: 'OK',
  };
}

export function reportClockCopy(kind, openLabel) {
  if (kind === 'other') {
    return {
      title: "You're punched into the wrong job for this report.",
      body: null,
      confirm: openLabel,
    };
  }
  return {
    title: 'Clock in first.',
    body: null,
    confirm: 'Clock in',
  };
}

export function switchJobClockCopy(openLabel) {
  return {
    title: "You're punched into another job.",
    body: null,
    confirm: openLabel,
  };
}

export function missingClockOutDuties({ logTypes, prtSubmitted }) {
  const missing = [];
  if (!logTypes.has('SOD')) missing.push('start-of-day log');
  if (!logTypes.has('MOD')) missing.push('mid-day log');
  if (!logTypes.has('EOD')) missing.push('end-of-day log');
  if (!prtSubmitted) missing.push('production report');
  return missing;
}

// Dated-today wins. Otherwise the next production day: how many PRTs already
// went in, matching office day-count.
export function pickSowDaysForPrt(days, today, submittedPriorCount) {
  const list = days || [];
  const datedToday = list.filter((d) => d.date && d.date === today);
  if (datedToday.length > 0) return datedToday;
  if (list.length === 0) return [];
  const idx = Math.min(Math.max(submittedPriorCount, 0), list.length - 1);
  return [list[idx]];
}
