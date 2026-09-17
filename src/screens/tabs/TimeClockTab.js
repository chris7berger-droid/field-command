/**
 * Time Clock Tab — Sequential Punch Flow (Native Only)
 *
 * PW + Company Vehicle: Drive To → Arrive Site → Clock In → Lunch → Clock Out → Drive From → Arrive Home
 * PW + Personal Vehicle / Regular: Clock In → Lunch → Clock Out
 *
 * Each step shows one big button for the current action.
 * Lunch is locked 30 min (15s in demo) with auto-punch-back-in.
 * GPS geofence: warn + flag, never block.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  StyleSheet,
  Vibration,
} from 'react-native';
import { usePowerSync, useQuery } from '@powersync/react';
import { C, F, S } from '../../lib/tokens';
import { fmtTime, tod } from '../../lib/utils';
import { getCurrentPosition, checkGeofence, DEMO_POSITIONS } from '../../lib/location';
import { fetchWeather } from '../../lib/weather';
import { missingClockOutDuties, openClockJobId, switchJobClockCopy, punchLookbackDate, shiftDate, punchesForOpenShift } from '../../lib/dayDuty';
import { jobNumber } from '../../lib/trips';
import { requireCanonicalTeamMemberId, isMissingTeamMemberIdError } from '../../lib/activation';
import { createClockInSubmitGuard } from '../../lib/clockInSubmitGuard';
import LinenBackground from '../../components/LinenBackground';

const LUNCH_DURATION_MS = 30 * 60 * 1000;
const LUNCH_DURATION_DEMO_MS = 15 * 1000;

// PW + company vehicle steps
const PW_DRIVE_STEPS = [
  { id: 'drive_to_start',   punch: 'drive_start',  label: 'DRIVE TO SITE',    hint: 'Tap when leaving for the job site' },
  { id: 'drive_to_end',     punch: 'drive_end',    label: 'ARRIVE ON SITE',   hint: 'Tap when you arrive on site' },
  { id: 'clock_in',         punch: 'clock_in',     label: 'CLOCK IN',         hint: 'Tap to start your shift' },
  { id: 'lunch_start',      punch: 'lunch_start',  label: 'START LUNCH',      hint: '30 minute locked lunch' },
  { id: 'lunch_end',        punch: 'lunch_end',    label: null,               hint: null }, // auto
  { id: 'clock_out',        punch: 'clock_out',    label: 'CLOCK OUT',        hint: 'Tap to end your shift' },
  { id: 'drive_from_start', punch: 'drive_start',  label: 'DRIVE FROM SITE',  hint: 'Tap when leaving the job site' },
  { id: 'drive_from_end',   punch: 'drive_end',    label: 'ARRIVE HOME',      hint: 'Tap when you arrive home' },
];

// Regular or PW + personal vehicle steps
const STANDARD_STEPS = [
  { id: 'clock_in',    punch: 'clock_in',    label: 'CLOCK IN',    hint: 'Tap to start your shift' },
  { id: 'lunch_start', punch: 'lunch_start', label: 'START LUNCH', hint: '30 minute locked lunch' },
  { id: 'lunch_end',   punch: 'lunch_end',   label: null,          hint: null }, // auto
  { id: 'clock_out',   punch: 'clock_out',   label: 'CLOCK OUT',   hint: 'Tap to end your shift' },
];

export default function TimeClockTab({ jobId, jobName, employeeId, navigation }) {
  const db = usePowerSync();

  // ── State ─────────────────────────────────────────────
  const [now, setNow] = useState(new Date());
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [punchHistory, setPunchHistory] = useState([]);
  const [isPW, setIsPW] = useState(false);
  const [companyVehicle, setCompanyVehicle] = useState(null);
  const [shiftStart, setShiftStart] = useState(null);
  const [lunchStart, setLunchStart] = useState(null);
  const [lunchRemaining, setLunchRemaining] = useState(0);
  const [gpsDistance, setGpsDistance] = useState(0);
  const [weather, setWeather] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoOnSite, setDemoOnSite] = useState(true);
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);

  const lunchTimerRef = useRef(null);
  const pendingAction = useRef(null);
  const clockInSubmitGuard = useRef(createClockInSubmitGuard()).current;
  const [clockInProcessing, setClockInProcessing] = useState(false);
  const clockOutSubmitGuard = useRef(createClockInSubmitGuard()).current;
  const clockOutConfirming = useRef(false);
  const [clockOutProcessing, setClockOutProcessing] = useState(false);

  // ── Load job data ─────────────────────────────────────
  const { data: jobRows } = useQuery(
    'SELECT * FROM call_log WHERE id = ?',
    [jobId]
  );
  const job = jobRows?.[0] || null;

  useEffect(() => {
    if (job) setIsPW(job.prevailing_wage === 1);
  }, [job]);

  // ── Step sequence ─────────────────────────────────────
  const steps = useMemo(() => {
    if (isPW && companyVehicle === true) return PW_DRIVE_STEPS;
    return STANDARD_STEPS;
  }, [isPW, companyVehicle]);

  const currentStep = steps[currentStepIdx] || null;
  const isOnLunch = currentStep?.id === 'lunch_end';
  const shiftComplete = currentStepIdx >= steps.length;

  const lookback = punchLookbackDate();

  // ── Load this shift's punches (open overnight clock-ins included) ──
  const { data: todayPunches } = useQuery(
    'SELECT * FROM time_punches WHERE job_id = ? AND punch_date >= ? ORDER BY punch_time ASC',
    [jobId, lookback]
  );

  const { data: allTodayPunches } = useQuery(
    'SELECT job_id, punch_type, punch_time FROM time_punches WHERE punch_date >= ? ORDER BY punch_time ASC',
    [lookback]
  );
  const otherOpenId = openClockJobId(allTodayPunches);
  const { data: otherJobRows } = useQuery(
    'SELECT * FROM call_log WHERE id = ?',
    [otherOpenId && otherOpenId !== String(jobId) ? otherOpenId : jobId]
  );

  const workDate = shiftDate(allTodayPunches);
  const activePunches = useMemo(
    () => punchesForOpenShift(todayPunches, jobId, tod()),
    [todayPunches, jobId]
  );
  const shiftClockIn = (activePunches || []).find((p) => p.punch_type === 'clock_in');
  const shiftStartIso = shiftClockIn?.punch_time
    || new Date(workDate + 'T00:00:00').toISOString();

  // PRT + daily logs: clock-out waits until this shift's SOD, MOD, EOD, and PRT.
  const { data: prtRows } = useQuery(
    'SELECT status, created_at FROM daily_production_reports WHERE job_id = ? AND report_date = ? LIMIT 1',
    [jobId, workDate]
  );
  const prtAfterClockIn = !shiftClockIn
    || !prtRows?.[0]?.created_at
    || String(prtRows[0].created_at) >= String(shiftClockIn.punch_time);
  const prtSubmitted = ['submitted', 'approved'].includes(prtRows?.[0]?.status) && prtAfterClockIn;
  const { data: todayLogs } = useQuery(
    `SELECT entry_type FROM daily_log_entries WHERE job_id = ? AND created_at >= ?`,
    [jobId, shiftStartIso]
  );

  useEffect(() => {
    if (!activePunches || activePunches.length === 0) {
      setPunchHistory([]);
      setCurrentStepIdx(0);
      setShiftStart(null);
      setLunchStart(null);
      return;
    }
    setPunchHistory(activePunches);

    // Restore step index
    let restored = 0;
    for (let i = 0; i < steps.length; i++) {
      const needed = steps.slice(0, i + 1).filter((s) => s.punch === steps[i].punch).length;
      const found = activePunches.filter((p) => p.punch_type === steps[i].punch).length;
      if (found >= needed) restored = i + 1;
      else break;
    }
    setCurrentStepIdx(restored);

    const clockIn = activePunches.find((p) => p.punch_type === 'clock_in');
    if (clockIn) setShiftStart(new Date(clockIn.punch_time));

    const lunchStartPunch = activePunches.find((p) => p.punch_type === 'lunch_start');
    const lunchEndPunch = activePunches.find((p) => p.punch_type === 'lunch_end');
    if (lunchStartPunch && !lunchEndPunch) setLunchStart(new Date(lunchStartPunch.punch_time));
    else setLunchStart(null);

    if (isPW) {
      const hasDrive = activePunches.some((p) => p.punch_type === 'drive_start');
      if (hasDrive) setCompanyVehicle(true);
      else if (activePunches.length > 0) setCompanyVehicle(false);
    }
  }, [activePunches, steps, isPW]);

  // ── Live clock ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Elapsed shift ─────────────────────────────────────
  const clockOutPunch = punchHistory.find((p) => p.punch_type === 'clock_out');
  const shiftEnd = clockOutPunch ? new Date(clockOutPunch.punch_time) : now;
  const elapsedMs = shiftStart ? shiftEnd.getTime() - shiftStart.getTime() : 0;
  const elapsedStr = formatElapsed(elapsedMs);

  // ── Lunch countdown ───────────────────────────────────
  useEffect(() => {
    if (!isOnLunch || !lunchStart) { setLunchRemaining(0); return; }
    const duration = demoMode ? LUNCH_DURATION_DEMO_MS : LUNCH_DURATION_MS;
    const tick = () => {
      const elapsed = Date.now() - lunchStart.getTime();
      const remaining = Math.max(0, duration - elapsed);
      setLunchRemaining(remaining);
      if (remaining <= 0) { clearInterval(lunchTimerRef.current); handleAutoLunchEnd(); }
    };
    tick();
    lunchTimerRef.current = setInterval(tick, 1000);
    return () => clearInterval(lunchTimerRef.current);
  }, [isOnLunch, lunchStart, demoMode]);

  const lunchMin = Math.floor(lunchRemaining / 60000);
  const lunchSec = Math.floor((lunchRemaining % 60000) / 1000);
  const lunchStr = `${pad(lunchMin)}:${pad(lunchSec)}`;

  // ── GPS check ─────────────────────────────────────────
  const checkGPS = useCallback(async () => {
    if (!job) return { onSite: true, position: null, weatherData: null };
    let position;
    if (demoMode) {
      position = demoOnSite ? DEMO_POSITIONS.onSite : DEMO_POSITIONS.offSite;
    } else {
      position = await getCurrentPosition(); // throws if denied
    }
    const geo = checkGeofence(position, job);
    setGpsDistance(geo.distanceMeters);
    const weatherData = await fetchWeather(position.latitude, position.longitude);
    if (weatherData) setWeather(weatherData);
    return { onSite: geo.onSite, position, weatherData };
  }, [job, demoMode, demoOnSite]);

  // ── Write punch ───────────────────────────────────────
  const writePunch = useCallback(async (type, position, weatherData, gpsOverride = false) => {
    const actorId = requireCanonicalTeamMemberId(employeeId, 'time punch write');
    const id = generateId();
    await db.execute(
      `INSERT INTO time_punches (id, job_id, employee_id, punch_type, punch_time, punch_date,
        latitude, longitude, on_site, gps_override, weather_temp, weather_condition, synced, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id, jobId, actorId, type,
        new Date().toISOString(), tod(),
        position?.latitude || null, position?.longitude || null,
        position ? (gpsOverride ? 0 : 1) : 1,
        gpsOverride ? 1 : 0,
        weatherData?.temp_f || null, weatherData?.condition || null,
        new Date().toISOString(),
      ]
    );
  }, [db, jobId, employeeId]);

  const handleWriteError = useCallback((error, message) => {
    if (isMissingTeamMemberIdError(error)) {
      Alert.alert('Field Command not active', 'Your account is not activated for Field Command.');
      return true;
    }
    if (message) {
      Alert.alert('Not saved', message);
      return true;
    }
    return false;
  }, []);

  // ── Advance step ──────────────────────────────────────
  const advanceStep = useCallback(() => {
    setCurrentStepIdx((prev) => prev + 1);
  }, []);

  const releaseClockInSubmit = useCallback(() => {
    clockInSubmitGuard.end();
    setClockInProcessing(false);
  }, [clockInSubmitGuard]);

  const releaseClockOutSubmit = useCallback(() => {
    clockOutConfirming.current = false;
    clockOutSubmitGuard.end();
    setClockOutProcessing(false);
  }, [clockOutSubmitGuard]);

  // ── Execute current step ──────────────────────────────
  const executeStep = useCallback(async (gpsOverride = false) => {
    if (!currentStep || !currentStep.label) return;
    const isClockIn = currentStep.punch === 'clock_in';
    const isClockOut = currentStep.punch === 'clock_out';
    if (isClockIn && !gpsOverride) {
      if (!clockInSubmitGuard.tryBegin()) return;
      setClockInProcessing(true);
    }
    if (isClockOut) {
      if (!clockOutSubmitGuard.tryBegin()) return;
      setClockOutProcessing(true);
    }
    const otherId = openClockJobId(allTodayPunches);
    if (otherId && otherId !== String(jobId)) {
      if (isClockIn) releaseClockInSubmit();
      if (isClockOut) releaseClockOutSubmit();
      const other = otherJobRows?.[0];
      const label = jobNumber(other) || other?.job_name || 'that job';
      const copy = switchJobClockCopy(label);
      Alert.alert(copy.title, copy.body || undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: copy.confirm,
          onPress: () => navigation?.navigate('JobDetail', {
            jobId: other?.id || otherId,
            jobName: other?.job_name,
            tab: 'TimeClock',
          }),
        },
      ]);
      return;
    }
    let gpsResult;
    try {
      gpsResult = await checkGPS();
    } catch (e) {
      if (isClockIn) releaseClockInSubmit();
      if (isClockOut) releaseClockOutSubmit();
      if (e.message === 'LOCATION_DENIED') {
        Alert.alert('Location Required', 'GPS location is required to clock in. Please enable location access in Settings.');
        return;
      }
      throw e;
    }
    const { position, weatherData, onSite } = gpsResult;

    if (isClockIn && !onSite && !gpsOverride) {
      pendingAction.current = () => executeStep(true);
      setShowGeofenceModal(true);
      return;
    }
    if (isClockOut) {
      const logTypes = new Set((todayLogs || []).map((e) => e.entry_type));
      const missing = missingClockOutDuties({ logTypes, prtSubmitted });
      if (missing.length > 0) {
        releaseClockOutSubmit();
        Alert.alert(
          'Finish the day first',
          `Before clocking out: ${missing.join(', ')}.`,
        );
        return;
      }
      setShowClockOutModal(true);
      setClockOutProcessing(false);
      return;
    }

    try {
      await writePunch(currentStep.punch, position, weatherData, gpsOverride);
    } catch (e) {
      if (isClockIn) releaseClockInSubmit();
      if (!handleWriteError(e, `Could not save this punch: ${e?.message || 'unknown error'}.`)) {
        throw e;
      }
      return;
    }
    if (isClockIn) setShiftStart(new Date());
    if (currentStep.punch === 'lunch_start') setLunchStart(new Date());
    Vibration.vibrate(100);
    advanceStep();
    if (isClockIn) releaseClockInSubmit();
  }, [currentStep, checkGPS, writePunch, advanceStep, prtSubmitted, todayLogs, allTodayPunches, otherJobRows, jobId, navigation, handleWriteError, clockInSubmitGuard, releaseClockInSubmit, clockOutSubmitGuard, releaseClockOutSubmit]);

  // ── Confirm clock out ─────────────────────────────────
  const confirmClockOut = useCallback(async () => {
    if (clockOutConfirming.current) return;
    clockOutConfirming.current = true;
    setClockOutProcessing(true);
    let position, weatherData;
    try {
      ({ position, weatherData } = await checkGPS());
    } catch (e) {
      releaseClockOutSubmit();
      if (e.message === 'LOCATION_DENIED') {
        Alert.alert('Location Required', 'GPS location is required to clock out. Please enable location access in Settings.');
        return;
      }
      throw e;
    }
    try {
      await writePunch('clock_out', position, weatherData);
    } catch (e) {
      releaseClockOutSubmit();
      if (!handleWriteError(e, `Could not save clock out: ${e?.message || 'unknown error'}.`)) {
        throw e;
      }
      return;
    }
    Vibration.vibrate([100, 50, 100]);
    setShowClockOutModal(false);
    advanceStep();
    releaseClockOutSubmit();
  }, [checkGPS, writePunch, advanceStep, handleWriteError, releaseClockOutSubmit]);

  // ── Auto lunch end ────────────────────────────────────
  const handleAutoLunchEnd = useCallback(async () => {
    try {
      await writePunch('lunch_end', null, null);
    } catch (e) {
      if (!handleWriteError(e, `Could not save lunch end: ${e?.message || 'unknown error'}.`)) {
        throw e;
      }
      return;
    }
    setLunchStart(null);
    Vibration.vibrate([100, 50, 100]);
    advanceStep();
  }, [writePunch, advanceStep, handleWriteError]);

  // ── Geofence override ─────────────────────────────────
  const handleGeofenceOverride = useCallback(() => {
    setShowGeofenceModal(false);
    if (pendingAction.current) { pendingAction.current(); pendingAction.current = null; }
  }, []);

  const punchNum = jobNumber(job);
  const findOtherJob = () => {
    navigation?.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'JobList', params: { pickFor: 'TimeClock' } },
      ],
    });
  };
  const punchInto = (
    <View style={styles.punchInto}>
      <Text style={styles.punchIntoKicker}>
        {punchNum ? 'YOU ARE PUNCHING INTO JOB NUMBER' : 'YOU ARE PUNCHING INTO'}
      </Text>
      <Text style={styles.punchIntoNum}>{punchNum || jobName || 'THIS JOB'}</Text>
      <TouchableOpacity style={styles.chooseJobBtn} activeOpacity={0.7} onPress={findOtherJob}>
        <Text style={styles.chooseJobText}>CHOOSE A DIFFERENT JOB</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render: vehicle choice (PW only) ──────────────────
  if (isPW && companyVehicle === null && punchHistory.length === 0) {
    return (
      <LinenBackground style={styles.screen}>
        <View style={styles.punchIntoWrap}>{punchInto}</View>
        <View style={styles.choiceContainer}>
          <Text style={styles.choiceTitle}>PREVAILING WAGE JOB</Text>
          <Text style={styles.choiceBody}>How are you getting to the job site today?</Text>
          <TouchableOpacity style={styles.choiceBtn} activeOpacity={0.7} onPress={() => setCompanyVehicle(true)}>
            <Text style={styles.choiceBtnText}>COMPANY VEHICLE</Text>
            <Text style={styles.choiceBtnSub}>Drive time will be tracked separately</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.choiceBtnAlt} activeOpacity={0.7} onPress={() => setCompanyVehicle(false)}>
            <Text style={styles.choiceBtnAltText}>PERSONAL VEHICLE</Text>
            <Text style={styles.choiceBtnAltSub}>Standard clock in/out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.demoSection}>
          <TouchableOpacity style={[styles.demoToggle, demoMode && styles.demoToggleActive]} onPress={() => setDemoMode((d) => !d)}>
            <Text style={demoMode ? styles.demoToggleTextActive : styles.demoToggleText}>{demoMode ? 'DEMO MODE ON' : 'DEMO MODE'}</Text>
          </TouchableOpacity>
        </View>
      </LinenBackground>
    );
  }

  // ── Render: main clock ────────────────────────────────
  return (
    <LinenBackground>
    <ScrollView style={styles.screenTransparent} contentContainerStyle={styles.content}>
      {punchInto}

      {/* Live Clock */}
      <View style={styles.clockContainer}>
        <Text style={styles.liveTime}>
          {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </Text>
        {shiftStart && <Text style={styles.elapsed}>SHIFT: {elapsedStr}</Text>}
      </View>

      {(weather || isPW) ? (
        <View style={styles.statusRow}>
          {weather && (
            <View style={styles.statusChip}>
              <Text style={styles.statusText}>{weather.temp_f}°F · {weather.condition}</Text>
            </View>
          )}
          {isPW && (
            <View style={[styles.statusChip, { backgroundColor: '#5b21b6' }]}>
              <Text style={styles.statusText}>PREVAILING WAGE</Text>
            </View>
          )}
          {isPW && companyVehicle && (
            <View style={styles.statusChip}>
              <Text style={styles.statusText}>COMPANY VEHICLE</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Step Progress */}
      <View style={styles.progressRow}>
        {steps.filter((s) => s.label !== null).map((step, idx, arr) => {
          const stepRealIdx = steps.indexOf(step);
          const done = stepRealIdx < currentStepIdx;
          const active = stepRealIdx === currentStepIdx;
          return (
            <View key={step.id} style={styles.progressDotWrap}>
              <View style={[styles.progressDot, done && styles.progressDotDone, active && styles.progressDotActive]} />
              {idx < arr.length - 1 && <View style={[styles.progressLine, done && styles.progressLineDone]} />}
            </View>
          );
        })}
      </View>

      {/* Current Action */}
      {isOnLunch ? (
        <View style={styles.lunchCard}>
          <Text style={styles.lunchTitle}>LUNCH</Text>
          <Text style={styles.lunchTimer}>{lunchStr}</Text>
          <Text style={styles.lunchLocked}>LOCKED — AUTO RETURN</Text>
        </View>
      ) : shiftComplete ? (
        <View style={styles.completeCard}>
          <Text style={styles.completeTitle}>SHIFT COMPLETE</Text>
          <Text style={styles.completeBody}>All punches recorded for today.</Text>
          {shiftStart && <Text style={styles.completeHours}>Total shift: {elapsedStr}</Text>}
        </View>
      ) : currentStep ? (
        <TouchableOpacity
          style={[
            styles.bigButton,
            currentStep.punch === 'clock_out' && styles.bigButtonOut,
            currentStep.punch.startsWith('drive') && styles.bigButtonDrive,
            clockInProcessing && currentStep.punch === 'clock_in' && styles.bigButtonProcessing,
            clockOutProcessing && currentStep.punch === 'clock_out' && styles.bigButtonProcessing,
          ]}
          activeOpacity={
            (clockInProcessing && currentStep.punch === 'clock_in')
            || (clockOutProcessing && currentStep.punch === 'clock_out')
              ? 1 : 0.7
          }
          disabled={
            (clockInProcessing && currentStep.punch === 'clock_in')
            || (clockOutProcessing && currentStep.punch === 'clock_out')
          }
          onPress={() => executeStep()}
        >
          <Text style={styles.bigButtonText}>
            {clockInProcessing && currentStep.punch === 'clock_in'
              ? 'CLOCKING IN...'
              : clockOutProcessing && currentStep.punch === 'clock_out'
                ? 'CLOCKING OUT...'
                : currentStep.label}
          </Text>
          <Text style={styles.bigButtonSub}>
            {(clockInProcessing && currentStep.punch === 'clock_in')
              || (clockOutProcessing && currentStep.punch === 'clock_out')
              ? 'Please wait'
              : currentStep.hint}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Punch History */}
      {punchHistory.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>TODAY'S PUNCHES</Text>
          {punchHistory.map((p) => (
            <View key={p.id} style={styles.historyRow}>
              <View style={[styles.historyDot, { backgroundColor: p.gps_override === 1 ? C.amber : C.teal }]} />
              <Text style={styles.historyType}>{formatPunchType(p.punch_type)}</Text>
              <Text style={styles.historyTime}>{fmtTime(p.punch_time)}</Text>
              {p.gps_override === 1 && (
                <View style={styles.offSiteBadge}><Text style={styles.offSiteText}>OFF-SITE</Text></View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Today's Hours */}
      {punchHistory.length > 0 && (() => {
        let totalMs = 0, clockInTime = null, lunchMs = 0, lunchStartTime = null;
        for (const p of punchHistory) {
          const t = new Date(p.punch_time).getTime();
          if (p.punch_type === 'clock_in') clockInTime = t;
          if (p.punch_type === 'clock_out' && clockInTime) { totalMs += t - clockInTime; clockInTime = null; }
          if (p.punch_type === 'lunch_start') lunchStartTime = t;
          if (p.punch_type === 'lunch_end' && lunchStartTime) { lunchMs += t - lunchStartTime; lunchStartTime = null; }
        }
        if (clockInTime) totalMs += now.getTime() - clockInTime;
        const netMs = Math.max(0, totalMs - lunchMs);
        const totalMin = Math.floor(netMs / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const hrsStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        const totalHrs = netMs / 3600000;
        const otMin = Math.max(0, Math.floor(totalHrs * 60) - 480);
        const otH = Math.floor(otMin / 60);
        const otM = otMin % 60;
        const otStr = otH > 0 ? `${otH}h ${otM}m` : `${otM}m`;
        const regMin = Math.min(totalMin, 480);
        const regH = Math.floor(regMin / 60);
        const regM = regMin % 60;
        const regStr = regH > 0 ? `${regH}h ${regM}m` : `${regM}m`;
        return (
          <View style={styles.hoursCard}>
            <Text style={styles.hoursTitle}>TODAY'S HOURS</Text>
            <View style={styles.hoursRow}>
              <View style={styles.hourBlock}><Text style={styles.hourValue}>{regStr}</Text><Text style={styles.hourLabel}>Regular</Text></View>
              {otMin > 0 && <View style={styles.hourBlock}><Text style={[styles.hourValue, { color: C.amber }]}>{otStr}</Text><Text style={styles.hourLabel}>Overtime</Text></View>}
              <View style={styles.hourBlock}><Text style={styles.hourValue}>{hrsStr}</Text><Text style={styles.hourLabel}>Total</Text></View>
            </View>
          </View>
        );
      })()}

      {/* Demo Toggle */}
      <View style={styles.demoSection}>
        <TouchableOpacity style={[styles.demoToggle, demoMode && styles.demoToggleActive]} onPress={() => setDemoMode((d) => !d)}>
          <Text style={demoMode ? styles.demoToggleTextActive : styles.demoToggleText}>{demoMode ? 'DEMO MODE ON' : 'DEMO MODE'}</Text>
        </TouchableOpacity>
        {demoMode && (
          <TouchableOpacity style={styles.demoGpsToggle} onPress={() => setDemoOnSite((s) => !s)}>
            <Text style={styles.demoGpsText}>Simulate: {demoOnSite ? 'On Site' : 'Off Site'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Geofence Modal */}
      <Modal visible={showGeofenceModal} transparent animationType="fade" onRequestClose={() => { setShowGeofenceModal(false); pendingAction.current = null; releaseClockInSubmit(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>OFF-SITE WARNING</Text>
            <Text style={styles.modalBody}>You are {gpsDistance}m from the job site. Your punch will be flagged for office review.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setShowGeofenceModal(false); pendingAction.current = null; releaseClockInSubmit(); }}>
                <Text style={styles.modalBtnCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleGeofenceOverride}>
                <Text style={styles.modalBtnConfirmText}>PUNCH ANYWAY</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Clock Out Modal */}
      <Modal visible={showClockOutModal} transparent animationType="fade" onRequestClose={() => { if (!clockOutConfirming.current) { setShowClockOutModal(false); releaseClockOutSubmit(); } }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CLOCK OUT</Text>
            <Text style={styles.modalBody}>
              {clockOutProcessing ? 'Please wait' : `Shift time: ${elapsedStr}`}
            </Text>
            {!punchHistory.some((p) => p.punch_type === 'lunch_start') && (
              <View style={styles.noLunchWarning}><Text style={styles.noLunchText}>No lunch taken — this will be flagged.</Text></View>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                disabled={clockOutConfirming.current}
                onPress={() => { if (clockOutConfirming.current) return; setShowClockOutModal(false); releaseClockOutSubmit(); }}
              >
                <Text style={styles.modalBtnCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, clockOutProcessing && { opacity: 0.7 }]}
                disabled={clockOutProcessing}
                onPress={confirmClockOut}
              >
                <Text style={styles.modalBtnConfirmText}>
                  {clockOutProcessing ? 'CLOCKING OUT...' : 'CONFIRM'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </LinenBackground>
  );
}

// ── Helpers ────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatElapsed(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function formatPunchType(type) {
  return { clock_in: 'Clock In', clock_out: 'Clock Out', lunch_start: 'Lunch Start', lunch_end: 'Lunch End', drive_start: 'Drive Start', drive_end: 'Drive End' }[type] || type;
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.linen },
  screenTransparent: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: S.md, paddingBottom: S.xxl },

  punchIntoWrap: { paddingHorizontal: S.md, paddingTop: S.md },
  punchInto: {
    backgroundColor: C.dark, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: S.md,
    marginBottom: S.md, alignItems: 'center',
  },
  punchIntoKicker: {
    fontFamily: F.display, fontSize: 12, color: C.textFaint,
    letterSpacing: 1.5, textAlign: 'center',
  },
  punchIntoNum: {
    fontFamily: F.display, fontSize: 36, color: C.teal,
    letterSpacing: 1, marginTop: 4, marginBottom: 12,
  },
  chooseJobBtn: {
    alignSelf: 'stretch', backgroundColor: C.linenCard, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  chooseJobText: {
    fontFamily: F.display, fontSize: 16, color: C.textHead, letterSpacing: 1.5,
  },

  choiceContainer: { flex: 1, justifyContent: 'center', padding: S.lg },
  choiceTitle: { fontFamily: F.display, fontSize: 24, color: C.textHead, letterSpacing: 2, textAlign: 'center', marginBottom: S.xs },
  choiceBody: { fontFamily: F.body, fontSize: 16, color: C.textBody, textAlign: 'center', marginBottom: S.xl, lineHeight: 24 },
  choiceBtn: { backgroundColor: C.dark, borderRadius: 12, paddingVertical: 24, paddingHorizontal: S.lg, alignItems: 'center', marginBottom: S.md },
  choiceBtnText: { fontFamily: F.display, fontSize: 20, color: C.teal, letterSpacing: 2 },
  choiceBtnSub: { fontFamily: F.body, fontSize: 13, color: C.textFaint, marginTop: 4 },
  choiceBtnAlt: { backgroundColor: C.linenCard, borderRadius: 12, paddingVertical: 24, paddingHorizontal: S.lg, alignItems: 'center', borderWidth: 1, borderColor: C.borderStrong },
  choiceBtnAltText: { fontFamily: F.display, fontSize: 20, color: C.textHead, letterSpacing: 2 },
  choiceBtnAltSub: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 4 },

  clockContainer: { alignItems: 'center', marginBottom: S.lg, marginTop: S.sm },
  liveTime: { fontFamily: F.display, fontSize: 48, color: C.textHead, letterSpacing: 2 },
  elapsed: { fontFamily: F.displayMed, fontSize: 18, color: C.tealDark, letterSpacing: 2, marginTop: 4 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: S.xs, marginBottom: S.lg },
  statusChip: { backgroundColor: C.dark, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: F.bodyMed, fontSize: 11, color: C.teal, letterSpacing: 0.5 },

  progressRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: S.lg },
  progressDotWrap: { flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.linenDeep, borderWidth: 2, borderColor: C.borderStrong },
  progressDotDone: { backgroundColor: C.teal, borderColor: C.teal },
  progressDotActive: { backgroundColor: C.dark, borderColor: C.teal, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  progressLine: { width: 20, height: 2, backgroundColor: C.borderStrong },
  progressLineDone: { backgroundColor: C.teal },

  bigButton: { backgroundColor: C.dark, borderRadius: 12, paddingVertical: 28, alignItems: 'center', marginBottom: S.md, minHeight: 100, justifyContent: 'center' },
  bigButtonOut: { borderWidth: 2, borderColor: C.red },
  bigButtonDrive: { borderWidth: 2, borderColor: C.pw },
  bigButtonProcessing: { opacity: 0.7 },
  bigButtonText: { fontFamily: F.display, fontSize: 28, color: C.teal, letterSpacing: 3 },
  bigButtonSub: { fontFamily: F.body, fontSize: 13, color: C.textFaint, marginTop: 6 },

  lunchCard: { backgroundColor: C.dark, borderRadius: 12, paddingVertical: S.xl, alignItems: 'center', marginBottom: S.md, borderWidth: 2, borderColor: C.amber },
  lunchTitle: { fontFamily: F.display, fontSize: 18, color: C.teal, letterSpacing: 2 },
  lunchTimer: { fontFamily: F.display, fontSize: 52, color: C.amber, letterSpacing: 3, marginTop: S.xs },
  lunchLocked: { fontFamily: F.bodyMed, fontSize: 12, color: C.amber, letterSpacing: 2, marginTop: S.sm },

  completeCard: { backgroundColor: C.dark, borderRadius: 12, paddingVertical: S.xl, alignItems: 'center', marginBottom: S.md, borderWidth: 2, borderColor: C.teal },
  completeTitle: { fontFamily: F.display, fontSize: 24, color: C.teal, letterSpacing: 2 },
  completeBody: { fontFamily: F.body, fontSize: 14, color: C.textFaint, marginTop: S.xs },
  completeHours: { fontFamily: F.displayMed, fontSize: 18, color: C.teal, marginTop: S.sm, letterSpacing: 1 },

  historySection: { marginTop: S.lg },
  historyTitle: { fontFamily: F.display, fontSize: 14, color: C.textMuted, letterSpacing: 2, marginBottom: S.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.linenCard, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  historyType: { fontFamily: F.bodyMed, fontSize: 14, color: C.textBody, flex: 1 },
  historyTime: { fontFamily: F.body, fontSize: 14, color: C.textLight },
  offSiteBadge: { backgroundColor: C.dark, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  offSiteText: { fontFamily: F.bodyMed, fontSize: 10, color: C.amber, letterSpacing: 0.5 },

  hoursCard: { backgroundColor: C.dark, borderRadius: 10, padding: S.md, marginTop: S.lg },
  hoursTitle: { fontFamily: F.display, fontSize: 12, color: C.textFaint, letterSpacing: 2, marginBottom: S.sm, textAlign: 'center' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-evenly' },
  hourBlock: { alignItems: 'center' },
  hourValue: { fontFamily: F.display, fontSize: 28, color: C.teal },
  hourLabel: { fontFamily: F.body, fontSize: 12, color: C.textFaint, marginTop: 2 },

  demoSection: { marginTop: S.xl, alignItems: 'center', gap: S.sm },
  demoToggle: { borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  demoToggleActive: { borderColor: C.amber, backgroundColor: 'rgba(249,168,37,0.1)' },
  demoToggleText: { fontFamily: F.bodyMed, fontSize: 12, color: C.textFaint, letterSpacing: 1 },
  demoToggleTextActive: { fontFamily: F.bodyMed, fontSize: 12, color: C.amber, letterSpacing: 1 },
  demoGpsToggle: { borderWidth: 1, borderColor: C.amber, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6 },
  demoGpsText: { fontFamily: F.body, fontSize: 12, color: C.amber },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  modalCard: { backgroundColor: C.linenCard, borderRadius: 12, padding: S.lg, width: '100%', maxWidth: 360 },
  modalTitle: { fontFamily: F.display, fontSize: 22, color: C.textHead, letterSpacing: 2, marginBottom: S.sm, textAlign: 'center' },
  modalBody: { fontFamily: F.body, fontSize: 15, color: C.textBody, textAlign: 'center', lineHeight: 22, marginBottom: S.md },
  noLunchWarning: { backgroundColor: 'rgba(249,168,37,0.15)', borderRadius: 8, padding: S.sm, marginBottom: S.md, borderWidth: 1, borderColor: C.amber },
  noLunchText: { fontFamily: F.bodyMed, fontSize: 13, color: '#7a5000', textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: S.sm },
  modalBtnCancel: { flex: 1, backgroundColor: C.linenDeep, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancelText: { fontFamily: F.display, fontSize: 14, color: C.textBody, letterSpacing: 1 },
  modalBtnConfirm: { flex: 1, backgroundColor: C.dark, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  modalBtnConfirmText: { fontFamily: F.display, fontSize: 14, color: C.teal, letterSpacing: 1 },
});
