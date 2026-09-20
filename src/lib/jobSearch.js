/**
 * All Jobs Search — local PowerSync universe only.
 * Searchable jobs are call_log rows that already have a live jobs parent.
 * No week filter. No Sales-stage filter. Never emit a jobs row without
 * a real local call_log parent.
 */

export function liveCallLogIds(liveJobRows) {
  const ids = new Set();
  for (const row of (liveJobRows || [])) {
    const id = String(row?.call_log_id ?? '');
    if (!id || id === 'null') continue;
    ids.add(id);
  }
  return ids;
}

/**
 * call_log rows that have at least one live (not deleted) jobs parent.
 * Starts from call_log so an orphan jobs row cannot appear.
 */
export function searchableCallLogJobs(callLogRows, liveJobRows) {
  const liveByCl = new Map();
  for (const row of (liveJobRows || [])) {
    const id = String(row?.call_log_id ?? '');
    if (!id || id === 'null') continue;
    if (!liveByCl.has(id)) liveByCl.set(id, row);
  }

  const out = [];
  const seen = new Set();
  for (const job of (callLogRows || [])) {
    if (!job || job.id == null) continue;
    const id = String(job.id);
    if (seen.has(id)) continue;
    const live = liveByCl.get(id);
    if (!live) continue;
    seen.add(id);
    const jobNum = job.job_num != null && String(job.job_num).trim() !== ''
      ? job.job_num
      : live.job_num;
    out.push(jobNum != null && String(jobNum).trim() !== ''
      ? { ...job, job_num: jobNum }
      : job);
  }
  return out;
}

export function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

export function numberQuery(query) {
  return normalizeQuery(query).replace(/^#/, '').trim();
}

export function jobNumberKey(job) {
  if (job?.job_number != null && String(job.job_number).trim() !== '') {
    return String(job.job_number).trim();
  }
  if (job?.job_num != null && String(job.job_num).trim() !== '') {
    return String(job.job_num).replace(/^#/, '').trim();
  }
  const display = (job?.display_job_number || '').toString().trim();
  if (!display) return '';
  return display.split(' - ')[0].replace(/^#/, '').trim();
}

export function matchKind(job, query) {
  const raw = normalizeQuery(query);
  if (!raw) return null;
  const numQ = numberQuery(query);
  const num = jobNumberKey(job).toLowerCase();
  const name = String(job?.job_name || '').toLowerCase();
  if (num && numQ && num === numQ) return 'exact_number';
  if (num && numQ && num.startsWith(numQ)) return 'prefix_number';
  if (name && name.includes(raw)) return 'name';
  return null;
}

export function filterSearchableJobs(jobs, query) {
  const exact = [];
  const prefix = [];
  const name = [];
  for (const job of (jobs || [])) {
    const kind = matchKind(job, query);
    if (kind === 'exact_number') exact.push(job);
    else if (kind === 'prefix_number') prefix.push(job);
    else if (kind === 'name') name.push(job);
  }
  return [...exact, ...prefix, ...name];
}
