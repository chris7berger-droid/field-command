/**
 * Submitted-PRT edit: today's SOW tasks plus already-submitted descriptions.
 * Cancel is a local state flip — no writes. There is no PRT draft path.
 *
 * The PRT body is a view-model, not "editing XOR readback". Hide the
 * submitted card only when the editor actually has cards to show. A live
 * query miss (prtSubmitted false) must not blank the screen.
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

export function visiblePrtEditEntries(todaySowTasks, submittedRaw) {
  const submitted = asPrtTaskList(submittedRaw);
  const source = editSowTasks(todaySowTasks, submitted);
  const seeded = seedTaskEntries(source, submitted, []);
  if (seeded.length > 0) return seeded;
  const fromCard = submitted.filter((t) => Number(t.pct_today) > 0);
  if (fromCard.length === 0) return [];
  return seedTaskEntries(
    fromCard.map((t, i) => ({
      description: taskDescription(t) || `Task ${i + 1}`,
      target_pct: Number(t.target_pct) || 0,
    })),
    submitted,
    []
  );
}

/**
 * Render decision for the PRT body. Never chrome-only after Edit.
 * showEditor only when there are cards; otherwise keep readback if we
 * have submitted work (live row or saved task rows the card already showed).
 */
export function prtSectionView({ submitted, editing, taskEntries, savedTasks }) {
  const saved = asPrtTaskList(savedTasks);
  const hasSubmittedWork = Boolean(submitted) || saved.some((t) => Number(t.pct_today) > 0);
  const editor = Array.isArray(taskEntries) ? taskEntries : [];
  const showEditor = Boolean(editing && editor.length > 0);
  const showReadback = Boolean(hasSubmittedWork && !showEditor);
  const showSticky = Boolean(showEditor || (!hasSubmittedWork && editor.length > 0));
  return { showEditor, showReadback, showSticky, editor, hasSubmittedWork };
}

export function showSubmittedPrtReadback(prtSubmitted, editing, taskEntries) {
  return prtSectionView({
    submitted: prtSubmitted,
    editing,
    taskEntries,
    savedTasks: [],
  }).showReadback;
}

export function cancelSubmittedPrtEdit() {
  return { editing: false, writes: [] };
}

export function prtEditDebugSnapshot({
  editing,
  prtSubmitted,
  workDate,
  reportId,
  status,
  tasksType,
  tasksIsArray,
  parsedCount,
  taskEntriesCount,
  view,
}) {
  return {
    editing: Boolean(editing),
    prtSubmitted: Boolean(prtSubmitted),
    workDate: workDate || null,
    reportId: reportId || null,
    status: status || null,
    tasksType: tasksType || null,
    tasksIsArray: Boolean(tasksIsArray),
    parsedCount: Number(parsedCount) || 0,
    taskEntriesCount: Number(taskEntriesCount) || 0,
    showEditor: Boolean(view?.showEditor),
    showReadback: Boolean(view?.showReadback),
    showSticky: Boolean(view?.showSticky),
  };
}
