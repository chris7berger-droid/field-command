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
import { parseJSON, fmtPct, fmtHrs, fmtDayLabel } from '../../lib/utils';
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
  }
  return { ...meta, crew_count: crew, hours_planned: hours, tasks, materials };
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
  const [expandedMat, setExpandedMat] = useState(null); // idx of expanded material
  const currentDay = days[selectedDayIdx] || null;

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

      {currentDay && (
        <>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{currentDay.label}</Text>
            <View style={styles.dayMeta}>
              {currentDay.crew_count > 0 && <View style={styles.metaChip}><Text style={styles.metaText}>{currentDay.crew_count} crew</Text></View>}
              {currentDay.hours_planned > 0 && <View style={styles.metaChip}><Text style={styles.metaText}>{fmtHrs(currentDay.hours_planned)}</Text></View>}
            </View>
          </View>

          <Text style={styles.sectionTitle}>PLANNED TASKS</Text>
          {(currentDay.tasks || []).length === 0 ? (
            <Text style={styles.noItems}>No tasks for this day</Text>
          ) : (
            currentDay.tasks.map((task, idx) => (
              <View key={task.id || idx} style={styles.taskCard}>
                <View style={styles.taskTop}>
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

          {(currentDay.materials || []).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>MATERIALS</Text>
              {currentDay.materials.map((mat, idx) => (
                <TouchableOpacity key={idx} style={styles.materialRow} onPress={() => setExpandedMat(expandedMat === idx ? null : idx)} activeOpacity={0.7}>
                  <View style={styles.materialTop}>
                    <Text style={styles.materialName} numberOfLines={expandedMat === idx ? 0 : 1}>{mat.name || 'Unknown material'}</Text>
                    <View style={styles.qtyBadge}><Text style={styles.qtyText}>{mat.qty_planned ?? '—'}</Text></View>
                  </View>
                  {expandedMat === idx && (
                    <View style={styles.materialSpecs}>
                      {mat.mils > 0 && <View style={styles.specRow}><Text style={styles.specLabel}>MILS</Text><Text style={styles.specValue}>{mat.mils}</Text></View>}
                      {mat.coverage_rate ? <View style={styles.specRow}><Text style={styles.specLabel}>COVERAGE</Text><Text style={styles.specValue}>{mat.coverage_rate}</Text></View> : null}
                      {mat.mix_time > 0 && <View style={styles.specRow}><Text style={styles.specLabel}>MIX TIME</Text><Text style={styles.specValue}>{mat.mix_time} min</Text></View>}
                      {mat.mix_speed ? <View style={styles.specRow}><Text style={styles.specLabel}>MIX SPEED</Text><Text style={styles.specValue}>{mat.mix_speed}</Text></View> : null}
                      {mat.cure_time ? <View style={styles.specRow}><Text style={styles.specLabel}>CURE TIME</Text><Text style={styles.specValue}>{mat.cure_time}</Text></View> : null}
                      {!mat.mils && !mat.coverage_rate && !mat.mix_time && !mat.mix_speed && !mat.cure_time && <Text style={styles.noSpecs}>No specs entered</Text>}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
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
      )}
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
  dayHeader: { marginBottom: S.md },
  dayTitle: { fontFamily: F.display, fontSize: 22, color: C.textHead, letterSpacing: 1, textTransform: 'uppercase' },
  dayMeta: { flexDirection: 'row', gap: S.sm, marginTop: 6 },
  metaChip: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  metaText: { fontFamily: F.bodyMed, fontSize: 12, color: C.teal },
  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  noItems: { fontFamily: F.body, fontSize: 14, color: C.textFaint, fontStyle: 'italic' },
  tbdBanner: { backgroundColor: C.dark, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: S.md },
  tbdBannerText: { fontFamily: F.displayMed, fontSize: 12, color: C.teal, letterSpacing: 1 },
  wtTag: { fontFamily: F.display, fontSize: 10, color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: S.sm },
  taskCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm },
  taskTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: S.sm },
  taskDesc: { fontFamily: F.bodySemi, fontSize: 15, color: C.textHead, flex: 1, marginRight: S.sm, lineHeight: 22 },
  pctBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' },
  pctLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1 },
  pctText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 0.5 },
  progressTrack: { height: 6, backgroundColor: C.linenDeep, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.teal, borderRadius: 3 },
  materialRow: { backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  materialTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  materialName: { fontFamily: F.body, fontSize: 14, color: C.textBody, flex: 1, marginRight: S.sm },
  materialSpecs: { marginTop: S.sm, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.border },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  specLabel: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 1.5 },
  specValue: { fontFamily: F.bodyMed, fontSize: 13, color: C.textBody },
  noSpecs: { fontFamily: F.body, fontSize: 13, color: C.textFaint, fontStyle: 'italic' },
  qtyBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  qtyText: { fontFamily: F.bodyMed, fontSize: 13, color: C.teal },
  targetCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginTop: S.lg, alignItems: 'center' },
  targetLabel: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: 4 },
  targetValue: { fontFamily: F.display, fontSize: 28, color: C.teal, letterSpacing: 1 },
  targetSub: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },
});
