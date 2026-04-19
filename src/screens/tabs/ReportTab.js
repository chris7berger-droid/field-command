/**
 * Report Tab — PRT (Production Rate Tracker) + Daily Log
 *
 * PRT: Crew enters daily % per Field SOW task, compared to target.
 *      Notes required per task. Creates Hawthorne Effect for self-improvement.
 *
 * Daily Log: SOD/MOD/EOD + optional extra entries.
 *            Each entry = photos + required note, submitted individually.
 *            Photos upload to Cloudflare R2 via upload-photo edge function.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Image,
  Alert, StyleSheet, Vibration,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePowerSync, useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, fmtPct, tod } from '../../lib/utils';
import { uploadPhotos } from '../../lib/photos';
import LinenBackground from '../../components/LinenBackground';

const LOG_TYPES = [
  { key: 'SOD', label: 'START OF DAY', hint: 'Photos of job site at start' },
  { key: 'MOD', label: 'MID DAY', hint: 'Photos of progress' },
  { key: 'EOD', label: 'END OF DAY', hint: 'How the site was left + all progress' },
];

export default function ReportTab({ jobId, employeeId }) {
  const db = usePowerSync();
  const today = tod();
  const [section, setSection] = useState('prt'); // 'prt' | 'log'

  // ── Field SOW data ──────────────────────────────────────
  const { data: jobRows } = useQuery(
    `SELECT field_sow FROM jobs WHERE call_log_id = ? LIMIT 1`,
    [jobId]
  );
  const { data: wtcRows } = useQuery(
    `SELECT * FROM proposal_wtc WHERE field_sow IS NOT NULL LIMIT 10`
  );
  const jobRow = jobRows?.[0] || null;
  const wtc = wtcRows?.[0] || null;
  const fieldSow = useMemo(() => {
    if (jobRow?.field_sow) return parseJSON(jobRow.field_sow, []);
    if (wtc?.field_sow) return parseJSON(wtc.field_sow, []);
    return [];
  }, [jobRow, wtc]);

  // Unique tasks from all days with their target %
  const sowTasks = useMemo(() => {
    const tasks = [];
    fieldSow.forEach((day) => {
      (day.tasks || []).forEach((t) => {
        if (!tasks.find((ex) => ex.description === t.description)) {
          tasks.push({ id: t.id, description: t.description, target_pct: t.pct_complete || 0 });
        }
      });
    });
    return tasks;
  }, [fieldSow]);

  // ── PRT State ───────────────────────────────────────────
  const { data: existingReports } = useQuery(
    `SELECT * FROM daily_production_reports WHERE job_id = ? AND report_date = ? LIMIT 1`,
    [jobId, today]
  );
  const existingReport = existingReports?.[0] || null;
  const prtSubmitted = existingReport?.status === 'submitted' || existingReport?.status === 'approved';

  const [taskEntries, setTaskEntries] = useState([]);
  const [prtSubmitting, setPrtSubmitting] = useState(false);

  useEffect(() => {
    if (existingReport && existingReport.status === 'draft') {
      setTaskEntries(parseJSON(existingReport.tasks, []));
    } else if (!existingReport && sowTasks.length > 0 && taskEntries.length === 0) {
      setTaskEntries(sowTasks.map((t) => ({ description: t.description, target_pct: t.target_pct, pct_today: 0, notes: '' })));
    }
  }, [existingReport, sowTasks]);

  const updateTask = useCallback((idx, field, value) => {
    setTaskEntries((prev) => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
  }, []);

  // ── Daily Log State ─────────────────────────────────────
  const { data: logEntries, isLoading: logLoading } = useQuery(
    `SELECT * FROM daily_log_entries WHERE job_id = ? AND created_at >= ? ORDER BY created_at ASC`,
    [jobId, today + 'T00:00:00']
  );

  const submittedTypes = useMemo(() => {
    return new Set((logEntries || []).map(e => e.entry_type));
  }, [logEntries]);

  const [logType, setLogType] = useState(null); // which log entry is being composed
  const [logPhotos, setLogPhotos] = useState([]);
  const [logNotes, setLogNotes] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);

  // ── Photo helpers ───────────────────────────────────────
  const pickPhoto = useCallback(async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled && result.assets) setter((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  }, []);

  const takePhoto = useCallback(async (setter) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets) setter((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  }, []);

  // ── PRT Submit ──────────────────────────────────────────
  const submitPRT = useCallback(async () => {
    const missing = taskEntries.find(t => !t.notes || !t.notes.trim());
    if (missing) { Alert.alert('Notes required', 'Every task needs a note before submitting.'); return; }

    setPrtSubmitting(true);
    try {
      const data = {
        tasks: JSON.stringify(taskEntries),
        materials_used: '[]',
        hours_regular: 0, hours_ot: 0,
        photos: '[]',
        notes: 'PRT submission',
        status: 'submitted',
      };

      if (existingReport) {
        await db.execute(
          `UPDATE daily_production_reports SET tasks=?, materials_used=?, hours_regular=?, hours_ot=?, photos=?, notes=?, status=?, synced=0 WHERE id=?`,
          [data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, existingReport.id]
        );
      } else {
        const id = generateId();
        await db.execute(
          `INSERT INTO daily_production_reports (id,job_id,wtc_id,report_date,submitted_by,tasks,materials_used,hours_regular,hours_ot,photos,notes,status,synced,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
          [id, jobId, wtc?.id || '', today, employeeId, data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, new Date().toISOString()]
        );
      }
      Vibration.vibrate([100, 50, 100]);
    } finally {
      setPrtSubmitting(false);
    }
  }, [taskEntries, existingReport, jobId, employeeId, today, db, wtc]);

  const savePRTDraft = useCallback(async () => {
    const data = {
      tasks: JSON.stringify(taskEntries),
      materials_used: '[]',
      hours_regular: 0, hours_ot: 0,
      photos: '[]',
      notes: 'PRT draft',
      status: 'draft',
    };

    if (existingReport) {
      await db.execute(
        `UPDATE daily_production_reports SET tasks=?, status=?, synced=0 WHERE id=?`,
        [data.tasks, data.status, existingReport.id]
      );
    } else {
      const id = generateId();
      await db.execute(
        `INSERT INTO daily_production_reports (id,job_id,wtc_id,report_date,submitted_by,tasks,materials_used,hours_regular,hours_ot,photos,notes,status,synced,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
        [id, jobId, wtc?.id || '', today, employeeId, data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, new Date().toISOString()]
      );
    }
    Vibration.vibrate(50);
  }, [taskEntries, existingReport, jobId, employeeId, today, db, wtc]);

  // ── Daily Log Submit (optimistic — save immediately, upload photos in background) ──
  const submitLogEntry = useCallback(async () => {
    if (!logNotes.trim()) { Alert.alert('Note required', 'Add a note before submitting.'); return; }
    if (logPhotos.length === 0) { Alert.alert('Photos required', 'Add at least one photo.'); return; }

    setLogSubmitting(true);
    try {
      // Save entry immediately with local photo URIs
      const id = generateId();
      const localUris = [...logPhotos];
      await db.execute(
        `INSERT INTO daily_log_entries (id, job_id, employee_id, entry_type, photos, notes, synced, created_at) VALUES (?,?,?,?,?,?,0,?)`,
        [id, jobId, employeeId, logType, JSON.stringify(localUris), logNotes.trim(), new Date().toISOString()]
      );

      // Reset form
      setLogPhotos([]);
      setLogNotes('');
      setLogType(null);
      // Reset form immediately — crew sees instant success
      setLogPhotos([]);
      setLogNotes('');
      setLogType(null);
      Vibration.vibrate([100, 50, 100]);

      // Upload photos to R2 in background, then patch the entry
      const photosToUpload = localUris.filter((p) => p.startsWith('file://') || p.startsWith('ph://'));
      if (photosToUpload.length > 0) {
        uploadPhotos(photosToUpload, jobId).then(async (results) => {
          const failed = results.filter((r) => r.error);
          if (failed.length > 0) {
            console.warn(`${failed.length} photo(s) failed to upload for log entry ${id}`);
            // Keep local URIs for failed ones so they can be retried
          }
          // Build final URL list: replace successful uploads, keep local URIs for failures
          const finalPhotos = localUris.map((uri) => {
            const uploaded = results.find((r) => r.uri === uri && r.public_url);
            return uploaded ? uploaded.public_url : uri;
          });
          await db.execute(
            `UPDATE daily_log_entries SET photos=?, synced=0 WHERE id=?`,
            [JSON.stringify(finalPhotos), id]
          );
        }).catch((err) => {
          console.error('Background photo upload failed:', err);
        });
      }
    } finally {
      setLogSubmitting(false);
    }
  }, [logType, logPhotos, logNotes, jobId, employeeId, db]);

  // ── Render ──────────────────────────────────────────────
  return (
    <LinenBackground>
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

        {/* Section Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, section === 'prt' && styles.toggleBtnActive]} onPress={() => setSection('prt')}>
            <Text style={[styles.toggleText, section === 'prt' && styles.toggleTextActive]}>PRT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, section === 'log' && styles.toggleBtnActive]} onPress={() => setSection('log')}>
            <Text style={[styles.toggleText, section === 'log' && styles.toggleTextActive]}>DAILY LOG</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ PRT Section ═══ */}
        {section === 'prt' && (
          <>
            <Text style={styles.sectionTitle}>PRODUCTION RATE TRACKER</Text>
            <Text style={styles.sectionHint}>Enter your daily % for each task. Hit the target or beat it.</Text>

            {prtSubmitted ? (
              <View style={styles.submittedCard}>
                <Text style={styles.submittedTitle}>PRT SUBMITTED</Text>
                <Text style={styles.submittedBody}>Today's production rates have been recorded.</Text>
                {parseJSON(existingReport?.tasks, []).map((t, idx) => (
                  <View key={idx} style={styles.submittedTask}>
                    <Text style={styles.submittedTaskName}>{t.description}</Text>
                    <View style={styles.submittedPctRow}>
                      <View style={styles.pctChip}>
                        <Text style={styles.pctChipLabel}>TODAY</Text>
                        <Text style={[styles.pctChipValue, t.pct_today >= t.target_pct ? { color: C.teal } : { color: C.amber }]}>{t.pct_today}%</Text>
                      </View>
                      <View style={styles.pctChip}>
                        <Text style={styles.pctChipLabel}>TARGET</Text>
                        <Text style={styles.pctChipValue}>{t.target_pct}%</Text>
                      </View>
                    </View>
                    {t.notes ? <Text style={styles.submittedNotes}>{t.notes}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <>
                {taskEntries.map((task, idx) => {
                  const hit = task.pct_today >= task.target_pct;
                  return (
                    <View key={idx} style={styles.taskCard}>
                      <Text style={styles.taskName}>{task.description || `Task ${idx + 1}`}</Text>

                      {/* Target vs Actual */}
                      <View style={styles.compareRow}>
                        <View style={styles.compareBlock}>
                          <Text style={styles.compareLabel}>TARGET</Text>
                          <Text style={styles.compareTarget}>{task.target_pct}%</Text>
                        </View>
                        <View style={styles.compareBlock}>
                          <Text style={styles.compareLabel}>TODAY</Text>
                          <TextInput
                            style={[styles.pctInput, hit && styles.pctInputHit]}
                            value={String(task.pct_today || '')}
                            onChangeText={(v) => updateTask(idx, 'pct_today', parseFloat(v) || 0)}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={C.textFaint}
                            maxLength={3}
                          />
                        </View>
                        <View style={styles.compareBlock}>
                          {task.pct_today > 0 && (
                            <View style={[styles.resultBadge, hit ? styles.resultHit : styles.resultMiss]}>
                              <Text style={styles.resultText}>{hit ? 'ON TRACK' : 'BEHIND'}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressTarget, { width: `${Math.min(task.target_pct, 100)}%` }]} />
                        <View style={[styles.progressActual, hit ? styles.progressHit : styles.progressMiss, { width: `${Math.min(task.pct_today || 0, 100)}%` }]} />
                      </View>

                      {/* Notes — required */}
                      <TextInput
                        style={styles.taskNoteInput}
                        value={task.notes}
                        onChangeText={(v) => updateTask(idx, 'notes', v)}
                        placeholder="Note required — what happened today"
                        placeholderTextColor={C.textFaint}
                        multiline
                      />
                    </View>
                  );
                })}

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.draftBtn} onPress={savePRTDraft}>
                    <Text style={styles.draftBtnText}>SAVE DRAFT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, prtSubmitting && { opacity: 0.5 }]} onPress={submitPRT} disabled={prtSubmitting}>
                    <Text style={styles.submitBtnText}>{prtSubmitting ? 'SUBMITTING...' : 'SUBMIT PRT'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {/* ═══ Daily Log Section ═══ */}
        {section === 'log' && (
          <>
            <Text style={styles.sectionTitle}>DAILY LOG</Text>
            <Text style={styles.sectionHint}>Photo + note entries throughout the day. SOD, MOD, EOD required.</Text>

            {/* Status pills */}
            <View style={styles.logStatusRow}>
              {LOG_TYPES.map((lt) => {
                const done = submittedTypes.has(lt.key);
                return (
                  <View key={lt.key} style={[styles.logStatusPill, done && styles.logStatusDone]}>
                    <Text style={[styles.logStatusText, done && styles.logStatusTextDone]}>{lt.key}</Text>
                    <Text style={styles.logStatusCheck}>{done ? '\u2713' : '\u25CB'}</Text>
                  </View>
                );
              })}
            </View>

            {/* Submitted entries */}
            {(logEntries || []).length > 0 && (
              <View style={styles.logHistory}>
                {(logEntries || []).map((entry) => {
                  const photos = parseJSON(entry.photos, []);
                  return (
                    <View key={entry.id} style={styles.logEntryCard}>
                      <View style={styles.logEntryHeader}>
                        <View style={styles.logTypeBadge}><Text style={styles.logTypeText}>{entry.entry_type}</Text></View>
                        <Text style={styles.logEntryTime}>{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logPhotoScroll}>
                          {photos.map((uri, i) => (
                            <Image key={i} source={{ uri }} style={styles.logPhotoThumb} />
                          ))}
                        </ScrollView>
                      )}
                      <Text style={styles.logEntryNotes}>{entry.notes}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* New entry composer */}
            {logType ? (
              <View style={styles.composerCard}>
                <View style={styles.composerHeader}>
                  <View style={styles.logTypeBadge}><Text style={styles.logTypeText}>{logType}</Text></View>
                  <TouchableOpacity onPress={() => { setLogType(null); setLogPhotos([]); setLogNotes(''); }}>
                    <Text style={styles.composerCancel}>CANCEL</Text>
                  </TouchableOpacity>
                </View>

                {/* Photos */}
                {logPhotos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logPhotoScroll}>
                    {logPhotos.map((uri, i) => (
                      <TouchableOpacity key={i} onLongPress={() => setLogPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                        <Image source={{ uri }} style={styles.logPhotoThumb} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <View style={styles.photoBtns}>
                  <TouchableOpacity style={styles.photoBtn} onPress={() => takePhoto(setLogPhotos)}>
                    <Text style={styles.photoBtnText}>TAKE PHOTO</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(setLogPhotos)}>
                    <Text style={styles.photoBtnText}>FROM LIBRARY</Text>
                  </TouchableOpacity>
                </View>
                {logPhotos.length > 0 && <Text style={styles.photoHint}>Long-press a photo to remove</Text>}

                <TextInput
                  style={styles.logNoteInput}
                  value={logNotes}
                  onChangeText={setLogNotes}
                  placeholder={LOG_TYPES.find(l => l.key === logType)?.hint || 'Describe what you see...'}
                  placeholderTextColor={C.textFaint}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[styles.submitBtn, logSubmitting && { opacity: 0.5 }]}
                  onPress={submitLogEntry}
                  disabled={logSubmitting}
                >
                  <Text style={styles.submitBtnText}>
                    {logSubmitting ? 'SAVING...' : `SUBMIT ${logType}`}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.logButtons}>
                {LOG_TYPES.map((lt) => (
                  <TouchableOpacity key={lt.key} style={[styles.logStartBtn, submittedTypes.has(lt.key) && styles.logStartBtnDone]} onPress={() => setLogType(lt.key)}>
                    <Text style={styles.logStartBtnLabel}>{lt.label}</Text>
                    <Text style={styles.logStartBtnHint}>{submittedTypes.has(lt.key) ? 'Add another' : lt.hint}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.logStartBtn} onPress={() => setLogType('OTHER')}>
                  <Text style={styles.logStartBtnLabel}>+ ADD ENTRY</Text>
                  <Text style={styles.logStartBtnHint}>Extra photos and notes anytime</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </LinenBackground>
  );
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const styles = StyleSheet.create({
  content: { padding: S.md, paddingBottom: 100 },

  // Toggle
  toggleRow: { flexDirection: 'row', backgroundColor: C.linenDeep, borderRadius: 10, padding: 3, marginBottom: S.lg, borderWidth: 1, borderColor: C.borderStrong },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: C.dark },
  toggleText: { fontFamily: F.display, fontSize: 14, color: C.textHead, letterSpacing: 2 },
  toggleTextActive: { color: C.teal },

  // Shared
  sectionTitle: { fontFamily: F.display, fontSize: 14, color: C.textMuted, letterSpacing: 2, marginBottom: 4 },
  sectionHint: { fontFamily: F.body, fontSize: 13, color: C.textFaint, marginBottom: S.md, lineHeight: 20 },

  // PRT
  taskCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.md },
  taskName: { fontFamily: F.bodySemi, fontSize: 15, color: C.textHead, marginBottom: S.sm },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  compareBlock: { flex: 1, alignItems: 'center' },
  compareLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1.5, marginBottom: 4 },
  compareTarget: { fontFamily: F.display, fontSize: 22, color: C.textMuted },
  pctInput: { backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, fontFamily: F.display, fontSize: 22, color: C.textHead, textAlign: 'center', width: 80 },
  pctInputHit: { borderWidth: 2, borderColor: C.teal },
  resultBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  resultHit: { backgroundColor: C.teal },
  resultMiss: { backgroundColor: C.amber },
  resultText: { fontFamily: F.display, fontSize: 10, color: C.dark, letterSpacing: 1 },
  progressTrack: { height: 8, backgroundColor: C.linenDeep, borderRadius: 4, overflow: 'hidden', marginBottom: S.sm },
  progressTarget: { position: 'absolute', height: '100%', backgroundColor: 'rgba(136,124,110,0.4)', borderRadius: 4 },
  progressActual: { height: '100%', borderRadius: 4 },
  progressHit: { backgroundColor: C.teal },
  progressMiss: { backgroundColor: C.amber },
  taskNoteInput: { backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontFamily: F.body, fontSize: 14, color: C.textBody, minHeight: 44 },

  actionRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  draftBtn: { flex: 1, backgroundColor: C.linenDeep, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  draftBtnText: { fontFamily: F.display, fontSize: 14, color: C.textBody, letterSpacing: 1 },
  submitBtn: { flex: 2, backgroundColor: C.dark, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 1 },

  // PRT Submitted
  submittedCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.lg, borderWidth: 1, borderColor: C.borderStrong },
  submittedTitle: { fontFamily: F.display, fontSize: 20, color: C.textHead, letterSpacing: 2, marginBottom: S.sm, textAlign: 'center' },
  submittedBody: { fontFamily: F.body, fontSize: 14, color: C.textBody, textAlign: 'center', marginBottom: S.md },
  submittedTask: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: S.sm },
  submittedTaskName: { fontFamily: F.bodySemi, fontSize: 14, color: C.textHead, marginBottom: 4 },
  submittedPctRow: { flexDirection: 'row', gap: S.md, marginBottom: 4 },
  pctChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pctChipLabel: { fontFamily: F.display, fontSize: 10, color: C.textFaint, letterSpacing: 1 },
  pctChipValue: { fontFamily: F.display, fontSize: 16, color: C.textHead },
  submittedNotes: { fontFamily: F.body, fontSize: 13, color: C.textMuted, fontStyle: 'italic' },

  // Daily Log
  logStatusRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  logStatusPill: { flex: 1, backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  logStatusDone: { backgroundColor: C.dark, borderColor: C.teal },
  logStatusText: { fontFamily: F.display, fontSize: 12, color: C.textMuted, letterSpacing: 1 },
  logStatusTextDone: { color: C.teal },
  logStatusCheck: { fontFamily: F.body, fontSize: 14, color: C.teal },

  logHistory: { marginBottom: S.md },
  logEntryCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.sm },
  logEntryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  logTypeBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  logTypeText: { fontFamily: F.display, fontSize: 12, color: C.teal, letterSpacing: 1.5 },
  logEntryTime: { fontFamily: F.body, fontSize: 13, color: C.textFaint },
  logPhotoScroll: { marginBottom: S.sm, maxHeight: 80 },
  logPhotoThumb: { width: 72, height: 72, borderRadius: 8, marginRight: 6 },
  logEntryNotes: { fontFamily: F.body, fontSize: 14, color: C.textBody, lineHeight: 20 },

  logButtons: { gap: S.sm },
  logStartBtn: { backgroundColor: C.linenCard, borderRadius: 10, paddingVertical: 16, paddingHorizontal: S.md, borderWidth: 1, borderColor: C.borderStrong },
  logStartBtnDone: { borderColor: C.teal, borderLeftWidth: 3 },
  logStartBtnLabel: { fontFamily: F.display, fontSize: 15, color: C.textHead, letterSpacing: 1.5, marginBottom: 2 },
  logStartBtnHint: { fontFamily: F.body, fontSize: 13, color: C.textFaint },

  composerCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.teal },
  composerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md },
  composerCancel: { fontFamily: F.displayMed, fontSize: 13, color: C.textMuted, letterSpacing: 1 },

  photoBtns: { flexDirection: 'row', gap: S.sm, marginBottom: 4 },
  photoBtn: { flex: 1, backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong },
  photoBtnText: { fontFamily: F.displayMed, fontSize: 12, color: C.textBody, letterSpacing: 1 },
  photoHint: { fontFamily: F.body, fontSize: 11, color: C.textFaint, textAlign: 'center', marginTop: 2, marginBottom: S.sm },

  logNoteInput: { backgroundColor: C.linenDeep, borderRadius: 10, padding: S.md, fontFamily: F.body, fontSize: 15, color: C.textBody, minHeight: 100, borderWidth: 1, borderColor: C.borderStrong, lineHeight: 22, marginBottom: S.md },
});
