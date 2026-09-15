/**
 * PunchStatusBar — persistent header showing current punch state + daily log alerts.
 * Visible on every screen so crew always knows where they stand.
 *
 * Alert logic (Hawthorne — persistent, not dismissable):
 *   - 15 min after clock in, no SOD → amber "SOD LOG NEEDED"
 *   - 4 hrs / noon, no MOD → amber "MID DAY LOG DUE"
 *   - 6 hrs / 3pm, no EOD → red "EOD LOG REQUIRED"
 *   - same window, no PRT → red "PRT NOT SUBMITTED"
 * Clock-out is blocked until SOD, MOD, EOD, and PRT are in.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity, Alert } from 'react-native';
import { useQuery, usePowerSync } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { tod } from '../lib/utils';
import { getCurrentPosition } from '../lib/location';
import { fetchWeather } from '../lib/weather';
import { requireCanonicalTeamMemberId, isMissingTeamMemberIdError } from '../lib/activation';
import {
  DUTY_LOGS, PRT_DUTY, dutyState,
  punchLookbackDate, openClockInPunch, isOvernightShift,
  ackNightWork, isNightWorkAcked, punchDay, punchesForOpenShift,
} from '../lib/dayDuty';

const STATUS_CONFIG = {
  not_clocked_in: { label: 'NOT CLOCKED IN', color: C.amber,     bg: '#2a2010' },
  driving:        { label: 'DRIVING',        color: C.amber,     bg: '#2a2010' },
  on_site:        { label: 'ON SITE',        color: C.teal,      bg: C.dark },
  on_lunch:       { label: 'ON LUNCH',       color: C.amber,     bg: '#2a2010' },
  shift_done:     { label: 'SHIFT COMPLETE', color: C.teal,      bg: C.dark },
};

const ALERT_RED = '#7f1d1d';
const ALERT_AMBER = '#2a2010';

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function PunchStatusBar() {
  const db = usePowerSync();
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [, setNightAck] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const today = tod();
  const lookback = punchLookbackDate(today);
  const lookbackIso = new Date(lookback + 'T00:00:00').toISOString();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: punches } = useQuery(
    `SELECT * FROM time_punches WHERE punch_date >= ? ORDER BY punch_time ASC`,
    [lookback]
  );

  const { data: logEntries } = useQuery(
    `SELECT job_id, entry_type, created_at FROM daily_log_entries WHERE created_at >= ?`,
    [lookbackIso]
  );

  const { data: prtReports } = useQuery(
    `SELECT job_id, status, report_date FROM daily_production_reports
      WHERE report_date >= ? AND (status = 'submitted' OR status = 'approved')`,
    [lookback]
  );

  const punchList = punches || [];
  const openPunch = openClockInPunch(punchList);
  const overnight = isOvernightShift(punchList, today);
  const nightChosen = overnight && isNightWorkAcked(openPunch?.id);
  const showOvernight = overnight && !nightChosen;

  const { status, elapsed } = deriveStatus(punchList, now, today);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_clocked_in;
  const isActive = status !== 'clocked_out' && status !== 'shift_done';

  const workDate = punchDay(openPunch) || today;

  const alerts = useMemo(() => {
    if (showOvernight) return [];
    if (!openPunch) return [];

    const clockIn = openPunch;
    const jobId = String(clockIn.job_id);
    const startMs = new Date(clockIn.punch_time).getTime();
    const types = new Set();
    for (const e of (logEntries || [])) {
      if (String(e.job_id) !== jobId || !e.created_at) continue;
      const when = new Date(e.created_at);
      if (Number.isNaN(when.getTime()) || when.getTime() < startMs) continue;
      types.add(e.entry_type);
    }
    const prtDone = (prtReports || []).some(
      (r) => String(r.job_id) === jobId && r.report_date === workDate
    );

    const result = [];
    const pushAlert = (label, color, bg) => {
      result.push({ label, color, bg });
    };

    for (const d of DUTY_LOGS) {
      const state = dutyState({
        done: types.has(d.key),
        clockInTime: clockIn.punch_time,
        now,
        dueAfterMs: d.dueAfterMs,
        dueHour: d.dueHour,
      });
      if (state !== 'due') continue;
      if (d.key === 'SOD') pushAlert('SOD LOG NEEDED', C.amber, ALERT_AMBER);
      if (d.key === 'MOD') pushAlert('MID DAY LOG DUE', C.amber, ALERT_AMBER);
      if (d.key === 'EOD') pushAlert('EOD LOG REQUIRED', '#ef4444', ALERT_RED);
    }

    const prtState = dutyState({
      done: prtDone,
      clockInTime: clockIn.punch_time,
      now,
      dueAfterMs: PRT_DUTY.dueAfterMs,
      dueHour: PRT_DUTY.dueHour,
    });
    if (prtState === 'due') {
      pushAlert('PRT NOT SUBMITTED', '#ef4444', ALERT_RED);
    }

    return result;
  }, [logEntries, prtReports, now, workDate, showOvernight, openPunch]);

  const punchOutNow = useCallback(async () => {
    if (!openPunch || busy) return;
    setBusy(true);
    let lat = null;
    let lng = null;
    let onSite = 0;
    let gpsOverride = 1;
    let weather = null;
    try {
      const pos = await getCurrentPosition();
      lat = pos.latitude;
      lng = pos.longitude;
      gpsOverride = 0;
      onSite = 1;
      weather = await fetchWeather(lat, lng);
    } catch {
      // Still clock out. They're fixing a missed punch, not starting a shift.
    }
    try {
      const actorId = requireCanonicalTeamMemberId(openPunch.employee_id, 'time punch write');
      const stamp = new Date().toISOString();
      await db.execute(
        `INSERT INTO time_punches (id, job_id, employee_id, punch_type, punch_time, punch_date,
          latitude, longitude, on_site, gps_override, weather_temp, weather_condition, synced, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          generateId(),
          openPunch.job_id,
          actorId,
          'clock_out',
          stamp,
          today,
          lat, lng, onSite, gpsOverride,
          weather?.temp_f || null, weather?.condition || null,
          stamp,
        ]
      );
    } catch (e) {
      if (isMissingTeamMemberIdError(e)) {
        Alert.alert('Field Command not active', 'Your account is not activated for Field Command.');
      } else {
        Alert.alert('Could not punch out', e?.message || 'Try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [openPunch, busy, db, today]);

  const chooseNightWork = useCallback(() => {
    ackNightWork(openPunch?.id);
    setNightAck((n) => n + 1);
  }, [openPunch]);

  // Pulse animation for active states
  useEffect(() => {
    if (isActive || alerts.length > 0 || showOvernight) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isActive, alerts.length, showOvernight]);

  return (
    <View>
      <View style={[styles.bar, { backgroundColor: config.bg }]}>
        <View style={styles.dotWrap}>
          {isActive && (
            <Animated.View style={[styles.dotGlow, { backgroundColor: config.color, opacity: pulseAnim }]} />
          )}
          <View style={[styles.dot, { backgroundColor: config.color }]} />
        </View>
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
        {elapsed ? (
          <Text style={[styles.elapsed, { color: config.color }]}>{elapsed}</Text>
        ) : null}
      </View>
      {showOvernight ? (
        <View style={styles.overnight}>
          <Text style={styles.overnightTitle}>Still punched in from yesterday.</Text>
          <TouchableOpacity
            style={styles.overnightBtn}
            activeOpacity={0.7}
            disabled={busy}
            onPress={punchOutNow}
          >
            <Text style={styles.overnightBtnText}>
              {busy ? 'PUNCHING OUT…' : 'PUNCH OUT NOW AND NOTIFY OFFICE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overnightBtnSecondary}
            activeOpacity={0.7}
            disabled={busy}
            onPress={chooseNightWork}
          >
            <Text style={styles.overnightBtnSecondaryText}>NIGHT WORK</Text>
          </TouchableOpacity>
        </View>
      ) : alerts.map((alert, i) => (
        <View key={i} style={[styles.alertBar, { backgroundColor: alert.bg }]}>
          <Animated.View style={[styles.alertDot, { backgroundColor: alert.color, opacity: pulseAnim }]} />
          <Text style={[styles.alertLabel, { color: alert.color }]}>{alert.label}</Text>
        </View>
      ))}
    </View>
  );
}

function deriveStatus(punches, now, today) {
  const shift = punchesForOpenShift(punches, null, today);
  if (shift.length === 0) {
    return { status: 'not_clocked_in', elapsed: null };
  }

  const last = shift[shift.length - 1];
  const lastTime = new Date(last.punch_time);
  const elapsedMs = now.getTime() - lastTime.getTime();
  const elapsed = formatElapsed(elapsedMs);

  switch (last.punch_type) {
    case 'drive_start':
      return { status: 'driving', elapsed };
    case 'drive_end': {
      const hasClockOut = shift.some((p) => p.punch_type === 'clock_out');
      if (hasClockOut) return { status: 'shift_done', elapsed: null };
      const hasClockIn = shift.some((p) => p.punch_type === 'clock_in');
      if (!hasClockIn) return { status: 'not_clocked_in', elapsed: null };
      return { status: 'on_site', elapsed };
    }
    case 'clock_in':
      return { status: 'on_site', elapsed };
    case 'lunch_start':
      return { status: 'on_lunch', elapsed };
    case 'lunch_end':
      return { status: 'on_site', elapsed };
    case 'clock_out': {
      const hasIn = shift.some((p) => p.punch_type === 'clock_in');
      if (!hasIn) return { status: 'not_clocked_in', elapsed: null };
      return { status: 'shift_done', elapsed: null };
    }
    default:
      return { status: 'not_clocked_in', elapsed: null };
  }
}

function formatElapsed(ms) {
  if (ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 10,
    gap: 10,
  },
  dotWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGlow: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  label: {
    fontFamily: F.display,
    fontSize: 16,
    letterSpacing: 3,
  },
  elapsed: {
    fontFamily: F.display,
    fontSize: 16,
    letterSpacing: 1,
  },
  alertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 6,
    gap: 8,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertLabel: {
    fontFamily: F.display,
    fontSize: 13,
    letterSpacing: 2,
  },
  overnight: {
    backgroundColor: '#2a2010',
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    paddingBottom: S.md,
    gap: S.sm,
  },
  overnightTitle: {
    fontFamily: F.display,
    fontSize: 16,
    color: C.amber,
    letterSpacing: 1,
    marginBottom: 4,
  },
  overnightBtn: {
    backgroundColor: C.dark,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.amber,
  },
  overnightBtnText: {
    fontFamily: F.display,
    fontSize: 13,
    color: C.amber,
    letterSpacing: 1,
    textAlign: 'center',
  },
  overnightBtnSecondary: {
    backgroundColor: C.dark,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  overnightBtnSecondaryText: {
    fontFamily: F.display,
    fontSize: 16,
    color: C.teal,
    letterSpacing: 2,
  },
});
