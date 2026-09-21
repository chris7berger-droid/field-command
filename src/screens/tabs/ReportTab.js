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
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Image,
  Alert, StyleSheet, Vibration, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePowerSync, useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { parseJSON, parseJSONArray, tod, fmtDayLabel } from '../../lib/utils';
import {
  adjacentLogDate, assignmentDatesForJob, canComposeAdlOnDate, canComposeRequiredOnDate,
  canWriteDailyLogOnDate, dailyLogEntriesForPeriod, dailyLogEntriesOnDate, dailyLogWorkDates,
  eligibleWorkDates, formatLogSubmittedAt, isRequiredLogType, missingRequiredLogTypes,
  nextRequiredLogType, punchWorkDatesForJob, requiredLogDueCopy,
} from '../../lib/dailyLogHistory';
import { namesMatch } from '../../lib/crew';
import { uploadPhotos } from '../../lib/photos';
import LinenBackground from '../../components/LinenBackground';
import { mergeDaysByDate } from './TasksTab';
import {
  dailyLogAccessCopy, dailyLogAccessGate, pickSowDaysForPrt, reportClockGate, reportClockCopy,
  punchLookbackDate, shiftDate,
} from '../../lib/dayDuty';
import { jobNumber } from '../../lib/trips';
import { requireCanonicalTeamMemberId, isMissingTeamMemberIdError } from '../../lib/activation';
import {
  asPrtTaskList,
  cancelSubmittedPrtEdit,
  prtEditDebugSnapshot,
  prtSectionView,
  seedTaskEntries,
  visiblePrtEditEntries,
} from '../../lib/prtEdit';

const LOG_TYPES = [
  { key: 'SOD', label: 'START OF DAY', hint: 'Photos of job site at start' },
  { key: 'MOD', label: 'MID DAY', hint: 'Photos of progress' },
  { key: 'EOD', label: 'END OF DAY', hint: 'How the site was left + all progress' },
];

// Live Schedule job for this call_log (same contract as TasksTab).
const LIVE_JOB_FILTER = `(deleted IS NULL OR deleted = 'No')`;
const LIVE_JOB_SQL = `(SELECT id FROM jobs WHERE call_log_id = ? AND ${LIVE_JOB_FILTER} ORDER BY id DESC LIMIT 1)`;

function tasksFromDays(dayList) {
  const tasks = [];
  for (const day of (dayList || [])) {
    for (const t of (day.tasks || [])) {
      tasks.push({
        id: t.id,
        description: t.description,
        target_pct: Number(t.pct_complete) || 0,
      });
    }
  }
  return tasks;
}

function sameTaskEntries(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((t, i) => (
    t.description === b[i].description
    && t.target_pct === b[i].target_pct
    && t.pct_today === b[i].pct_today
    && (t.notes || '') === (b[i].notes || '')
  ));
}

// % of today's SOW target. Empty/0 stays quiet (not yet filled).
// Three colors (teal / amber / red); five miss rungs live in the words.
const NOTE_DEFAULT = 'Note required — what happened today';

const PRT_RUNGS = {
  hit: {
    badge: 'HIT TARGET',
    note: 'What made this possible?',
    bar: C.teal,
    badgeBg: C.dark,
    badgeFg: C.teal,
  },
  // 80–99% is the learning band, not a warning. Teal bar = a lot got done;
  // dark badge asks how the last gap would have closed. Amber is for 60–79%.
  close: {
    badge: 'CLOSE — WHAT WOULD HAVE HIT 100%?',
    note: 'What could you have done to hit 100%, or what would have allowed you to hit 100%?',
    bar: C.tealDark,
    badgeBg: C.dark,
    badgeFg: C.linenCard,
  },
  behind: {
    badge: 'BEHIND — NOTIFY SALES',
    note: 'Why we missed. Notify Sales.',
    bar: C.amber,
    badgeBg: C.amber,
    badgeFg: C.dark,
  },
  delay: {
    badge: 'DELAY — TELL SALES',
    note: 'Tell Sales the delay and the reason. Does this cost a day?',
    bar: C.red,
    badgeBg: C.red,
    badgeFg: C.white,
  },
  risk: {
    badge: 'DAY AT RISK',
    note: 'What stopped production. Who did you tell.',
    bar: C.red,
    badgeBg: C.red,
    badgeFg: C.white,
  },
  nearZero: {
    badge: 'NOTIFY SALES IMMEDIATELY',
    note: "Almost none of today's target got done. Write what blocked it, then notify Sales immediately.",
    bar: C.red,
    badgeBg: C.red,
    badgeFg: C.white,
  },
};

function prtRung(pctToday, targetPct) {
  const today = Number(pctToday) || 0;
  const target = Number(targetPct) || 0;
  if (today <= 0) return null;
  const ratio = target > 0 ? (today / target) * 100 : today;
  if (ratio >= 100) return PRT_RUNGS.hit;
  if (ratio >= 80) return PRT_RUNGS.close;
  if (ratio >= 60) return PRT_RUNGS.behind;
  if (ratio >= 40) return PRT_RUNGS.delay;
  if (ratio >= 20) return PRT_RUNGS.risk;
  return PRT_RUNGS.nearZero;
}

/** Home duty navigation may pass SOD/MOD/EOD even when that type is already in. */
export function composerLogTypeAfterLoad(initialLogType, submittedTypes) {
  if (initialLogType === 'ADL' || initialLogType === 'OTHER') return null;
  if (initialLogType !== 'SOD' && initialLogType !== 'MOD' && initialLogType !== 'EOD') return null;
  if (submittedTypes && submittedTypes.has(initialLogType)) return null;
  return initialLogType;
}

/** Viewing a period is independent of whether the composer opens. */
export function initialSelectedLogType(initialLogType) {
  if (initialLogType === 'OTHER' || initialLogType === 'ADL') return 'ADL';
  if (initialLogType === 'SOD' || initialLogType === 'MOD' || initialLogType === 'EOD') {
    return initialLogType;
  }
  return null;
}

function ReportsGateCard({ copy, onConfirm }) {
  return (
    <View style={styles.gateCard}>
      <Text style={styles.gateTitle}>{copy.title}</Text>
      {copy.body ? <Text style={styles.gateBody}>{copy.body}</Text> : null}
      <TouchableOpacity style={styles.gateBtn} activeOpacity={0.7} onPress={onConfirm}>
        <Text style={styles.gateBtnText}>{copy.confirm}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Historical thumbs wait one frame so date/type/notes/time paint first. */
function HistoricalLogPhoto({ uri }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [uri]);
  if (!mounted) return <View style={[styles.logPhotoThumb, styles.logPhotoPlaceholder]} />;
  return <Image source={{ uri }} style={styles.logPhotoThumb} />;
}

export default function ReportTab({ jobId, employeeId, employeeName, jobName, navigation, initialSection, initialLogType, initialLogDate }) {
  const db = usePowerSync();
  const today = tod();
  const [section, setSection] = useState(initialSection === 'log' ? 'log' : 'prt'); // 'prt' | 'log'

  // Same SOW source as the Field SOW tab: canonical job_wtcs, then the
  // jobs.field_sow mirror. Do not read proposal_wtc — that LIMIT 10 → [0]
  // pick is an arbitrary WTC and is why PRT targets drifted from the SOW.
  const { data: wtcRows } = useQuery(
    `SELECT field_sow, work_type_name, proposal_wtc_id FROM job_wtcs
      WHERE job_id = ${LIVE_JOB_SQL}
      ORDER BY position`,
    [jobId]
  );
  const { data: jobRows } = useQuery(
    `SELECT field_sow FROM jobs
      WHERE call_log_id = ? AND ${LIVE_JOB_FILTER}
      ORDER BY id DESC LIMIT 1`,
    [jobId]
  );
  const { data: tripRows } = useQuery(
    `SELECT seq, label, start_date, end_date FROM job_mobilizations
      WHERE job_id = ${LIVE_JOB_SQL}
      ORDER BY seq`,
    [jobId]
  );
  const jobRow = jobRows?.[0] || null;

  const { days } = useMemo(() => {
    if (wtcRows && wtcRows.length > 0) {
      const tagged = [];
      for (const w of wtcRows) {
        for (const day of parseJSON(w.field_sow, [])) {
          tagged.push({ ...day, work_type_name: w.work_type_name });
        }
      }
      return mergeDaysByDate(tagged, tripRows);
    }
    if (jobRow?.field_sow) {
      const tagged = parseJSON(jobRow.field_sow, []).map((d) => ({ ...d, work_type_name: null }));
      return mergeDaysByDate(tagged, tripRows);
    }
    return { days: [], allTbd: false };
  }, [wtcRows, jobRow, tripRows]);

  const lookback = punchLookbackDate(today);
  const { data: punchRows } = useQuery(
    `SELECT job_id, punch_type, punch_time FROM time_punches WHERE punch_date >= ? ORDER BY punch_time ASC`,
    [lookback]
  );
  const { data: jobPunchRows } = useQuery(
    `SELECT job_id, employee_id, punch_type, punch_time, punch_date FROM time_punches WHERE job_id = ? ORDER BY punch_time ASC`,
    [jobId]
  );
  const { data: assignRows } = useQuery(
    `SELECT j.call_log_id AS call_log_id, a.crew_name AS crew_name, a.date AS date,
            a.team_member_id AS team_member_id
       FROM assignments a
       INNER JOIN jobs j ON j.id = a.job_id
      WHERE j.call_log_id = ? AND ${LIVE_JOB_FILTER}`,
    [jobId]
  );
  const workDate = shiftDate(punchRows, today);
  const reportGate = reportClockGate(jobId, punchRows);
  const eligibleDates = useMemo(() => {
    const assignmentDates = assignmentDatesForJob(assignRows, {
      jobId, userId: employeeId, memberName: employeeName, namesMatch,
    });
    const punchDates = punchWorkDatesForJob(jobPunchRows, { jobId, employeeId });
    return eligibleWorkDates({ assignmentDates, punchDates, today });
  }, [assignRows, jobPunchRows, jobId, employeeId, employeeName, today]);
  const logGate = dailyLogAccessGate(jobId, punchRows, { eligible: eligibleDates.length > 0 });
  const { data: clockJobRows } = useQuery(
    `SELECT * FROM call_log WHERE id = ?`,
    [reportGate.openId || logGate.openId || jobId]
  );

  // Production day = prior submitted PRTs (office measures by day count, not
  // calendar date). When Schedule has dated a SOW day as today, use that day.
  const { data: priorPrtRows } = useQuery(
    `SELECT DISTINCT report_date FROM daily_production_reports
      WHERE job_id = ? AND report_date != ?
        AND (status = 'submitted' OR status = 'approved')`,
    [jobId, workDate]
  );
  const priorPrtCount = priorPrtRows?.length || 0;
  const prtDays = useMemo(
    () => pickSowDaysForPrt(days, workDate, priorPrtCount),
    [days, workDate, priorPrtCount]
  );

  const todaySowTasks = useMemo(() => tasksFromDays(prtDays), [prtDays]);
  const prtDayLabel = prtDays.map((d) => d.label).filter(Boolean).join(' · ');
  // Postgres wtc_id is a UUID (FK to proposal_wtc). Empty string is rejected
  // and PowerSync discards the write — which is why PRT looked like it wouldn't save.
  const sowWtcId = (wtcRows || []).map((w) => w.proposal_wtc_id).find(Boolean) || null;

  // ── PRT State ───────────────────────────────────────────
  const { data: existingReports } = useQuery(
    `SELECT * FROM daily_production_reports WHERE job_id = ? AND report_date = ? LIMIT 1`,
    [jobId, workDate]
  );
  const existingReport = existingReports?.[0] || null;
  const prtSubmitted = existingReport?.status === 'submitted' || existingReport?.status === 'approved';
  // Same parse the submitted card uses — do not use a second parser here.
  const cardTasks = useMemo(
    () => parseJSONArray(existingReport?.tasks, []),
    [existingReport?.tasks]
  );
  const submittedSnapshotRef = useRef({ tasks: [], status: null, id: null });
  if (prtSubmitted && cardTasks.some((t) => Number(t.pct_today) > 0)) {
    submittedSnapshotRef.current = {
      tasks: cardTasks,
      status: existingReport?.status || null,
      id: existingReport?.id || null,
    };
  }
  const savedForEdit = cardTasks.length > 0 ? cardTasks : submittedSnapshotRef.current.tasks;

  const [taskEntries, setTaskEntries] = useState([]);
  const [prtSubmitting, setPrtSubmitting] = useState(false);
  const [editing, setEditing] = useState(false); // re-open a submitted PRT to edit + resubmit

  const sowSource = todaySowTasks;
  const sowSourceKey = sowSource.map((t) => `${t.description}:${t.target_pct}`).join('|');
  const prtView = prtSectionView({
    submitted: prtSubmitted || submittedSnapshotRef.current.tasks.some((t) => Number(t.pct_today) > 0),
    editing,
    taskEntries,
    savedTasks: savedForEdit,
  });

  // First-submit seed only. Edit list is owned by startEdit until cancel/submit.
  useEffect(() => {
    if (editing) return;
    if (prtSubmitted) return;
    if (sowSource.length === 0) return;
    const saved = asPrtTaskList(existingReport?.tasks);
    setTaskEntries((prev) => {
      const next = seedTaskEntries(sowSource, saved, prev);
      if (sameTaskEntries(prev, next)) return prev;
      return next;
    });
  }, [existingReport?.id, existingReport?.status, existingReport?.tasks, sowSourceKey, prtSubmitted, editing]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log('[PRT-EDIT]', prtEditDebugSnapshot({
      editing,
      prtSubmitted,
      workDate,
      reportId: existingReport?.id,
      status: existingReport?.status,
      tasksType: existingReport ? typeof existingReport.tasks : 'none',
      tasksIsArray: Array.isArray(existingReport?.tasks),
      parsedCount: cardTasks.length,
      taskEntriesCount: taskEntries.length,
      view: prtView,
    }));
  }, [editing, prtSubmitted, workDate, existingReport, cardTasks.length, taskEntries.length, prtView]);

  const updateTask = useCallback((idx, field, value) => {
    setTaskEntries((prev) => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
  }, []);

  // Seed from the exact rows the submitted card is showing, plus today's SOW.
  const startEdit = useCallback(() => {
    const saved = savedForEdit;
    const entries = visiblePrtEditEntries(todaySowTasks, saved);
    if (__DEV__) {
      console.log('[PRT-EDIT] startEdit', prtEditDebugSnapshot({
        editing: true,
        prtSubmitted,
        workDate,
        reportId: existingReport?.id,
        status: existingReport?.status,
        tasksType: existingReport ? typeof existingReport.tasks : 'none',
        tasksIsArray: Array.isArray(existingReport?.tasks),
        parsedCount: saved.length,
        taskEntriesCount: entries.length,
        view: prtSectionView({
          submitted: true,
          editing: true,
          taskEntries: entries,
          savedTasks: saved,
        }),
      }));
    }
    setTaskEntries(entries);
    setEditing(true);
  }, [savedForEdit, todaySowTasks, prtSubmitted, workDate, existingReport]);

  const cancelEdit = useCallback(() => {
    const next = cancelSubmittedPrtEdit();
    setEditing(next.editing);
  }, []);

  // ── Daily Log State ─────────────────────────────────────
  // Load this job's logs (not today-only) so prior work dates can be viewed.
  // Today vs history is still split with localYmd(created_at), not an ISO
  // midnight SQL cutoff — PowerSync stores created_at like
  // `2026-09-17 21:44:43.961+00` (space), which is lexicographically <
  // `2026-09-17T07:00:00.000Z`.
  const { data: logEntries, isLoading: logLoading } = useQuery(
    `SELECT * FROM daily_log_entries WHERE job_id = ? ORDER BY created_at ASC`,
    [jobId]
  );

  const [viewDate, setViewDate] = useState(() => {
    const d = String(initialLogDate || '').trim().slice(0, 10);
    return d && d <= today ? d : today;
  });
  const viewingToday = viewDate === today;

  useEffect(() => {
    const d = String(initialLogDate || '').trim().slice(0, 10);
    setViewDate(d && d <= today ? d : today);
  }, [jobId, today, initialLogDate]);

  const todaysLogEntries = useMemo(
    () => dailyLogEntriesOnDate(logEntries, today),
    [logEntries, today]
  );
  const viewedLogEntries = useMemo(
    () => dailyLogEntriesOnDate(logEntries, viewDate),
    [logEntries, viewDate]
  );
  const workDates = useMemo(
    () => dailyLogWorkDates(logEntries, today, eligibleDates),
    [logEntries, today, eligibleDates]
  );
  const prevWorkDate = adjacentLogDate(workDates, viewDate, -1);
  const nextWorkDate = adjacentLogDate(workDates, viewDate, 1);
  const historical = viewDate !== today;
  const canWrite = canWriteDailyLogOnDate(viewDate, {
    today,
    eligibleDates,
    clockedIntoJob: logGate.kind === 'clocked' || logGate.kind === 'unknown',
  });

  const submittedTypes = useMemo(() => {
    return new Set(todaysLogEntries.map((e) => e.entry_type));
  }, [todaysLogEntries]);
  const viewedSubmittedTypes = useMemo(() => {
    return new Set(viewedLogEntries.map((e) => e.entry_type));
  }, [viewedLogEntries]);

  const appliedInitialLogType = useRef(false);
  const [selectedLogType, setSelectedLogType] = useState(null);
  const [logType, setLogType] = useState(null);
  const [logPhotos, setLogPhotos] = useState([]);
  const [logNotes, setLogNotes] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);

  const visibleLogEntries = useMemo(
    () => dailyLogEntriesForPeriod(viewedLogEntries, selectedLogType),
    [viewedLogEntries, selectedLogType]
  );

  useEffect(() => {
    if (logLoading) return;
    if (appliedInitialLogType.current) return;
    appliedInitialLogType.current = true;
    let selected = initialSelectedLogType(initialLogType);
    let compose = composerLogTypeAfterLoad(initialLogType, submittedTypes);
    if (compose === 'ADL' && !canComposeAdlOnDate(todaysLogEntries)) {
      const due = nextRequiredLogType(todaysLogEntries);
      if (due) {
        const copy = requiredLogDueCopy(due);
        Alert.alert(copy.title, copy.body);
        selected = due;
        compose = due;
      }
    }
    setSelectedLogType(selected);
    setLogType(compose);
  }, [logLoading, initialLogType, submittedTypes, todaysLogEntries]);

  const clearComposer = useCallback(() => {
    setLogType(null);
    setLogPhotos([]);
    setLogNotes('');
  }, []);

  const openLogPeriod = useCallback((type, { compose = false } = {}) => {
    let next = type === 'OTHER' ? 'ADL' : type;
    if (compose && next === 'ADL' && !canComposeAdlOnDate(viewedLogEntries)) {
      const due = nextRequiredLogType(viewedLogEntries);
      if (due) {
        const copy = requiredLogDueCopy(due);
        Alert.alert(copy.title, copy.body);
        next = due;
      }
    }
    setSelectedLogType(next);
    const allowCompose = compose && canWrite && (
      next === 'ADL'
        ? canComposeAdlOnDate(viewedLogEntries)
        : canComposeRequiredOnDate(viewedLogEntries, next, { historical })
    );
    if (allowCompose) {
      if (logType !== next) {
        setLogPhotos([]);
        setLogNotes('');
      }
      setLogType(next);
      return;
    }
    clearComposer();
  }, [canWrite, historical, viewedLogEntries, logType, clearComposer]);

  const getActorId = useCallback(() => {
    try {
      return requireCanonicalTeamMemberId(employeeId, 'report write');
    } catch (e) {
      if (isMissingTeamMemberIdError(e)) {
        Alert.alert('Field Command not active', 'Your account is not activated for Field Command.');
        return null;
      }
      throw e;
    }
  }, [employeeId]);

  // ── Photo helpers ───────────────────────────────────────
  const pickPhoto = useCallback(async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 0,
      orderedSelection: true,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    });
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
    // Only tasks worked today (a % entered) need a note — a task left at 0 wasn't
    // touched today, so don't force a note on it.
    const worked = taskEntries.filter(t => Number(t.pct_today) > 0);
    if (worked.length === 0) {
      Alert.alert('Nothing to report yet', 'Enter today’s % for at least one task before submitting.');
      return;
    }
    const missing = worked.find(t => !t.notes || !t.notes.trim());
    if (missing) {
      Alert.alert('Note needed', `Add a note for “${missing.description || 'this task'}” before submitting.`);
      return;
    }

    setPrtSubmitting(true);
    try {
      const actorId = getActorId();
      if (!actorId) return;
      // Save only the tasks actually worked today — not every seeded SOW task —
      // so the submitted report reflects real production, not a wall of 0%s.
      const data = {
        tasks: JSON.stringify(worked),
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
          [id, jobId, sowWtcId, workDate, actorId, data.tasks, data.materials_used, data.hours_regular, data.hours_ot, data.photos, data.notes, data.status, new Date().toISOString()]
        );
      }
      Vibration.vibrate([100, 50, 100]);
      setEditing(false);
    } catch (e) {
      Alert.alert('Not sent', `Could not save the PRT: ${e?.message || 'unknown error'}. Try again.`);
    } finally {
      setPrtSubmitting(false);
    }
  }, [taskEntries, existingReport, jobId, workDate, db, sowWtcId, getActorId]);

  // ── Daily Log Submit (optimistic — save immediately, upload photos in background) ──
  const submitLogEntry = useCallback(async () => {
    if (!canWrite) return;
    if (isRequiredLogType(logType) && !canComposeRequiredOnDate(viewedLogEntries, logType, { historical })) {
      return;
    }
    if (logType === 'ADL' && !canComposeAdlOnDate(viewedLogEntries)) {
      const due = nextRequiredLogType(viewedLogEntries);
      if (due) {
        const copy = requiredLogDueCopy(due);
        Alert.alert(copy.title, copy.body);
        openLogPeriod(due, { compose: true });
      }
      return;
    }
    if (!logNotes.trim()) { Alert.alert('Note required', 'Add a note before submitting.'); return; }
    if (logPhotos.length === 0) { Alert.alert('Photos required', 'Add at least one photo.'); return; }

    setLogSubmitting(true);
    try {
      const actorId = getActorId();
      if (!actorId) return;
      // Save entry immediately with local photo URIs
      const id = generateId();
      const localUris = [...logPhotos];
      await db.execute(
        `INSERT INTO daily_log_entries (id, job_id, employee_id, entry_type, photos, notes, work_date, synced, created_at) VALUES (?,?,?,?,?,?,?,0,?)`,
        [id, jobId, actorId, logType, JSON.stringify(localUris), logNotes.trim(), viewDate, new Date().toISOString()]
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
    } catch (e) {
      Alert.alert('Not saved', `Could not save this log entry: ${e?.message || 'unknown error'}.`);
    } finally {
      setLogSubmitting(false);
    }
  }, [canWrite, historical, viewedLogEntries, logType, logPhotos, logNotes, viewDate, jobId, db, getActorId, openLogPeriod]);

  // ── Render ──────────────────────────────────────────────
  const openJob = clockJobRows?.[0];
  const openLabel = jobNumber(openJob) || openJob?.job_name || 'that job';
  const goClockFromGate = (kind, openId) => {
    const destId = kind === 'other' ? (openId || jobId) : jobId;
    const destName = kind === 'other' ? (openJob?.job_name || jobName) : jobName;
    navigation?.navigate('JobDetail', { jobId: destId, jobName: destName, tab: 'TimeClock' });
  };
  const prtBlocked = Array.isArray(punchRows) && !reportGate.allowed;
  const logBlocked = Array.isArray(punchRows) && !logGate.allowed;

  return (
    <LinenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        {(section === 'prt' && prtBlocked) ? (
          <ReportsGateCard
            copy={reportClockCopy(reportGate.kind, openLabel)}
            onConfirm={() => goClockFromGate(reportGate.kind, reportGate.openId)}
          />
        ) : null}
        {(section === 'prt' && !prtBlocked) ? (
          <>
            <Text style={styles.sectionTitle}>PRODUCTION RATE TRACKER</Text>
            <Text style={styles.sectionHint}>
              {prtDayLabel
                ? `Enter today’s % for each task. Targets match SOW ${prtDayLabel}.`
                : 'Enter your daily % for each task. Hit the target or beat it.'}
            </Text>

            {prtView.showReadback ? (
              <View style={styles.submittedCard}>
                <View style={styles.sentBadge}><Text style={styles.sentBadgeText}>✓ SENT TO OFFICE</Text></View>
                <Text style={styles.submittedTitle}>PRT SUBMITTED</Text>
                <Text style={styles.submittedBody}>Today's production has been sent to the office.</Text>
                {asPrtTaskList(savedForEdit).filter((t) => Number(t.pct_today) > 0).map((t, idx) => {
                  const rung = prtRung(t.pct_today, t.target_pct);
                  return (
                  <View key={idx} style={styles.submittedTask}>
                    <Text style={styles.submittedTaskName}>{t.description}</Text>
                    {rung ? (
                      <View style={[styles.resultBadge, { backgroundColor: rung.badgeBg }]}>
                        <Text style={[styles.resultText, { color: rung.badgeFg }]}>{rung.badge}</Text>
                      </View>
                    ) : null}
                    <View style={styles.submittedPctRow}>
                      <View style={styles.pctChip}>
                        <Text style={styles.pctChipLabel}>TODAY</Text>
                        <Text style={[styles.pctChipValue, { color: rung?.bar || C.textHead }]}>{t.pct_today}%</Text>
                      </View>
                      <View style={styles.pctChip}>
                        <Text style={styles.pctChipLabel}>TARGET</Text>
                        <Text style={styles.pctChipValue}>{t.target_pct}%</Text>
                      </View>
                    </View>
                    {t.notes ? <Text style={styles.submittedNotes}>{t.notes}</Text> : null}
                  </View>
                  );
                })}
                <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
                  <Text style={styles.editBtnText}>EDIT &amp; RESUBMIT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {(prtView.showEditor ? prtView.editor : taskEntries).map((task, idx) => {
                  const rung = prtRung(task.pct_today, task.target_pct);
                  const hit = rung?.badge === 'HIT TARGET';
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
                      </View>

                      {rung ? (
                        <View style={[styles.resultBadge, { backgroundColor: rung.badgeBg }]}>
                          <Text style={[styles.resultText, { color: rung.badgeFg }]}>{rung.badge}</Text>
                        </View>
                      ) : null}

                      {/* Progress bar */}
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressTarget, { width: `${Math.min(task.target_pct, 100)}%` }]} />
                        <View style={[styles.progressActual, { width: `${Math.min(task.pct_today || 0, 100)}%`, backgroundColor: rung?.bar || C.linenDeep }]} />
                      </View>

                      {/* Notes — required; placeholder matches the urgency rung */}
                      <TextInput
                        style={styles.taskNoteInput}
                        value={task.notes}
                        onChangeText={(v) => updateTask(idx, 'notes', v)}
                        placeholder={rung?.note || NOTE_DEFAULT}
                        placeholderTextColor={C.textFaint}
                        multiline
                      />
                    </View>
                  );
                })}

              </>
            )}
          </>
        ) : null}

        {/* ═══ Daily Log Section ═══ */}
        {(section === 'log' && logBlocked) ? (
          <ReportsGateCard
            copy={logGate.kind === 'other'
              ? reportClockCopy('other', openLabel)
              : dailyLogAccessCopy(logGate.kind, openLabel)}
            onConfirm={() => goClockFromGate(logGate.kind, logGate.openId)}
          />
        ) : null}
        {(section === 'log' && !logBlocked) ? (
          <>
            <Text style={styles.sectionTitle}>DAILY LOG</Text>
            <View style={styles.logDateNav}>
              <TouchableOpacity
                style={[styles.logDateNavBtn, !prevWorkDate && styles.logDateNavBtnDisabled]}
                onPress={() => {
                  if (!prevWorkDate) return;
                  setViewDate(prevWorkDate);
                  setSelectedLogType(null);
                  clearComposer();
                }}
                disabled={!prevWorkDate}
                accessibilityLabel="Previous work date"
              >
                <Text style={styles.logDateNavArrow}>{'\u2039'}</Text>
              </TouchableOpacity>
              <Text style={styles.logDateNavLabel}>
                {viewingToday ? 'TODAY' : (fmtDayLabel(viewDate) || viewDate)}
              </Text>
              <TouchableOpacity
                style={[styles.logDateNavBtn, !nextWorkDate && styles.logDateNavBtnDisabled]}
                onPress={() => {
                  if (!nextWorkDate) return;
                  setViewDate(nextWorkDate);
                  setSelectedLogType(null);
                  clearComposer();
                }}
                disabled={!nextWorkDate}
                accessibilityLabel="Next work date"
              >
                <Text style={styles.logDateNavArrow}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionHint}>
              {!canWrite
                ? 'Read only — this work day is not one you were assigned or punched.'
                : viewingToday
                  ? 'Photo + note entries throughout the day. SOD, MOD, EOD required.'
                  : missingRequiredLogTypes(viewedLogEntries).length > 0
                    ? 'Finish missing required logs for this work day. Submit time is when you save — the work date stays this day.'
                    : 'Required logs for this work day are in. Additional logs are allowed. Submitted required logs stay read-only.'}
            </Text>

            {/* Status pills */}
            <View style={styles.logStatusRow}>
              {LOG_TYPES.map((lt) => {
                const done = viewedSubmittedTypes.has(lt.key);
                const selected = selectedLogType === lt.key;
                return (
                  <TouchableOpacity
                    key={lt.key}
                    style={[styles.logStatusPill, done && styles.logStatusDone, selected && styles.logStatusSelected]}
                    onPress={() => openLogPeriod(lt.key, {
                      compose: canWrite && !viewedSubmittedTypes.has(lt.key),
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${lt.label}${done ? ', completed' : ''}`}
                  >
                    <Text style={[styles.logStatusText, (done || selected) && styles.logStatusTextDone]}>{lt.key}</Text>
                    <Text style={styles.logStatusCheck}>{done ? '\u2713' : '\u25CB'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {canWrite && !logType && canComposeAdlOnDate(viewedLogEntries) ? (
              <TouchableOpacity
                style={[styles.logStartBtn, { marginBottom: S.md }]}
                onPress={() => openLogPeriod('ADL', { compose: true })}
              >
                <Text style={styles.logStartBtnLabel}>+ ADDITIONAL LOG</Text>
                <Text style={styles.logStartBtnHint}>Extra photos and notes after SOD, MOD, and EOD</Text>
              </TouchableOpacity>
            ) : null}

            {/* Submitted entries for the selected period only */}
            {visibleLogEntries.length > 0 && (
              <View style={styles.logHistory}>
                {visibleLogEntries.map((entry) => {
                  const photos = parseJSONArray(entry.photos, []);
                  return (
                    <View key={entry.id} style={styles.logEntryCard}>
                      <View style={styles.logEntryHeader}>
                        <View style={styles.logTypeBadge}><Text style={styles.logTypeText}>{entry.entry_type}</Text></View>
                        <Text style={styles.logEntryTime}>{formatLogSubmittedAt(entry)}</Text>
                      </View>
                      {photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logPhotoScroll}>
                          {photos.map((uri, i) => (
                            historical
                              ? <HistoricalLogPhoto key={i} uri={uri} />
                              : <Image key={i} source={{ uri }} style={styles.logPhotoThumb} />
                          ))}
                        </ScrollView>
                      )}
                      <Text style={styles.logEntryNotes}>{entry.notes}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* New entry composer when this work date is writable */}
            {canWrite && logType ? (
              <View style={styles.composerCard}>
                <View style={styles.composerHeader}>
                  <View style={styles.logTypeBadge}><Text style={styles.logTypeText}>{logType}</Text></View>
                  <TouchableOpacity onPress={() => { setSelectedLogType(null); clearComposer(); }}>
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
                <Text style={styles.photoHint}>
                  {logPhotos.length > 0
                    ? 'Pick several at once. Long-press a photo to remove.'
                    : 'Pick several photos at once from the library.'}
                </Text>

                <TextInput
                  style={styles.logNoteInput}
                  value={logNotes}
                  onChangeText={setLogNotes}
                  placeholder={
                    logType === 'ADL'
                      ? 'Additional photos and notes for this work day'
                      : (LOG_TYPES.find(l => l.key === logType)?.hint || 'Describe what you see...')
                  }
                  placeholderTextColor={C.textFaint}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : canWrite && !(historical && missingRequiredLogTypes(viewedLogEntries).length === 0) ? (
              <View style={styles.logButtons}>
                {LOG_TYPES.map((lt) => {
                  const done = viewedSubmittedTypes.has(lt.key);
                  if (historical && done) return null;
                  return (
                    <TouchableOpacity key={lt.key} style={[styles.logStartBtn, done && styles.logStartBtnDone]} onPress={() => openLogPeriod(lt.key, { compose: true })}>
                      <Text style={styles.logStartBtnLabel}>{lt.label}</Text>
                      <Text style={styles.logStartBtnHint}>{!historical && done ? 'Add another' : lt.hint}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}

      </ScrollView>

      {/* Sticky action bar — always visible so the crew can submit from anywhere
          in the form, not only after scrolling to the bottom. */}
      {section === 'prt' && !prtBlocked && prtView.showSticky && (
        <View style={styles.stickyBar}>
          {editing ? (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={cancelEdit}
              accessibilityRole="button"
              accessibilityLabel="Cancel PRT edit"
            >
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.submitBtn, prtSubmitting && { opacity: 0.5 }]} onPress={submitPRT} disabled={prtSubmitting}>
            <Text style={styles.submitBtnText}>
              {prtSubmitting ? (editing ? 'RESUBMITTING...' : 'SUBMITTING...') : (editing ? 'RESUBMIT PRT' : 'SUBMIT PRT')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'log' && canWrite && logType && (
        <View style={styles.stickyBar}>
          <TouchableOpacity style={[styles.submitBtn, logSubmitting && { opacity: 0.5 }]} onPress={submitLogEntry} disabled={logSubmitting}>
            <Text style={styles.submitBtnText}>{logSubmitting ? 'SAVING...' : `SUBMIT ${logType}`}</Text>
          </TouchableOpacity>
        </View>
      )}
      </KeyboardAvoidingView>
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

  gateCard: {
    backgroundColor: C.linenCard, borderRadius: 12, padding: S.lg,
    borderWidth: 1, borderColor: C.borderStrong, marginTop: S.md,
  },
  gateTitle: {
    fontFamily: F.display, fontSize: 24, color: C.textHead,
    letterSpacing: 0.5, marginBottom: S.sm,
  },
  gateBody: {
    fontFamily: F.body, fontSize: 16, color: C.textBody,
    lineHeight: 24, marginBottom: S.lg,
  },
  gateBtn: {
    backgroundColor: C.dark, borderRadius: 10, paddingVertical: 18, alignItems: 'center',
  },
  gateBtnText: { fontFamily: F.display, fontSize: 18, color: C.teal, letterSpacing: 2 },

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
  resultBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: S.sm, alignSelf: 'stretch' },
  resultText: { fontFamily: F.display, fontSize: 13, letterSpacing: 1, textAlign: 'center' },
  progressTrack: { height: 8, backgroundColor: C.linenDeep, borderRadius: 4, overflow: 'hidden', marginBottom: S.sm },
  progressTarget: { position: 'absolute', height: '100%', backgroundColor: 'rgba(136,124,110,0.4)', borderRadius: 4 },
  progressActual: { height: '100%', borderRadius: 4 },
  taskNoteInput: { backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontFamily: F.body, fontSize: 14, color: C.textBody, minHeight: 64 },

  actionRow: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  stickyBar: { flexDirection: 'row', gap: S.sm, paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.md, backgroundColor: C.linenCard, borderTopWidth: 1, borderTopColor: C.borderStrong },
  editBtn: { marginTop: S.md, backgroundColor: C.dark, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  editBtnText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 1 },
  sentBadge: { alignSelf: 'center', backgroundColor: C.dark, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: S.sm },
  sentBadgeText: { fontFamily: F.display, fontSize: 12, color: C.teal, letterSpacing: 1.5 },
  cancelBtn: { flex: 1, backgroundColor: C.linenDeep, borderRadius: 10, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong },
  cancelBtnText: { fontFamily: F.display, fontSize: 14, color: C.textMuted, letterSpacing: 1 },
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
  logDateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.linenCard, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong,
    paddingVertical: 4, paddingHorizontal: 6, marginBottom: S.sm,
  },
  logDateNavBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  logDateNavBtnDisabled: { opacity: 0.35 },
  logDateNavArrow: { fontFamily: F.display, fontSize: 28, color: C.textHead, lineHeight: 32 },
  logDateNavLabel: { fontFamily: F.display, fontSize: 16, color: C.textHead, letterSpacing: 1.5, flex: 1, textAlign: 'center' },

  logStatusRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  logStatusPill: { flex: 1, backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  logStatusDone: { backgroundColor: C.dark, borderColor: C.teal },
  logStatusSelected: { borderColor: C.teal, borderWidth: 2 },
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
  logPhotoPlaceholder: { backgroundColor: C.linenDeep },
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
