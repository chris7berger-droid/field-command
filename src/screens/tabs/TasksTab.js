/**
 * Tasks Tab — Daily Task View (Native Only)
 *
 * Primary read: job_wtcs (synced via PowerSync) — the canonical, dated, per-WTC
 * SOW. One row per WTC sent to Schedule; each row's field_sow is an array of
 * day objects. We gather ALL of a job's WTCs and merge their days into one
 * calendar-date-centric view (F3): days that share a calendar date collapse
 * into one group (tasks/materials concatenated, crew MAX, hours SUM), undated
 * days trail as "Day N (TBD)".
 *
 * Legacy fallback: jobs.field_sow mirror, for pre-vertical jobs that have no
 * job_wtcs rows. The old proposal_wtc fallback is removed — it was an unjoined
 * `LIMIT 10 → [0]` read that picked an arbitrary WTC. See plan §F2/§F3.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, fmtPct, fmtDayLabel } from '../../lib/utils';
import LinenBackground from '../../components/LinenBackground';

// Merge per-WTC day arrays into calendar-date groups (F3 spec).
//   taggedDays: day objects each carrying a `work_type_name` (its source WTC).
// Returns { days: [mergedDay], allTbd }. A mergedDay is:
//   { key, label, date|null, isTbd, crew_count, hours_planned, tasks[], materials[] }
// Each task keeps a `work_type_name` tag so the merged list still shows its trade.
export function mergeDaysByDate(taggedDays) {
  const dated = [];
  const undated = [];
  for (const day of taggedDays) {
    if (day && day.date) dated.push(day);
    else if (day) undated.push(day);
  }
  const allTbd = dated.length === 0;

  // Group dated days by ISO date; ISO strings sort chronologically.
  const byDate = new Map();
  for (const day of dated) {
    if (!byDate.has(day.date)) byDate.set(day.date, []);
    byDate.get(day.date).push(day);
  }

  const merged = [];
  for (const date of [...byDate.keys()].sort()) {
    merged.push(buildMergedDay(byDate.get(date), {
      key: `d-${date}`, date, label: fmtDayLabel(date), isTbd: false,
    }));
  }

  // Undated days: trailing "Day N (TBD)" pills in original sequence. When EVERY
  // day is undated (e.g. a "dates TBD" send Schedule hasn't dated), fall back to
  // plain "Day N" labels — the render shows a Dates-TBD banner instead.
  undated.forEach((day, i) => {
    const seq = i + 1;
    const label = allTbd ? (day.day_label || `Day ${seq}`) : `Day ${seq} (TBD)`;
    merged.push(buildMergedDay([day], { key: `tbd-${i}`, date: null, label, isTbd: true }));
  });

  return { days: merged, allTbd };
}

function buildMergedDay(group, meta) {
  const tasks = [];
  const materials = [];
  let crew = 0;
  let hours = 0;
  let sqFt = 0;
  let mobSeq = null;
  const notes = [];
  for (const day of group) {
    const wt = day.work_type_name || null;
    for (const t of (day.tasks || [])) tasks.push({ ...t, work_type_name: wt });
    for (const m of (day.materials || [])) materials.push(m);
    // crew_count = MAX across the work types landing this date, NOT sum — two
    // work types the same day typically share one crew, so summing double-counts.
    // ⚠ PENDING JONAH confirmation (MAX vs SUM during build/smoke). If same-day
    // work types can be genuinely additive (distinct crews), switch to += here;
    // the per-task work_type_name tag keeps both computable.
    crew = Math.max(crew, Number(day.crew_count) || 0);
    hours += Number(day.hours_planned) || 0; // hours additive even when crew shared
    // Passthrough render fields (not merge logic): sq_ft is the same floor area
    // when work types share a date → MAX not sum; mobilization_seq = the WTC
    // number (take the lowest when they differ); scope_notes concatenated distinct.
    sqFt = Math.max(sqFt, Number(day.sq_ft) || 0);
    const seq = Number(day.mobilization_seq);
    if (Number.isFinite(seq) && seq > 0) mobSeq = mobSeq == null ? seq : Math.min(mobSeq, seq);
    const note = (day.scope_notes || '').trim();
    if (note && !notes.includes(note)) notes.push(note);
  }
  return {
    ...meta, crew_count: crew, hours_planned: hours,
    sq_ft: sqFt, mobilization_seq: mobSeq, scope_notes: notes.join('\n\n'),
    tasks, materials,
  };
}

export default function TasksTab({ jobId }) {
  // Primary: canonical dated SOW from job_wtcs. job_wtcs.job_id (int8) equals the
  // Field-local jobs.id (jobs syncs `job_id AS id`), so resolve it via call_log_id.
  const { data: wtcRows, isLoading: wtcLoading } = useQuery(
    `SELECT field_sow, work_type_name FROM job_wtcs
      WHERE job_id = (SELECT id FROM jobs WHERE call_log_id = ?)
      ORDER BY position`,
    [jobId]
  );

  // Legacy fallback: jobs.field_sow mirror for pre-vertical jobs with no job_wtcs.
  const { data: jobRows, isLoading: jobsLoading } = useQuery(
    `SELECT field_sow, size, size_unit FROM jobs WHERE call_log_id = ? LIMIT 1`,
    [jobId]
  );

  const isLoading = wtcLoading || jobsLoading;
  const jobRow = jobRows?.[0] || null;

  const { days, allTbd } = useMemo(() => {
    // Primary: gather every WTC's days, tagged with its work type.
    if (wtcRows && wtcRows.length > 0) {
      const tagged = [];
      for (const w of wtcRows) {
        for (const day of parseJSON(w.field_sow, [])) {
          tagged.push({ ...day, work_type_name: w.work_type_name });
        }
      }
      return mergeDaysByDate(tagged);
    }
    // Legacy: single jobs.field_sow array, no work-type tag.
    if (jobRow?.field_sow) {
      const tagged = parseJSON(jobRow.field_sow, []).map((d) => ({ ...d, work_type_name: null }));
      return mergeDaysByDate(tagged);
    }
    return { days: [], allTbd: false };
  }, [wtcRows, jobRow]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  // Check-off is a field convenience only — ephemeral UI state, not persisted
  // (this is a visual pass; no writes / data-contract work per the seed).
  const [checkedMats, setCheckedMats] = useState(() => new Set());
  const currentDay = days[selectedDayIdx] || null;

  const toggleMat = (matKey) => setCheckedMats((prev) => {
    const next = new Set(prev);
    next.has(matKey) ? next.delete(matKey) : next.add(matKey);
    return next;
  });

  if (isLoading) {
    return <View style={styles.center}><Text style={styles.loadingText}>Loading tasks...</Text></View>;
  }

  if (days.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>NO FIELD SOW</Text>
          <Text style={styles.emptyBody}>
            This job doesn't have a Field SOW yet. The day plan will appear
            here once the proposal is built in Sales Command and the job is mobilized.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <LinenBackground><ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content}>
      {allTbd && (
        <View style={styles.tbdBanner}>
          <Text style={styles.tbdBannerText}>DATES TBD — schedule hasn't assigned calendar dates yet</Text>
        </View>
      )}

      {/* Day Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayScrollContent}>
        {days.map((day, idx) => (
          <TouchableOpacity key={day.key} style={[styles.dayPill, idx === selectedDayIdx && styles.dayPillActive]} onPress={() => setSelectedDayIdx(idx)}>
            <Text style={[styles.dayPillText, idx === selectedDayIdx && styles.dayPillTextActive]}>{day.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {currentDay && (() => {
        const taskCount = (currentDay.tasks || []).length;
        const hrs = Number(currentDay.hours_planned) || 0;
        const hrsStr = Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1);
        const meta = [];
        if (currentDay.crew_count > 0) meta.push(`${currentDay.crew_count} CREW`);
        if (hrs > 0) meta.push(`${hrsStr} HRS`);
        if (currentDay.sq_ft > 0) meta.push(`${Number(currentDay.sq_ft).toLocaleString()} SQ FT`);
        if (currentDay.mobilization_seq) meta.push(`WTC ${currentDay.mobilization_seq}`);
        return (
        <>
          <View style={styles.dayHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayCounter}>DAY {selectedDayIdx + 1} OF {days.length}</Text>
              <Text style={styles.dayTitle}>{currentDay.label}</Text>
            </View>
            <View style={styles.taskCountBadge}>
              <Text style={styles.taskCountNum}>{taskCount}</Text>
              <Text style={styles.taskCountLabel}>{taskCount === 1 ? 'TASK' : 'TASKS'}</Text>
            </View>
          </View>

          {meta.length > 0 && (
            <View style={styles.metaBar}>
              <Text style={styles.metaBarText}>{meta.join('   ·   ')}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>TODAY'S WORK</Text>
          {taskCount === 0 ? (
            <Text style={styles.noItems}>No tasks for this day</Text>
          ) : (
            currentDay.tasks.map((task, idx) => (
              <View key={task.id || idx} style={styles.taskCard}>
                <View style={styles.taskTop}>
                  <View style={styles.taskNumCircle}><Text style={styles.taskNumText}>{idx + 1}</Text></View>
                  <Text style={styles.taskDesc} numberOfLines={2}>{task.description || 'Untitled task'}</Text>
                  <View style={styles.pctBadge}><Text style={styles.pctLabel}>TARGET </Text><Text style={styles.pctText}>{fmtPct(task.pct_complete)}</Text></View>
                </View>
                {task.work_type_name ? <Text style={styles.wtTag}>{task.work_type_name}</Text> : null}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(task.pct_complete || 0, 100)}%` }]} />
                </View>
              </View>
            ))
          )}

          {currentDay.scope_notes ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>INSTRUCTIONS</Text>
              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsText}>{currentDay.scope_notes}</Text>
              </View>
            </>
          ) : null}

          {(currentDay.materials || []).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>MATERIALS</Text>
              <View style={styles.matTable}>
                <View style={styles.matHeadRow}>
                  <Text style={[styles.matHeadCell, styles.matColName]}>MATERIAL</Text>
                  <Text style={[styles.matHeadCell, styles.matColQty]}>QTY</Text>
                  <Text style={[styles.matHeadCell, styles.matColDetails]}>DETAILS</Text>
                </View>
                {currentDay.materials.map((mat, idx) => {
                  const matKey = `${currentDay.key}:${mat.wtc_material_id || idx}`;
                  const checked = checkedMats.has(matKey);
                  const qty = Number(mat.qty_planned) || 0;
                  const details = [];
                  if (Number(mat.mix_time) > 0) details.push(`Mix ${mat.mix_time} min`);
                  if (mat.mix_speed) details.push(String(mat.mix_speed));
                  if (mat.cure_time) details.push(`Cure ${mat.cure_time}`);
                  return (
                    <TouchableOpacity key={matKey} style={styles.matRow} onPress={() => toggleMat(matKey)} activeOpacity={0.7}>
                      <View style={styles.matColName}>
                        <View style={styles.matNameWrap}>
                          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                            {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                          </View>
                          <Text style={[styles.matName, checked && styles.matNameChecked]} numberOfLines={2}>{mat.name || 'Unknown material'}</Text>
                        </View>
                      </View>
                      <View style={styles.matColQty}>
                        <Text style={styles.matQtyNum}>{qty > 0 ? qty : '—'}</Text>
                        {mat.kit_size ? <Text style={styles.matQtyUnit}>{mat.kit_size}</Text> : null}
                      </View>
                      <Text style={[styles.matColDetails, styles.matDetailsText]}>{details.length ? details.join('\n') : '—'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {jobRow?.size > 0 && (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>PRODUCTION TARGET</Text>
              <Text style={styles.targetValue}>{Number(jobRow.size).toLocaleString()} {jobRow.size_unit || ''}</Text>
              <Text style={styles.targetSub}>Total job scope</Text>
            </View>
          )}
        </>
        );
      })()}
    </ScrollView>
    </LinenBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  content: { padding: S.md, paddingBottom: S.xxl },
  center: { flex: 1, backgroundColor: C.linen, justifyContent: 'center', alignItems: 'center', padding: S.md },
  loadingText: { fontFamily: F.body, fontSize: 16, color: C.textMuted },
  emptyCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.lg, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', maxWidth: 320 },
  emptyTitle: { fontFamily: F.display, fontSize: 20, color: C.textHead, letterSpacing: 2, marginBottom: S.sm },
  emptyBody: { fontFamily: F.body, fontSize: 14, color: C.textBody, textAlign: 'center', lineHeight: 22 },
  dayScroll: { marginBottom: S.md, maxHeight: 44 },
  dayScrollContent: { gap: S.sm, paddingRight: S.md },
  dayPill: { backgroundColor: C.linenCard, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: C.borderStrong },
  dayPillActive: { backgroundColor: C.dark, borderColor: C.teal },
  dayPillText: { fontFamily: F.displayMed, fontSize: 13, color: C.textBody, letterSpacing: 1 },
  dayPillTextActive: { color: C.teal },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: S.sm },
  dayCounter: { fontFamily: F.displayMed, fontSize: 12, color: C.textMuted, letterSpacing: 2 },
  dayTitle: { fontFamily: F.display, fontSize: 24, color: C.textHead, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },
  taskCountBadge: { backgroundColor: C.dark, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 56 },
  taskCountNum: { fontFamily: F.display, fontSize: 20, color: C.teal, letterSpacing: 0.5 },
  taskCountLabel: { fontFamily: F.display, fontSize: 9, color: C.textFaint, letterSpacing: 1.5, marginTop: -2 },
  metaBar: { backgroundColor: C.dark, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, marginBottom: S.md },
  metaBarText: { fontFamily: F.displayMed, fontSize: 13, color: C.teal, letterSpacing: 1 },
  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  noItems: { fontFamily: F.body, fontSize: 14, color: C.textFaint, fontStyle: 'italic' },
  tbdBanner: { backgroundColor: C.dark, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: S.md },
  tbdBannerText: { fontFamily: F.displayMed, fontSize: 12, color: C.teal, letterSpacing: 1 },
  wtTag: { fontFamily: F.display, fontSize: 10, color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: S.sm },
  taskCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm },
  taskTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: S.sm },
  taskNumCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.dark, alignItems: 'center', justifyContent: 'center', marginRight: S.sm, marginTop: 1 },
  taskNumText: { fontFamily: F.display, fontSize: 14, color: C.teal },
  taskDesc: { fontFamily: F.bodySemi, fontSize: 15, color: C.textHead, flex: 1, marginRight: S.sm, lineHeight: 22 },
  pctBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' },
  pctLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1 },
  pctText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 0.5 },
  progressTrack: { height: 6, backgroundColor: C.linenDeep, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.teal, borderRadius: 3 },
  instructionsCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, borderLeftWidth: 4, borderLeftColor: C.teal },
  instructionsText: { fontFamily: F.body, fontSize: 14, color: C.textBody, lineHeight: 21 },
  matTable: { backgroundColor: C.linenCard, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, overflow: 'hidden' },
  matHeadRow: { flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 8, paddingHorizontal: S.md },
  matHeadCell: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 1.5 },
  matRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: S.md, borderTopWidth: 1, borderTopColor: C.border },
  matColName: { flex: 2.2, paddingRight: S.sm },
  matColQty: { flex: 1, paddingRight: S.sm },
  matColDetails: { flex: 1.6 },
  matNameWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: C.textFaint, marginRight: S.sm, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.dark, borderColor: C.teal },
  checkMark: { fontFamily: F.bodyBold, fontSize: 12, color: C.teal, lineHeight: 15 },
  matName: { fontFamily: F.bodyMed, fontSize: 14, color: C.textBody, flex: 1 },
  matNameChecked: { color: C.textFaint, textDecorationLine: 'line-through' },
  matQtyNum: { fontFamily: F.display, fontSize: 16, color: C.textHead },
  matQtyUnit: { fontFamily: F.body, fontSize: 11, color: C.textLight, marginTop: -1 },
  matDetailsText: { fontFamily: F.body, fontSize: 12, color: C.textLight, lineHeight: 17 },
  targetCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginTop: S.lg, alignItems: 'center' },
  targetLabel: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: 4 },
  targetValue: { fontFamily: F.display, fontSize: 28, color: C.teal, letterSpacing: 1 },
  targetSub: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },
});
