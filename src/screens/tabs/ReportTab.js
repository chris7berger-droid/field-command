/**
 * Report Tab — Daily Production Report (Native Only)
 * Job Lead submits: task %, materials used, photos, notes (required).
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Image,
  Alert, StyleSheet, Vibration,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePowerSync, useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, fmtPct, fmtHrs, tod } from '../../lib/utils';
import { uploadPhotos } from '../../lib/photos';
import LinenBackground from '../../components/LinenBackground';

export default function ReportTab({ jobId, employeeId }) {
  const db = usePowerSync();
  const today = tod();

  const { data: existingReports } = useQuery(
    `SELECT * FROM daily_production_reports WHERE job_id = ? AND report_date = ? LIMIT 1`,
    [jobId, today]
  );
  const existingReport = existingReports?.[0] || null;
  const isSubmitted = existingReport?.status === 'submitted' || existingReport?.status === 'approved';

  // Primary: read field_sow from jobs table (linked via call_log_id = jobId)
  const { data: jobRows } = useQuery(
    `SELECT field_sow FROM jobs WHERE call_log_id = ? LIMIT 1`,
    [jobId]
  );

  // Fallback: legacy path via proposal_wtc for jobs without a jobs row
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

  const { data: punches } = useQuery(
    `SELECT * FROM time_punches WHERE job_id = ? AND punch_date = ? ORDER BY punch_time ASC`,
    [jobId, today]
  );

  const hours = useMemo(() => {
    if (!punches || punches.length === 0) return { regular: 0, ot: 0 };
    let totalMs = 0, clockInTime = null, lunchMs = 0, lunchStartTime = null;
    for (const p of punches) {
      const t = new Date(p.punch_time).getTime();
      if (p.punch_type === 'clock_in') clockInTime = t;
      if (p.punch_type === 'clock_out' && clockInTime) { totalMs += t - clockInTime; clockInTime = null; }
      if (p.punch_type === 'lunch_start') lunchStartTime = t;
      if (p.punch_type === 'lunch_end' && lunchStartTime) { lunchMs += t - lunchStartTime; lunchStartTime = null; }
    }
    const netMs = Math.max(0, totalMs - lunchMs);
    const totalHrs = netMs / 3600000;
    return { regular: Math.round(Math.min(totalHrs, 8) * 10) / 10, ot: Math.round(Math.max(0, totalHrs - 8) * 10) / 10 };
  }, [punches]);

  const [taskEntries, setTaskEntries] = useState([]);
  const [materialEntries, setMaterialEntries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    if (existingReport && existingReport.status === 'draft') {
      setTaskEntries(parseJSON(existingReport.tasks, []));
      setMaterialEntries(parseJSON(existingReport.materials_used, []));
      setPhotos(parseJSON(existingReport.photos, []));
      setNotes(existingReport.notes || '');
    } else if (sowTasks.length > 0 && taskEntries.length === 0) {
      setTaskEntries(sowTasks.map((t) => ({ description: t.description, pct_complete_today: 0, cumulative_pct: 0, notes: '' })));
    }
  }, [existingReport, sowTasks]);

  useEffect(() => {
    if (materialEntries.length > 0) return;
    const mats = [];
    fieldSow.forEach((day) => {
      (day.materials || []).forEach((m) => {
        if (!mats.find((ex) => ex.name === m.name)) mats.push({ name: m.name, qty_used: 0 });
      });
    });
    if (mats.length > 0) setMaterialEntries(mats);
  }, [fieldSow]);

  const updateTask = useCallback((idx, field, value) => {
    setTaskEntries((prev) => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
  }, []);
  const addTask = useCallback(() => {
    setTaskEntries((prev) => [...prev, { description: '', pct_complete_today: 0, cumulative_pct: 0, notes: '' }]);
  }, []);
  const removeTask = useCallback((idx) => {
    setTaskEntries((prev) => prev.filter((_, i) => i !== idx));
  }, []);
  const updateMaterial = useCallback((idx, value) => {
    setMaterialEntries((prev) => { const u = [...prev]; u[idx] = { ...u[idx], qty_used: parseFloat(value) || 0 }; return u; });
  }, []);
  const addMaterial = useCallback(() => {
    setMaterialEntries((prev) => [...prev, { name: '', qty_used: 0 }]);
  }, []);
  const removeMaterial = useCallback((idx) => {
    setMaterialEntries((prev) => prev.filter((_, i) => i !== idx));
  }, []);
  const updateMaterialName = useCallback((idx, value) => {
    setMaterialEntries((prev) => { const u = [...prev]; u[idx] = { ...u[idx], name: value }; return u; });
  }, []);

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled && result.assets) setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  }, []);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets) setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
  }, []);

  const removePhoto = useCallback((idx) => { setPhotos((prev) => prev.filter((_, i) => i !== idx)); }, []);

  function buildReportData(status) {
    return {
      job_id: jobId, wtc_id: wtc?.id || '',
      report_date: today, submitted_by: employeeId,
      tasks: JSON.stringify(taskEntries), materials_used: JSON.stringify(materialEntries),
      hours_regular: hours.regular, hours_ot: hours.ot,
      photos: JSON.stringify(photos), notes: notes.trim(), status,
      synced: 0, created_at: new Date().toISOString(),
    };
  }

  async function upsertReport(data) {
    if (existingReport) {
      await db.execute(
        `UPDATE daily_production_reports SET tasks=?, materials_used=?, hours_regular=?, hours_ot=?, photos=?, notes=?, status=?, synced=0 WHERE id=?`,
        [data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, existingReport.id]
      );
    } else {
      const id = generateId();
      await db.execute(
        `INSERT INTO daily_production_reports (id,job_id,wtc_id,report_date,submitted_by,tasks,materials_used,hours_regular,hours_ot,photos,notes,status,synced,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
        [id, data.job_id, data.wtc_id, data.report_date, data.submitted_by, data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, data.created_at]
      );
    }
  }

  const saveDraft = useCallback(async () => { await upsertReport(buildReportData('draft')); Vibration.vibrate(50); }, [taskEntries, materialEntries, photos, notes, hours]);

  const handleSubmit = useCallback(async () => {
    if (!notes.trim()) { Alert.alert('Notes required', 'Please add notes before submitting.'); return; }
    Alert.alert('Submit Report', 'Once submitted, this goes to the manager approval queue. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: async () => {
        setSubmitting(true);
        try {
          // Upload any local photos to R2
          const localPhotos = photos.filter((p) => p.startsWith('file://') || p.startsWith('ph://'));
          const alreadyUploaded = photos.filter((p) => !p.startsWith('file://') && !p.startsWith('ph://'));
          let finalPhotos = [...alreadyUploaded];

          if (localPhotos.length > 0) {
            setUploadProgress({ done: 0, total: localPhotos.length });
            const results = await uploadPhotos(localPhotos, jobId, (done, total) => {
              setUploadProgress({ done, total });
            });
            const failed = results.filter((r) => r.error);
            if (failed.length > 0) {
              Alert.alert('Upload Error', `${failed.length} photo(s) failed to upload. Please try again.`);
              setSubmitting(false);
              setUploadProgress(null);
              return;
            }
            finalPhotos = [...finalPhotos, ...results.map((r) => r.public_url)];
          }
          setUploadProgress(null);

          const data = buildReportData('submitted');
          data.photos = JSON.stringify(finalPhotos);
          await upsertReport(data);
          setPhotos(finalPhotos);
          Vibration.vibrate([100, 50, 100]);
        } finally {
          setSubmitting(false);
          setUploadProgress(null);
        }
      }},
    ]);
  }, [taskEntries, materialEntries, photos, notes, hours, jobId]);

  if (isSubmitted) {
    return (
      <LinenBackground>
        <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content}>
          <View style={styles.submittedCard}>
            <Text style={styles.submittedTitle}>REPORT SUBMITTED</Text>
            <Text style={styles.submittedBody}>Today's report has been submitted to the manager approval queue.</Text>
            <View style={styles.submittedMeta}>
              <Text style={styles.submittedLabel}>Hours</Text>
              <Text style={styles.submittedValue}>{fmtHrs(existingReport.hours_regular)}{existingReport.hours_ot > 0 ? ` + ${fmtHrs(existingReport.hours_ot)} OT` : ''}</Text>
            </View>
            <View style={styles.submittedMeta}>
              <Text style={styles.submittedLabel}>Status</Text>
              <View style={styles.statusBadge}><Text style={styles.statusText}>{existingReport.status === 'approved' ? 'APPROVED' : 'PENDING REVIEW'}</Text></View>
            </View>
          </View>
        </ScrollView>
      </LinenBackground>
    );
  }

  return (
    <LinenBackground>
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled>
      <View style={styles.hoursCard}>
        <Text style={styles.hoursTitle}>TODAY'S HOURS</Text>
        <View style={styles.hoursRow}>
          <View style={styles.hourBlock}><Text style={styles.hourValue}>{hours.regular}</Text><Text style={styles.hourLabel}>Regular</Text></View>
          {hours.ot > 0 && <View style={styles.hourBlock}><Text style={[styles.hourValue, { color: C.amber }]}>{hours.ot}</Text><Text style={styles.hourLabel}>Overtime</Text></View>}
          <View style={styles.hourBlock}><Text style={styles.hourValue}>{Math.round((hours.regular + hours.ot) * 10) / 10}</Text><Text style={styles.hourLabel}>Total</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>TASK COMPLETION</Text>
      {taskEntries.map((task, idx) => (
        <View key={idx} style={styles.taskCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={[styles.taskName, { flex: 1 }]} numberOfLines={2}>{task.description || `Task ${idx + 1}`}</Text>
            <TouchableOpacity onPress={() => removeTask(idx)} style={styles.removeBtn}><Text style={styles.removeBtnText}>X</Text></TouchableOpacity>
          </View>
          <View style={styles.taskFields}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>% TODAY</Text>
              <TextInput style={styles.pctInput} value={String(task.pct_complete_today || '')} onChangeText={(v) => updateTask(idx, 'pct_complete_today', parseFloat(v) || 0)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.textFaint} maxLength={3} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CUMULATIVE %</Text>
              <TextInput style={styles.pctInput} value={String(task.cumulative_pct || '')} onChangeText={(v) => updateTask(idx, 'cumulative_pct', parseFloat(v) || 0)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.textFaint} maxLength={3} />
            </View>
          </View>
          <TextInput style={styles.taskNoteInput} value={task.notes} onChangeText={(v) => updateTask(idx, 'notes', v)} placeholder="Task notes (optional)" placeholderTextColor={C.textFaint} multiline />
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={addTask}><Text style={styles.addBtnText}>+ ADD TASK</Text></TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>MATERIALS USED</Text>
      {materialEntries.map((mat, idx) => (
        <View key={idx} style={styles.materialRow}>
          <TextInput style={styles.materialNameInput} value={mat.name} onChangeText={(v) => updateMaterialName(idx, v)} placeholder="Material name" placeholderTextColor={C.textFaint} />
          <TextInput style={styles.materialQtyInput} value={String(mat.qty_used || '')} onChangeText={(v) => updateMaterial(idx, v)} keyboardType="numeric" placeholder="Qty" placeholderTextColor={C.textFaint} />
          <TouchableOpacity onPress={() => removeMaterial(idx)} style={styles.removeBtn}><Text style={styles.removeBtnText}>X</Text></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={addMaterial}><Text style={styles.addBtnText}>+ ADD MATERIAL</Text></TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>PHOTOS</Text>
      <View style={styles.photoRow}>
        {photos.map((uri, idx) => (
          <TouchableOpacity key={idx} style={styles.photoThumb} onLongPress={() => removePhoto(idx)}>
            <Image source={{ uri }} style={styles.photoImage} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.photoBtns}>
        <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}><Text style={styles.photoBtnText}>TAKE PHOTO</Text></TouchableOpacity>
        <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}><Text style={styles.photoBtnText}>FROM LIBRARY</Text></TouchableOpacity>
      </View>
      <Text style={styles.photoHint}>Long-press a photo to remove it</Text>

      <Text style={[styles.sectionTitle, { marginTop: S.lg }]}>NOTES <Text style={styles.required}>*REQUIRED</Text></Text>
      <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes} placeholder="Describe today's work, conditions, issues..." placeholderTextColor={C.textFaint} multiline textAlignVertical="top" />

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.draftBtn} onPress={saveDraft}><Text style={styles.draftBtnText}>SAVE DRAFT</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.submitBtnText}>
            {uploadProgress ? `UPLOADING ${uploadProgress.done}/${uploadProgress.total}...` : submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
          </Text>
        </TouchableOpacity>
      </View>
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
  screen: { flex: 1, backgroundColor: C.linen },
  content: { padding: S.md, paddingBottom: 100 },
  hoursCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginBottom: S.lg },
  hoursTitle: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: S.sm, textAlign: 'center' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-evenly' },
  hourBlock: { alignItems: 'center' },
  hourValue: { fontFamily: F.display, fontSize: 28, color: C.teal },
  hourLabel: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },
  sectionTitle: { fontFamily: F.display, fontSize: 13, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  required: { fontFamily: F.bodyMed, fontSize: 11, color: C.red, letterSpacing: 1 },
  taskCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, borderWidth: 1, borderColor: C.borderStrong, marginBottom: S.sm },
  taskName: { fontFamily: F.bodySemi, fontSize: 15, color: C.textHead, marginBottom: S.sm },
  taskFields: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
  fieldGroup: { flex: 1 },
  fieldLabel: { fontFamily: F.display, fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 4 },
  pctInput: { backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 18, color: C.textHead, textAlign: 'center' },
  taskNoteInput: { backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontFamily: F.body, fontSize: 14, color: C.textBody, minHeight: 40 },
  addBtn: { borderWidth: 1, borderColor: C.borderStrong, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: S.sm },
  addBtnText: { fontFamily: F.displayMed, fontSize: 13, color: C.tealDark, letterSpacing: 1 },
  materialRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.sm },
  materialNameInput: { flex: 1, backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontFamily: F.body, fontSize: 14, color: C.textBody, borderWidth: 1, borderColor: C.borderStrong },
  materialQtyInput: { width: 80, backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontFamily: F.bodyMed, fontSize: 16, color: C.textHead, textAlign: 'center', borderWidth: 1, borderColor: C.borderStrong },
  removeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.linenDeep, alignItems: 'center', justifyContent: 'center', marginLeft: S.sm },
  removeBtnText: { fontFamily: F.display, fontSize: 12, color: C.textMuted },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginBottom: S.sm },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.borderStrong },
  photoImage: { width: '100%', height: '100%' },
  photoBtns: { flexDirection: 'row', gap: S.sm, marginBottom: 4 },
  photoBtn: { flex: 1, backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong },
  photoBtnText: { fontFamily: F.displayMed, fontSize: 13, color: C.textBody, letterSpacing: 1 },
  photoHint: { fontFamily: F.body, fontSize: 11, color: C.textFaint, textAlign: 'center', marginTop: 2 },
  notesInput: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.md, fontFamily: F.body, fontSize: 15, color: C.textBody, minHeight: 120, borderWidth: 1, borderColor: C.borderStrong, lineHeight: 22 },
  actionRow: { flexDirection: 'row', gap: S.sm, marginTop: S.lg },
  draftBtn: { flex: 1, backgroundColor: C.linenDeep, borderRadius: 10, paddingVertical: 18, alignItems: 'center' },
  draftBtnText: { fontFamily: F.display, fontSize: 15, color: C.textBody, letterSpacing: 1 },
  submitBtn: { flex: 2, backgroundColor: C.dark, borderRadius: 10, paddingVertical: 18, alignItems: 'center' },
  submitBtnText: { fontFamily: F.display, fontSize: 15, color: C.teal, letterSpacing: 1 },
  submittedCard: { backgroundColor: C.linenCard, borderRadius: 10, padding: S.lg, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center' },
  submittedTitle: { fontFamily: F.display, fontSize: 22, color: C.textHead, letterSpacing: 2, marginBottom: S.sm },
  submittedBody: { fontFamily: F.body, fontSize: 14, color: C.textBody, textAlign: 'center', lineHeight: 22, marginBottom: S.md },
  submittedMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.border },
  submittedLabel: { fontFamily: F.bodyMed, fontSize: 13, color: C.textMuted },
  submittedValue: { fontFamily: F.bodySemi, fontSize: 14, color: C.textHead },
  statusBadge: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: F.bodyMed, fontSize: 12, color: C.teal, letterSpacing: 0.5 },
});
