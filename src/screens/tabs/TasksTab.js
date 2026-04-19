/**
 * Tasks Tab — Daily Task View (Native Only)
 * Reads jobs.field_sow (synced via PowerSync) for the current job.
 * Falls back to proposal_wtc.field_sow for legacy jobs without a jobs row.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, fmtPct, fmtHrs } from '../../lib/utils';
import LinenBackground from '../../components/LinenBackground';

export default function TasksTab({ jobId }) {
  // Primary: read field_sow from jobs table (linked via call_log_id = jobId)
  const { data: jobRows, isLoading: jobsLoading } = useQuery(
    `SELECT field_sow, size, size_unit FROM jobs WHERE call_log_id = ? LIMIT 1`,
    [jobId]
  );

  // Fallback: legacy path via proposal_wtc for jobs without a jobs row
  const { data: wtcRows, isLoading: wtcLoading } = useQuery(
    `SELECT field_sow, size, unit FROM proposal_wtc WHERE field_sow IS NOT NULL LIMIT 10`
  );

  const isLoading = jobsLoading || wtcLoading;
  const jobRow = jobRows?.[0] || null;
  const wtc = wtcRows?.[0] || null;
  const fieldSow = useMemo(() => {
    if (jobRow?.field_sow) return parseJSON(jobRow.field_sow, []);
    if (wtc?.field_sow) return parseJSON(wtc.field_sow, []);
    return [];
  }, [jobRow, wtc]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [expandedMat, setExpandedMat] = useState(null); // idx of expanded material
  const currentDay = fieldSow[selectedDayIdx] || null;

  if (isLoading) {
    return <View style={styles.center}><Text style={styles.loadingText}>Loading tasks...</Text></View>;
  }

  if (fieldSow.length === 0) {
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
      {/* Day Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayScrollContent}>
        {fieldSow.map((day, idx) => (
          <TouchableOpacity key={day.id || idx} style={[styles.dayPill, idx === selectedDayIdx && styles.dayPillActive]} onPress={() => setSelectedDayIdx(idx)}>
            <Text style={[styles.dayPillText, idx === selectedDayIdx && styles.dayPillTextActive]}>{day.day_label || `Day ${idx + 1}`}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {currentDay && (
        <>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{currentDay.day_label || `Day ${selectedDayIdx + 1}`}</Text>
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

          {(jobRow?.size > 0 || wtc?.size > 0) && (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>PRODUCTION TARGET</Text>
              <Text style={styles.targetValue}>{Number(jobRow?.size || wtc?.size).toLocaleString()} {jobRow?.size_unit || wtc?.unit || ''}</Text>
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
