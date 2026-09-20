/**
 * Tasks Tab — Daily Task View (Native Only)
 *
 * Primary read: job_wtcs (synced via PowerSync) — the canonical, dated, per-WTC
 * SOW. One row per WTC sent to Schedule; each row's field_sow is an array of
 * day objects. Days that share a calendar date AND the same trip (mobilization_seq)
 * collapse into one group (F3). Two trips on the same date stay separate.
 * Undated days trail as "Day N (TBD)". Trip titles come from job_mobilizations.
 *
 * Legacy fallback: jobs.field_sow mirror, for pre-vertical jobs that have no
 * job_wtcs rows. The old proposal_wtc fallback is removed — it was an unjoined
 * `LIMIT 10 → [0]` read that picked an arbitrary WTC. See plan §F2/§F3.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { usePowerSync, useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, fmtPct, fmtDayLabel, tod, addDaysYmd } from '../../lib/utils';
import { tripSeq, tripTitle } from '../../lib/trips';
import { uniqueNames } from '../../lib/crew';
import { requireCanonicalTeamMemberId, isMissingTeamMemberIdError } from '../../lib/activation';
import LinenBackground from '../../components/LinenBackground';

// Local uuid (PowerSync row ids are client-generated v4 uuids).
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function tripGroupKey(day) {
  const seq = tripSeq(day);
  return seq == null ? 'none' : String(seq);
}

export { tripTitle };

function ymd(v) {
  if (!v) return null;
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : null;
}

// Dated SOW days before local today: viewable, load-out checkbox read-only.
export function isHistoricalSowWorkDate(workDate, todayYmd) {
  return !!(workDate && todayYmd && workDate < todayYmd);
}

export function materialCheckMatchDate(workDate, todayYmd) {
  return isHistoricalSowWorkDate(workDate, todayYmd) ? workDate : todayYmd;
}

function fmtHrs(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Field SOW day boxes — crew_count + hours_planned. Not WTC bid labor / OT.
function soldLaborFromSowDays(w) {
  const days = parseJSON(w.field_sow, []);
  let hours = 0;
  let crew = 0;
  for (const d of days) {
    hours += Number(d.hours_planned) || 0;
    crew = Math.max(crew, Number(d.crew_count) || 0);
  }
  const parts = [];
  if (hours > 0) parts.push(`${fmtHrs(hours)} HRS`);
  if (crew > 0) parts.push(`${crew} CREW`);
  const each = hours > 0 && crew > 1 ? hours / crew : null;
  return {
    key: w.proposal_wtc_id || w.work_type_name || 'labor',
    name: (w.work_type_name || '').trim() || 'WORK',
    parts,
    each: fmtHrs(each),
  };
}

// SOW days often have date: null; the calendar lives on job_mobilizations.
// Fill empty day dates from the matching trip window (start + later days).
function applyTripDates(taggedDays, trips) {
  const list = (taggedDays || []).map((d) => ({ ...d }));
  // Offset per work-type + trip, not the flattened list — two WTCs on the
  // same trip must share Day 1's date so F3 can merge them.
  const undatedByGroup = new Map();
  list.forEach((day, i) => {
    if (ymd(day.date)) return;
    const seq = tripSeq(day);
    if (seq == null) return;
    const key = `${day.work_type_name || ''}::${seq}`;
    if (!undatedByGroup.has(key)) undatedByGroup.set(key, []);
    undatedByGroup.get(key).push(i);
  });
  for (const idxs of undatedByGroup.values()) {
    const seq = tripSeq(list[idxs[0]]);
    const trip = (trips || []).find((t) => Number(t.seq) === seq);
    const start = ymd(trip?.start_date);
    if (!start) continue;
    const end = ymd(trip.end_date) || start;
    idxs.forEach((i, n) => {
      let date = addDaysYmd(start, n);
      if (date > end) date = end;
      list[i].date = date;
    });
  }
  return list;
}

// Merge per-WTC day arrays. Same calendar date + same trip collapse (F3).
// Different trips on the same date stay distinct — that is the Schedule trips
// contract Field must honor. taggedDays each carry a `work_type_name`.
// `trips` is optional job_mobilizations rows so same-date pills can show TAP/Sing.
// Returns { days: [mergedDay], allTbd }.
export function mergeDaysByDate(taggedDays, trips) {
  const dated = [];
  const undated = [];
  for (const day of applyTripDates(taggedDays, trips)) {
    if (day && day.date) dated.push(day);
    else if (day) undated.push(day);
  }
  const allTbd = dated.length === 0;

  const byDateTrip = new Map();
  for (const day of dated) {
    const key = `${day.date}::${tripGroupKey(day)}`;
    if (!byDateTrip.has(key)) byDateTrip.set(key, []);
    byDateTrip.get(key).push(day);
  }

  const merged = [];
  const datedKeys = [...byDateTrip.keys()].sort((a, b) => {
    const [dateA, seqA] = a.split('::');
    const [dateB, seqB] = b.split('::');
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    if (seqA === 'none') return seqB === 'none' ? 0 : 1;
    if (seqB === 'none') return -1;
    return Number(seqA) - Number(seqB);
  });
  const dateCounts = new Map();
  for (const key of datedKeys) {
    const date = byDateTrip.get(key)[0].date;
    dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
  }
  for (const key of datedKeys) {
    const group = byDateTrip.get(key);
    const date = group[0].date;
    let label = fmtDayLabel(date);
    // Same calendar date, different trips: pills must not be identical.
    if ((dateCounts.get(date) || 0) > 1) {
      const name = tripTitle(tripSeq(group[0]), trips);
      if (name) label = `${label} · ${name}`;
    }
    merged.push(buildMergedDay(group, {
      key: `d-${key}`, date, label, isTbd: false,
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

// Live Schedule job for this call_log. Prefer the newest live row so a deleted
// predecessor (same call_log_id) cannot steal the SOW / trip lookup.
// Live = Schedule contract: jobs.deleted is TEXT ('No'/'Yes'), not deleted_at.
const LIVE_JOB_FILTER = `(deleted IS NULL OR deleted = 'No')`;
const LIVE_JOB_SQL = `(SELECT id FROM jobs WHERE call_log_id = ? AND ${LIVE_JOB_FILTER} ORDER BY id DESC LIMIT 1)`;

export default function TasksTab({ jobId, employeeId, employeeName }) {
  const db = usePowerSync();

  // Primary: canonical dated SOW from job_wtcs. job_wtcs.job_id (int8) equals the
  // Field-local jobs.id (jobs syncs `job_id AS id`), so resolve it via call_log_id.
  const { data: wtcRows, isLoading: wtcLoading } = useQuery(
    `SELECT field_sow, work_type_name, proposal_wtc_id FROM job_wtcs
      WHERE job_id = ${LIVE_JOB_SQL}
      ORDER BY position`,
    [jobId]
  );

  // Legacy fallback: jobs.field_sow mirror for pre-vertical jobs with no job_wtcs.
  const { data: jobRows, isLoading: jobsLoading } = useQuery(
    `SELECT field_sow, size, size_unit, lead FROM jobs
      WHERE call_log_id = ? AND ${LIVE_JOB_FILTER}
      ORDER BY id DESC LIMIT 1`,
    [jobId]
  );

  // Schedule crew lives on assignments (job_id = jobs.id). job_crew is leftover.
  const { data: assignRows } = useQuery(
    `SELECT a.crew_name AS crew_name
       FROM assignments a
      WHERE a.job_id = ${LIVE_JOB_SQL}`,
    [jobId]
  );

  const { data: crewRows } = useQuery(
    `SELECT jc.role AS role, tm.name AS name
       FROM job_crew jc
       LEFT JOIN team_members tm ON tm.id = jc.team_member_id
      WHERE jc.job_id = ?`,
    [jobId]
  );

  const { data: tripRows } = useQuery(
    `SELECT seq, label, start_date, end_date FROM job_mobilizations
      WHERE job_id = ${LIVE_JOB_SQL}
      ORDER BY seq`,
    [jobId]
  );

  // Persistent per-material load-out confirmations. One row per material,
  // toggled via `checked`; keyed by the material's stable wtc_material_id.
  const { data: checkRows } = useQuery(
    `SELECT id, wtc_material_id, checked, check_date FROM job_material_checks WHERE job_id = ?`,
    [jobId]
  );

  const isLoading = wtcLoading || jobsLoading;
  const jobRow = jobRows?.[0] || null;

  const soldLabor = useMemo(
    () => (wtcRows || []).map(soldLaborFromSowDays).filter((row) => row.parts.length > 0),
    [wtcRows]
  );

  const crewRoster = useMemo(() => {
    const lead = (jobRow?.lead || '').trim();
    const fromAssign = uniqueNames(assignRows, 'crew_name');
    if (fromAssign.length > 0) {
      return {
        lead: lead || null,
        names: lead
          ? fromAssign.filter((n) => n.toLowerCase() !== lead.toLowerCase())
          : fromAssign,
      };
    }
    const names = [];
    let crewLead = lead;
    for (const r of (crewRows || [])) {
      const name = (r.name || '').trim();
      if (!name) continue;
      const role = String(r.role || '').toLowerCase();
      if (!crewLead && (role === 'lead' || role === 'job lead')) {
        crewLead = name;
        continue;
      }
      if (crewLead && name.toLowerCase() === crewLead.toLowerCase()) continue;
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    return { lead: crewLead || null, names };
  }, [jobRow, assignRows, crewRows]);

  const { days, allTbd } = useMemo(() => {
    // Primary: gather every WTC's days, tagged with its work type.
    if (wtcRows && wtcRows.length > 0) {
      const tagged = [];
      for (const w of wtcRows) {
        for (const day of parseJSON(w.field_sow, [])) {
          tagged.push({ ...day, work_type_name: w.work_type_name });
        }
      }
      return mergeDaysByDate(tagged, tripRows);
    }
    // Legacy: single jobs.field_sow array, no work-type tag.
    if (jobRow?.field_sow) {
      const tagged = parseJSON(jobRow.field_sow, []).map((d) => ({ ...d, work_type_name: null }));
      return mergeDaysByDate(tagged, tripRows);
    }
    return { days: [], allTbd: false };
  }, [wtcRows, jobRow, tripRows]);

  const today = tod();
  const todayIdx = useMemo(
    () => days.findIndex((d) => d.date === today),
    [days, today]
  );
  // Null = follow today (or Day 1 when no calendar day matches).
  const [userDayIdx, setUserDayIdx] = useState(null);
  const selectedDayIdx = userDayIdx != null
    ? userDayIdx
    : (todayIdx >= 0 ? todayIdx : 0);
  // Which material rows are expanded to show full specs (view state only).
  const [expandedMats, setExpandedMats] = useState(() => new Set());
  const currentDay = days[selectedDayIdx] || null;
  const isHistoricalDay = isHistoricalSowWorkDate(currentDay?.date, today);

  // wtc_material_id → persisted check row ({ id, checked }).
  const checkByMat = useMemo(() => {
    const m = new Map();
    for (const r of (checkRows || [])) m.set(r.wtc_material_id, r);
    return m;
  }, [checkRows]);

  const toggleExpand = (matKey) => setExpandedMats((prev) => {
    const next = new Set(prev);
    next.has(matKey) ? next.delete(matKey) : next.add(matKey);
    return next;
  });

  // Persist today's load-out. A check from another day must not look loaded
  // this morning — the office still has the row; the phone starts the day empty.
  const toggleCheck = async (mat) => {
    if (isHistoricalSowWorkDate(currentDay?.date, today)) return;
    const matId = mat.wtc_material_id;
    if (!matId) return; // no stable id → cannot persist safely
    let actorId;
    try {
      actorId = requireCanonicalTeamMemberId(employeeId, 'material check write');
    } catch (e) {
      if (isMissingTeamMemberIdError(e)) {
        Alert.alert('Field Command not active', 'Your account is not activated for Field Command.');
        return;
      }
      throw e;
    }
    const existing = checkByMat.get(matId);
    const now = new Date().toISOString();
    const checkedToday = !!(existing && existing.checked && existing.check_date === today);
    if (existing) {
      await db.execute(
        `UPDATE job_material_checks SET checked=?, check_date=?, checked_by=?, checked_by_name=?, updated_at=? WHERE id=?`,
        [checkedToday ? 0 : 1, today, actorId, employeeName || null, now, existing.id]
      );
    } else {
      await db.execute(
        `INSERT INTO job_material_checks
           (id, job_id, wtc_material_id, check_date, material_name, checked, checked_by, checked_by_name, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?,?,?)`,
        [generateId(), jobId, matId, today, mat.name || null, actorId, employeeName || null, now, now]
      );
    }
  };

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
      {soldLabor.length > 0 && (
        <View style={styles.laborCard}>
          <Text style={styles.laborKicker}>SOW LABOR</Text>
          {soldLabor.map((row) => (
            <View key={row.key} style={styles.laborRow}>
              <Text style={styles.laborTrade}>{row.name.toUpperCase()}</Text>
              <Text style={styles.laborLine}>{row.parts.join('   ·   ')}</Text>
              {row.each ? <Text style={styles.laborEach}>{row.each} HRS EACH</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.crewCard}>
        <Text style={styles.crewKicker}>CREW</Text>
        {crewRoster.lead ? (
          <Text style={styles.crewLead}>LEAD  {crewRoster.lead}</Text>
        ) : (
          <Text style={styles.crewEmpty}>Lead not assigned</Text>
        )}
        {crewRoster.names.length > 0 ? (
          <Text style={styles.crewNames}>{crewRoster.names.join('  ·  ')}</Text>
        ) : (
          <Text style={styles.crewEmpty}>Crew not assigned</Text>
        )}
      </View>

      {allTbd && (
        <View style={styles.tbdBanner}>
          <Text style={styles.tbdBannerText}>DATES TBD — schedule hasn't assigned calendar dates yet</Text>
        </View>
      )}

      {/* Day Selector — TODAY jumps to the calendar day when one exists */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayScrollContent}>
        {todayIdx >= 0 && (
          <TouchableOpacity
            style={[styles.dayPill, selectedDayIdx === todayIdx && styles.dayPillActive]}
            onPress={() => setUserDayIdx(todayIdx)}
          >
            <Text style={[styles.dayPillText, selectedDayIdx === todayIdx && styles.dayPillTextActive]}>TODAY</Text>
          </TouchableOpacity>
        )}
        {days.map((day, idx) => (
          <TouchableOpacity key={day.key} style={[styles.dayPill, idx === selectedDayIdx && styles.dayPillActive]} onPress={() => setUserDayIdx(idx)}>
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
        const tripName = tripTitle(currentDay.mobilization_seq, tripRows);
        if (tripName) meta.push(tripName.toUpperCase());
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

          <Text style={styles.sectionTitle}>
            {currentDay.date === today ? "TODAY'S WORK" : 'WORK'}
          </Text>
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
              <Text style={styles.matInstruction}>Check off each material loaded in your truck today.</Text>
              <View style={styles.matTable}>
                <View style={styles.matHeadRow}>
                  <Text style={[styles.matHeadCell, { flex: 1 }]}>MATERIAL</Text>
                  <Text style={[styles.matHeadCell, styles.matColQty]}>QTY</Text>
                  <Text style={[styles.matHeadCell, styles.matChevCol]}> </Text>
                </View>
                {currentDay.materials.map((mat, idx) => {
                  const matKey = `${currentDay.key}:${mat.wtc_material_id || idx}`;
                  const checkRow = mat.wtc_material_id ? checkByMat.get(mat.wtc_material_id) : null;
                  const matchDate = materialCheckMatchDate(currentDay.date, today);
                  const checked = !!(checkRow && checkRow.checked && checkRow.check_date === matchDate);
                  const expanded = expandedMats.has(matKey);
                  const qty = Number(mat.qty_planned) || 0;
                  // Full spec set — string values shown verbatim (mix_time etc. carry
                  // their own units, e.g. "5 min"). Only fields that are present show.
                  const specs = [
                    ['Kit size', mat.kit_size],
                    ['Mix time', mat.mix_time],
                    ['Mix speed', mat.mix_speed],
                    ['Cure time', mat.cure_time],
                    ['Coverage', mat.coverage_rate],
                    ['Mils', mat.mils],
                  ].filter(([, v]) => v != null && String(v).trim() !== '');
                  return (
                    <View key={matKey} style={styles.matItem}>
                      <View style={styles.matRow}>
                        <TouchableOpacity
                          style={[styles.checkbox, checked && styles.checkboxOn]}
                          onPress={() => toggleCheck(mat)}
                          disabled={isHistoricalDay}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 6 }}
                          activeOpacity={isHistoricalDay ? 1 : 0.7}
                        >
                          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.matRowBody}
                          onPress={() => specs.length && toggleExpand(matKey)}
                          activeOpacity={specs.length ? 0.7 : 1}
                        >
                          <Text style={[styles.matName, checked && styles.matNameChecked]} numberOfLines={2}>{mat.name || 'Unknown material'}</Text>
                          <View style={styles.matColQty}>
                            <Text style={styles.matQtyNum}>{qty > 0 ? qty : '—'}</Text>
                            {mat.kit_size ? <Text style={styles.matQtyUnit}>{mat.kit_size}</Text> : null}
                          </View>
                          <Text style={styles.chevron}>{specs.length ? (expanded ? '▾' : '▸') : ''}</Text>
                        </TouchableOpacity>
                      </View>
                      {expanded && specs.length > 0 && (
                        <View style={styles.specBlock}>
                          {specs.map(([label, value]) => (
                            <View key={label} style={styles.specRow}>
                              <Text style={styles.specLabel}>{label}</Text>
                              <Text style={styles.specValue}>{String(value)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
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
  laborCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginBottom: S.sm },
  laborKicker: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 2, marginBottom: 8 },
  laborRow: { marginBottom: 8 },
  laborTrade: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 1, marginBottom: 2 },
  laborLine: { fontFamily: F.displayMed, fontSize: 13, color: C.teal, letterSpacing: 1 },
  laborEach: { fontFamily: F.bodyMed, fontSize: 12, color: C.textFaint, marginTop: 2, letterSpacing: 0.5 },
  crewCard: {
    backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, marginBottom: S.md,
    borderWidth: 1, borderColor: C.borderStrong,
  },
  crewKicker: { fontFamily: F.display, fontSize: 11, color: C.textMuted, letterSpacing: 2, marginBottom: 6 },
  crewLead: { fontFamily: F.display, fontSize: 15, color: C.textHead, letterSpacing: 1, textTransform: 'uppercase' },
  crewNames: { fontFamily: F.bodyMed, fontSize: 14, color: C.textBody, marginTop: 4 },
  crewEmpty: { fontFamily: F.body, fontSize: 13, color: C.textFaint, fontStyle: 'italic', marginTop: 2 },
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
  matInstruction: { fontFamily: F.body, fontSize: 13, color: C.textLight, fontStyle: 'italic', marginTop: -2, marginBottom: S.sm },
  matTable: { backgroundColor: C.linenCard, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, overflow: 'hidden' },
  matHeadRow: { flexDirection: 'row', backgroundColor: C.dark, paddingVertical: 8, paddingHorizontal: S.md },
  matHeadCell: { fontFamily: F.display, fontSize: 11, color: C.textFaint, letterSpacing: 1.5 },
  matChevCol: { width: 24, textAlign: 'center' },
  matItem: { borderTopWidth: 1, borderTopColor: C.border },
  matRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: S.md },
  matRowBody: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  matColQty: { width: 72, paddingRight: S.sm },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: C.textFaint, marginRight: S.sm, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.dark, borderColor: C.teal },
  checkMark: { fontFamily: F.bodyBold, fontSize: 13, color: C.teal, lineHeight: 16 },
  matName: { fontFamily: F.bodyMed, fontSize: 14, color: C.textBody, flex: 1, paddingRight: S.sm },
  matNameChecked: { color: C.textFaint, textDecorationLine: 'line-through' },
  matQtyNum: { fontFamily: F.display, fontSize: 16, color: C.textHead },
  matQtyUnit: { fontFamily: F.body, fontSize: 11, color: C.textLight, marginTop: -1 },
  chevron: { width: 24, textAlign: 'center', fontFamily: F.body, fontSize: 14, color: C.textMuted },
  specBlock: { paddingHorizontal: S.md, paddingTop: 2, paddingBottom: 10, backgroundColor: C.linenDeep },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3 },
  specLabel: { fontFamily: F.display, fontSize: 11, color: C.textMuted, letterSpacing: 1 },
  specValue: { fontFamily: F.body, fontSize: 13, color: C.textBody, flexShrink: 1, textAlign: 'right', marginLeft: S.md },
  targetCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginTop: S.lg, alignItems: 'center' },
  targetLabel: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: 4 },
  targetValue: { fontFamily: F.display, fontSize: 28, color: C.teal, letterSpacing: 1 },
  targetSub: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },
});
