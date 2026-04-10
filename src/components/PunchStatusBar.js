/**
 * PunchStatusBar — persistent header showing current punch state.
 * Visible on every screen so crew always knows where they stand.
 */
import React, { useState, useEffect, useRef } from 'react';
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

export default function PunchStatusBar() {
  const [now, setNow] = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: punches } = useQuery(
    `SELECT * FROM time_punches WHERE punch_date = ? ORDER BY punch_time ASC`,
    [tod()]
  );

  const { status, elapsed } = deriveStatus(punches || [], now);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_clocked_in;
  const isActive = status !== 'clocked_out' && status !== 'shift_done';

  // Pulse animation for active states
  useEffect(() => {
    if (isActive) {
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
  }, [isActive]);

  return (
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
});
