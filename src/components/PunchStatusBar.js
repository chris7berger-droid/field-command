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
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { tod } from '../lib/utils';
import { DUTY_LOGS, PRT_DUTY, dutyState } from '../lib/dayDuty';

const STATUS_CONFIG = {
  not_clocked_in: { label: 'NOT CLOCKED IN', color: C.amber,     bg: '#2a2010' },
  driving:        { label: 'DRIVING',        color: C.amber,     bg: '#2a2010' },
  on_site:        { label: 'ON SITE',        color: C.teal,      bg: C.dark },
  on_lunch:       { label: 'ON LUNCH',       color: C.amber,     bg: '#2a2010' },
  shift_done:     { label: 'SHIFT COMPLETE', color: C.teal,      bg: C.dark },
};

const ALERT_RED = '#7f1d1d';
const ALERT_AMBER = '#2a2010';

export default function PunchStatusBar() {
  const [now, setNow] = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const today = tod();
  const todayStartIso = new Date(today + 'T00:00:00').toISOString();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: punches } = useQuery(
    `SELECT * FROM time_punches WHERE punch_date = ? ORDER BY punch_time ASC`,
    [today]
  );

  // Query all daily log entries for today (across all jobs)
  const { data: logEntries } = useQuery(
    `SELECT job_id, entry_type FROM daily_log_entries WHERE created_at >= ?`,
    [todayStartIso]
  );

  const { data: prtReports } = useQuery(
    `SELECT job_id, status FROM daily_production_reports
      WHERE report_date = ? AND (status = 'submitted' OR status = 'approved')`,
    [today]
  );

  const { status, elapsed } = deriveStatus(punches || [], now);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_clocked_in;
  const isActive = status !== 'clocked_out' && status !== 'shift_done';

  // Alerts match clock-out: SOD / MOD / EOD / PRT for the job they clocked into,
  // not "any job today."
  const alerts = useMemo(() => {
    const punchList = punches || [];
    if (punchList.length === 0) return [];

    const logsByJob = new Map();
    for (const e of (logEntries || [])) {
      const id = String(e.job_id);
      if (!logsByJob.has(id)) logsByJob.set(id, new Set());
      logsByJob.get(id).add(e.entry_type);
    }
    const prtByJob = new Set(
      (prtReports || []).map((r) => String(r.job_id))
    );

    const byJob = new Map();
    for (const p of punchList) {
      const id = String(p.job_id);
      if (!byJob.has(id)) byJob.set(id, []);
      byJob.get(id).push(p);
    }

    const seen = new Set();
    const result = [];
    const pushAlert = (label, color, bg) => {
      if (seen.has(label)) return;
      seen.add(label);
      result.push({ label, color, bg });
    };

    for (const [, list] of byJob) {
      const clockIn = list.find((p) => p.punch_type === 'clock_in');
      if (!clockIn) continue;
      const clockOut = list.find((p) => p.punch_type === 'clock_out');
      const jobId = String(clockIn.job_id);
      const types = logsByJob.get(jobId) || new Set();
      const prtDone = prtByJob.has(jobId);

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
      if (prtState === 'due' || (clockOut && !prtDone)) {
        pushAlert('PRT NOT SUBMITTED', '#ef4444', ALERT_RED);
      }
    }

    return result;
  }, [punches, logEntries, prtReports, now]);

  // Pulse animation for active states
  useEffect(() => {
    if (isActive || alerts.length > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, alerts.length]);

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
      {alerts.map((alert, i) => (
        <View key={i} style={[styles.alertBar, { backgroundColor: alert.bg }]}>
          <Animated.View style={[styles.alertDot, { backgroundColor: alert.color, opacity: pulseAnim }]} />
          <Text style={[styles.alertLabel, { color: alert.color }]}>{alert.label}</Text>
        </View>
      ))}
    </View>
  );
}

function deriveStatus(punches, now) {
  if (punches.length === 0) {
    return { status: 'not_clocked_in', elapsed: null };
  }

  const last = punches[punches.length - 1];
  const lastTime = new Date(last.punch_time);
  const elapsedMs = now.getTime() - lastTime.getTime();
  const elapsed = formatElapsed(elapsedMs);

  switch (last.punch_type) {
    case 'drive_start':
      return { status: 'driving', elapsed };
    case 'drive_end': {
      const hasClockOut = punches.some((p) => p.punch_type === 'clock_out');
      if (hasClockOut) return { status: 'shift_done', elapsed: null };
      const hasClockIn = punches.some((p) => p.punch_type === 'clock_in');
      if (!hasClockIn) return { status: 'not_clocked_in', elapsed: null };
      return { status: 'on_site', elapsed };
    }
    case 'clock_in':
      return { status: 'on_site', elapsed };
    case 'lunch_start':
      return { status: 'on_lunch', elapsed };
    case 'lunch_end':
      return { status: 'on_site', elapsed };
    case 'clock_out': return { status: 'shift_done', elapsed: null };
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
});
