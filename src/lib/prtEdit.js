/**
 * Submitted-PRT edit: today's SOW tasks plus already-submitted descriptions.
 * Cancel is a local state flip — no draft, status, or submit write.
 */

export function asPrtTaskList(raw) {
  if (Array.isArray(raw)) return raw.filter((t) => t && typeof t === 'object');
  if (raw && typeof raw === 'object') {
    if (raw.description != null || raw.pct_today != null || raw.target_pct != null) {
      return [raw];
    }
    return [];
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    let v = JSON.parse(raw);
    if (typeof v === 'string') v = JSON.parse(v);
    return Array.isArray(v) ? v.filter((t) => t && typeof t === 'object') : [];
  } catch {
    return [];
  }
}

function taskDescription(t) {
  return String(t?.description || '').trim();
}

export function editSowTasks(todaySowTasks, submittedTasks) {
  const out = [];
  const seen = new Set();
  for (const t of todaySowTasks || []) {
    const description = taskDescription(t);
    if (!description || seen.has(description)) continue;
    seen.add(description);
    out.push({
      id: t.id,
      description,
      target_pct: Number(t.target_pct) || 0,
    });
  }
  for (const t of asPrtTaskList(submittedTasks)) {
    const description = taskDescription(t);
    const worked = Number(t?.pct_today) > 0;
    if ((!description && !worked) || (description && seen.has(description))) continue;
    const label = description || `Task ${out.length + 1}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      id: t.id,
      description: label,
      target_pct: Number(t.target_pct) || 0,
    });
  }
  return out;
}

export function seedTaskEntries(source, saved, local) {
  const byDesc = new Map();
  for (const t of asPrtTaskList(saved)) byDesc.set(taskDescription(t) || t.description, t);
  for (const t of (local || [])) byDesc.set(taskDescription(t) || t.description, t);
  return source.map((t) => {
    const prev = byDesc.get(t.description);
    return {
      description: t.description,
      target_pct: t.target_pct,
      pct_today: prev ? Number(prev.pct_today) || 0 : 0,
      notes: prev ? (prev.notes || '') : '',
    };
  });
}

/** Seed the Edit list. Never drop already-submitted worked tasks. */
export function visiblePrtEditEntries(todaySowTasks, submittedRaw) {
  const submitted = asPrtTaskList(submittedRaw);
  const source = editSowTasks(todaySowTasks, submitted);
  return seedTaskEntries(source, submitted, []);
}

export function showSubmittedPrtReadback(prtSubmitted, editing, taskEntries) {
  if (!prtSubmitted) return false;
  if (!editing) return true;
  return !taskEntries || taskEntries.length === 0;
}

/** Exit edit. Caller must apply this without db.execute / draft / submit. */
export function cancelSubmittedPrtEdit() {
  return { editing: false, writes: [] };
}
