/**
 * PunchStatusBar — persistent header showing current punch state + daily log alerts.
 * Visible on every screen so crew always knows where they stand.
 *
 * Alert logic (Hawthorne Effect — persistent, not dismissable):
 *   - 15 min after clock in, no SOD → amber "SOD LOG NEEDED"
 *   - 4 hrs on site, no MOD → amber "MID DAY LOG DUE"
 *   - After clock out, no EOD → red "EOD LOG REQUIRED"
 *   - After clock out, no PRT → red "PRT NOT SUBMITTED"
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useQuery } from '@powersync/react';
import { C, F, S } from '../lib/tokens';
import { tod } from '../lib/utils';

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
    `SELECT entry_type FROM daily_log_entries WHERE created_at >= ?`,
    [today + 'T00:00:00']
  );

  // Query PRT status for today
  const { data: prtReports } = useQuery(
    `SELECT status FROM daily_production_reports WHERE report_date = ? AND (status = 'submitted' OR status = 'approved') LIMIT 1`,
    [today]
  );

  const { status, elapsed } = deriveStatus(punches || [], now);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_clocked_in;
  const isActive = status !== 'clocked_out' && status !== 'shift_done';

  // Derive alerts
  const alerts = useMemo(() => {
    const result = [];
    const punchList = punches || [];
    if (punchList.length === 0) return result;

    const clockIn = punchList.find(p => p.punch_type === 'clock_in');
    const clockOut = punchList.find(p => p.punch_type === 'clock_out');
    if (!clockIn) return result;

    const clockInTime = new Date(clockIn.punch_time).getTime();
    const msSinceClockIn = now.getTime() - clockInTime;
    const submittedTypes = new Set((logEntries || []).map(e => e.entry_type));
    const prtDone = prtReports && prtReports.length > 0;

    // SOD: 15 min after clock in, no SOD
    if (msSinceClockIn > 15 * 60 * 1000 && !submittedTypes.has('SOD')) {
      result.push({ label: 'SOD LOG NEEDED', color: C.amber, bg: ALERT_AMBER });
    }

    // MOD: 4 hours on site, no MOD
    if (msSinceClockIn > 4 * 60 * 60 * 1000 && !submittedTypes.has('MOD')) {
      result.push({ label: 'MID DAY LOG DUE', color: C.amber, bg: ALERT_AMBER });
    }

    // After clock out
    if (clockOut) {
      if (!submittedTypes.has('EOD')) {
        result.push({ label: 'EOD LOG REQUIRED', color: '#ef4444', bg: ALERT_RED });
      }
      if (!prtDone) {
        result.push({ label: 'PRT NOT SUBMITTED', color: '#ef4444', bg: ALERT_RED });
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
