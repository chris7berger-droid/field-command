/**
 * Submitted-PRT edit: today's SOW tasks plus already-submitted descriptions.
 * Cancel is a local state flip — no draft, status, or submit write.
 */

export function editSowTasks(todaySowTasks, submittedTasks) {
  const out = [];
  const seen = new Set();
  for (const t of todaySowTasks || []) {
    const description = t?.description;
    if (!description || seen.has(description)) continue;
    seen.add(description);
    out.push({
      id: t.id,
      description,
      target_pct: Number(t.target_pct) || 0,
    });
  }
  for (const t of submittedTasks || []) {
    const description = t?.description;
    if (!description || seen.has(description)) continue;
    seen.add(description);
    out.push({
      id: t.id,
      description,
      target_pct: Number(t.target_pct) || 0,
    });
  }
  return out;
}

export function seedTaskEntries(source, saved, local) {
  const byDesc = new Map();
  for (const t of (saved || [])) byDesc.set(t.description, t);
  for (const t of (local || [])) byDesc.set(t.description, t);
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

/** Exit edit. Caller must apply this without db.execute / draft / submit. */
export function cancelSubmittedPrtEdit() {
  return { editing: false, writes: [] };
}
