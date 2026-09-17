/**
 * Crew names and Home membership.
 * Canonical assignment identity is assignments.team_member_id.
 * crew_name is display plus the legacy Home fallback when that UUID is blank.
 * job_crew is not used for Home.
 */

export function flipName(n) {
  if (!n) return '';
  const p = String(n).split(',');
  return p.length === 2
    ? p[1].trim() + ' ' + p[0].trim()
    : String(n).trim();
}

export function namesMatch(a, b) {
  const left = flipName(a).toLowerCase();
  const right = flipName(b).toLowerCase();
  return !!left && !!right && left === right;
}

export function assignmentDateKey(date) {
  const raw = String(date || '').trim();
  if (!raw) return '';
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

export function assignmentInHomeWeek(date, monday, sunday) {
  const d = assignmentDateKey(date);
  if (!d || !monday || !sunday) return false;
  return d >= monday && d <= sunday;
}

export function assignmentTeamMemberId(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return null;
  return raw;
}

export function assignmentMatchesUser(row, { userId, memberName } = {}) {
  const assignedId = assignmentTeamMemberId(row?.team_member_id);
  if (assignedId) {
    const me = String(userId || '').trim();
    return !!me && assignedId === me;
  }
  return namesMatch(memberName, row?.crew_name);
}

export function assignedCallLogIds({ assignRows, memberName, userId, monday, sunday }) {
  const ids = new Set();
  const me = String(userId || '').trim();
  if (!me && !flipName(memberName)) return ids;
  for (const r of (assignRows || [])) {
    if (!assignmentInHomeWeek(r.date, monday, sunday)) continue;
    if (!assignmentMatchesUser(r, { userId: me, memberName })) continue;
    const id = String(r.call_log_id || '');
    if (!id || id === 'null') continue;
    ids.add(id);
  }
  return ids;
}

export function punchesForEmployee(punches, employeeId) {
  const id = String(employeeId || '').trim();
  if (!id) return [];
  return (punches || []).filter((p) => String(p.employee_id || '') === id);
}

export function homeVisibleJobIds({ assignedIds, openPunch }) {
  const ids = new Set(assignedIds || []);
  const jobId = openPunch ? String(openPunch.job_id || '') : '';
  if (jobId && jobId !== 'null') ids.add(jobId);
  return ids;
}

/**
 * Home cards: this person's Home-week assignments on live Schedule jobs,
 * plus this-user open punch. Sales stage does not veto. Missing call_log
 * parents are skipped (no crash). liveJobRows null skips the live-index
 * check; an array (including empty) requires assigned ids to be present.
 */
export function buildHomeWeekJobs({
  callLogRows,
  extraCallLogRows,
  assignRows,
  liveJobRows,
  memberName,
  userId,
  monday,
  sunday,
  openPunch,
}) {
  const assignedIds = assignedCallLogIds({
    assignRows, memberName, userId, monday, sunday,
  });
  const visibleIds = homeVisibleJobIds({ assignedIds, openPunch });
  const liveIds = liveJobRows == null
    ? null
    : new Set(
        (liveJobRows || [])
          .map((r) => String(r.call_log_id || ''))
          .filter((id) => id && id !== 'null')
      );

  const byId = new Map();
  for (const job of [...(callLogRows || []), ...(extraCallLogRows || [])]) {
    if (!job || job.id == null) continue;
    const id = String(job.id);
    if (!byId.has(id)) byId.set(id, job);
  }

  const onJobId = openPunch ? String(openPunch.job_id || '') : '';
  const list = [];
  const seen = new Set();

  const admit = (id) => {
    if (!id || id === 'null' || seen.has(id) || !visibleIds.has(id)) return;
    const isOpen = !!onJobId && id === onJobId;
    if (assignedIds.has(id) && liveIds && !liveIds.has(id) && !isOpen) return;
    const job = byId.get(id);
    if (!job) return;
    seen.add(id);
    list.push(job);
  };

  for (const job of (callLogRows || [])) {
    if (job?.id == null) continue;
    admit(String(job.id));
  }
  if (onJobId) admit(onJobId);
  return list;
}

export function uniqueNames(rows, key = 'name') {
  const names = [];
  for (const r of (rows || [])) {
    const name = String(r[key] || '').trim();
    if (!name) continue;
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

export function crewByCallLog(assignRows) {
  const map = new Map();
  for (const r of (assignRows || [])) {
    const id = String(r.call_log_id || '');
    if (!id || id === 'null') continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  }
  return map;
}

export function crewLine(assignRows, lead) {
  const names = uniqueNames(assignRows, 'crew_name');
  const leadName = (lead || '').trim();
  const rest = leadName
    ? names.filter((n) => n.toLowerCase() !== leadName.toLowerCase())
    : names;
  const parts = [];
  if (leadName) parts.push(`LEAD ${leadName}`);
  if (rest.length) parts.push(rest.join(' · '));
  return parts.length ? parts.join('  ·  ') : null;
}
