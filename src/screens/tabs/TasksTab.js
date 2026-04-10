/**
 * Tasks Tab — Daily Task View (Native Only)
 * Reads proposal_wtc.field_sow and displays day plan entries.
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
  const { data: wtcRows, isLoading } = useQuery(
    `SELECT * FROM proposal_wtc WHERE field_sow IS NOT NULL LIMIT 10`
  );

  const wtc = wtcRows?.[0] || null;
  const fieldSow = useMemo(() => parseJSON(wtc?.field_sow, []), [wtc]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
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

          <Text style={styles.sectionTitle}>TASKS</Text>
          {(currentDay.tasks || []).length === 0 ? (
            <Text style={styles.noItems}>No tasks for this day</Text>
          ) : (
            currentDay.tasks.map((task, idx) => (
              <View key={task.id || idx} style={styles.taskCard}>
                <View style={styles.taskTop}>
                  <Text style={styles.taskDesc} numberOfLines={2}>{task.description || 'Untitled task'}</Text>
                  <View style={styles.pctBadge}><Text style={styles.pctText}>{fmtPct(task.pct_complete)}</Text></View>
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
                <View key={idx} style={styles.materialRow}>
                  <Text style={styles.materialName} numberOfLines={1}>{mat.name || 'Unknown material'}</Text>
                  <View style={styles.qtyBadge}><Text style={styles.qtyText}>{mat.qty_planned ?? '—'}</Text></View>
                </View>
              ))}
            </>
          )}

          {wtc?.size > 0 && (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>PRODUCTION TARGET</Text>
              <Text style={styles.targetValue}>{Number(wtc.size).toLocaleString()} {wtc.unit || ''}</Text>
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
  pctBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  pctText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 0.5 },
  progressTrack: { height: 6, backgroundColor: C.linenDeep, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.teal, borderRadius: 3 },
  materialRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  materialName: { fontFamily: F.body, fontSize: 14, color: C.textBody, flex: 1, marginRight: S.sm },
  qtyBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  qtyText: { fontFamily: F.bodyMed, fontSize: 13, color: C.teal },
  targetCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginTop: S.lg, alignItems: 'center' },
  targetLabel: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: 4 },
  targetValue: { fontFamily: F.display, fontSize: 28, color: C.teal, letterSpacing: 1 },
  targetSub: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },
});
