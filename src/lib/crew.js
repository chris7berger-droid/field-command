/**
 * Crew names. Schedule's source of truth is assignments.crew_name
 * (job_id = jobs.id). job_crew / jobs.lead are fallbacks.
 */

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
