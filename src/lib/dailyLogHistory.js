import { localYmd } from './utils';

export const REQUIRED_LOG_TYPES = ['SOD', 'MOD', 'EOD'];

/** Calendar job day for a Daily Log. Null work_date falls back to localYmd(created_at). */
export function entryWorkDate(entry) {
  const raw = String(entry?.work_date || '').trim();
  if (raw) return raw.length >= 10 ? raw.slice(0, 10) : raw;
  if (!entry?.created_at) return null;
  const when = new Date(entry.created_at);
  if (Number.isNaN(when.getTime())) return null;
  return localYmd(when);
}

/** Shift work day for a punch (clock-in time, else punch_date). */
export function punchWorkDate(punch) {
  if (!punch) return null;
  if (punch.punch_time) {
    const d = new Date(punch.punch_time);
    if (!Number.isNaN(d.getTime())) return localYmd(d);
  }
  const pd = String(punch.punch_date || '').trim();
  return pd.length >= 10 ? pd.slice(0, 10) : (pd || null);
}

/** Local YYYY-MM-DD work dates for this job's Daily Log, plus today and extras. No future dates. */
export function dailyLogWorkDates(entries, today, extraDates) {
  const dates = new Set();
  if (today) dates.add(today);
  for (const e of entries || []) {
    const ymd = entryWorkDate(e);
    if (ymd && (!today || ymd <= today)) dates.add(ymd);
  }
  for (const d of extraDates || []) {
    const ymd = String(d || '').trim();
    const key = ymd.length >= 10 ? ymd.slice(0, 10) : ymd;
    if (key && (!today || key <= today)) dates.add(key);
  }
  return [...dates].sort();
}

export function dailyLogEntriesOnDate(entries, ymd) {
  return (entries || []).filter((e) => entryWorkDate(e) === ymd);
}

/** When a SOD/MOD/EOD/OTHER/ADL period is selected, hide other periods' cards. */
export function dailyLogEntriesForPeriod(entries, period) {
  const list = entries || [];
  if (!period) return list;
  if (period === 'ADL') {
    return list.filter((e) => e.entry_type === 'ADL' || e.entry_type === 'OTHER');
  }
  return list.filter((e) => e.entry_type === period);
}

export function adjacentLogDate(dates, viewDate, dir) {
  if (!dates?.length || !viewDate || !dir) return null;
  if (dir < 0) {
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i] < viewDate) return dates[i];
    }
    return null;
  }
  for (let i = 0; i < dates.length; i += 1) {
    if (dates[i] > viewDate) return dates[i];
  }
  return null;
}

export function isRequiredLogType(type) {
  return type === 'SOD' || type === 'MOD' || type === 'EOD';
}

export function isSupplementalLogType(type) {
  return type === 'ADL' || type === 'OTHER';
}

export function missingRequiredLogTypes(entriesOnDate) {
  const have = new Set(
    (entriesOnDate || [])
      .filter((e) => isRequiredLogType(e.entry_type))
      .map((e) => e.entry_type)
  );
  return REQUIRED_LOG_TYPES.filter((t) => !have.has(t));
}

export function nextRequiredLogType(entriesOnDate) {
  return missingRequiredLogTypes(entriesOnDate)[0] || null;
}

export function requiredTypesPresent(entriesOnDate) {
  return missingRequiredLogTypes(entriesOnDate).length === 0;
}

export function assignmentDatesForJob(assignRows, { jobId, userId, memberName, namesMatch }) {
  const dates = [];
  const target = String(jobId || '');
  const me = String(userId || '').trim();
  for (const r of assignRows || []) {
    if (String(r.call_log_id || '') !== target) continue;
    const assignedId = String(r.team_member_id || '').trim();
    const hasId = assignedId && assignedId.toLowerCase() !== 'null' && assignedId.toLowerCase() !== 'undefined';
    if (hasId) {
      if (!(me && assignedId === me)) continue;
    } else {
      const nameOk = typeof namesMatch === 'function' && namesMatch(memberName, r.crew_name);
      if (!nameOk) continue;
    }
    const d = String(r.date || '').trim();
    const key = d.length >= 10 ? d.slice(0, 10) : d;
    if (key) dates.push(key);
  }
  return dates;
}

export function punchWorkDatesForJob(punches, { jobId, employeeId } = {}) {
  const dates = [];
  const target = String(jobId || '');
  const me = String(employeeId || '').trim();
  for (const p of punches || []) {
    if (p.punch_type !== 'clock_in') continue;
    if (String(p.job_id || '') !== target) continue;
    if (me && String(p.employee_id || '') !== me) continue;
    const d = punchWorkDate(p);
    if (d) dates.push(d);
  }
  return dates;
}

export function eligibleWorkDates({ assignmentDates, punchDates, today } = {}) {
  const dates = new Set();
  for (const d of [...(assignmentDates || []), ...(punchDates || [])]) {
    const ymd = String(d || '').trim();
    const key = ymd.length >= 10 ? ymd.slice(0, 10) : ymd;
    if (key && (!today || key <= today)) dates.add(key);
  }
  return [...dates].sort();
}

export function canWriteDailyLogOnDate(date, { today, eligibleDates, clockedIntoJob } = {}) {
  const ymd = String(date || '').trim().slice(0, 10);
  if (!ymd || (today && ymd > today)) return false;
  if (clockedIntoJob && ymd === today) return true;
  return (eligibleDates || []).includes(ymd);
}

/**
 * Clock-out timestamp that closed the shift whose clock-in belongs to workDate.
 * Overnight Punch Out Now keeps punch_date = Sunday; pair via the clock-in day.
 */
export function applicableClockOutTime(punches, { jobId, employeeId, workDate } = {}) {
  if (!workDate) return null;
  const target = String(jobId || '');
  const me = String(employeeId || '').trim();
  const list = [...(punches || [])]
    .filter((p) => String(p.job_id || '') === target)
    .filter((p) => !me || String(p.employee_id || '') === me)
    .sort((a, b) => String(a.punch_time || '').localeCompare(String(b.punch_time || '')));

  let openIn = null;
  for (const p of list) {
    if (p.punch_type === 'clock_in') openIn = p;
    if (p.punch_type === 'clock_out' && openIn) {
      if (punchWorkDate(openIn) === workDate) return p.punch_time || null;
      openIn = null;
    }
  }
  return null;
}

export function firstRequiredCreatedAt(entriesOnDate, type) {
  const rows = (entriesOnDate || [])
    .filter((e) => e.entry_type === type && e.created_at)
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return rows[0]?.created_at || null;
}

/** missing | done | late — ADL never marks required complete or late. */
export function requiredPeriodStatus(entriesOnDate, type, clockOutTime) {
  if (!isRequiredLogType(type)) return 'missing';
  const created = firstRequiredCreatedAt(entriesOnDate, type);
  if (!created) return 'missing';
  if (!clockOutTime) return 'done';
  const createdMs = new Date(created).getTime();
  const outMs = new Date(clockOutTime).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(outMs)) return 'done';
  return createdMs > outMs ? 'late' : 'done';
}

export function canComposeRequiredOnDate(entriesOnDate, type, { historical }) {
  if (!isRequiredLogType(type)) return false;
  if (!historical) return true;
  return !firstRequiredCreatedAt(entriesOnDate, type);
}

export function canComposeAdlOnDate(entriesOnDate) {
  return requiredTypesPresent(entriesOnDate);
}

export function requiredLogDueCopy(nextType) {
  const labels = { SOD: 'start-of-day', MOD: 'mid-day', EOD: 'end-of-day' };
  const which = labels[nextType] || 'required';
  return {
    title: 'Required Daily Log Due',
    body: `Finish the ${which} log before an additional log.`,
  };
}

/** Submit time on cards. Include the calendar day when it differs from work_date. */
export function formatLogSubmittedAt(entry) {
  if (!entry?.created_at) return '';
  const when = new Date(entry.created_at);
  if (Number.isNaN(when.getTime())) return '';
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const work = entryWorkDate(entry);
  const submittedDay = localYmd(when);
  if (work && submittedDay && work !== submittedDay) {
    return when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return time;
}
