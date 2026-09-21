/**
 * Compact global REFRESH pill. Lives in authenticated app chrome, not PunchStatusBar.
 * A live PowerSync session is not torn down; local watched queries update on their own.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F } from '../lib/tokens';
import { refreshPowerSync } from '../lib/powersync';
import {
  UPDATED_HOLD_MS,
  REFRESH_PHASE,
  refreshLabel,
  createRefreshInFlightGuard,
} from '../lib/manualRefresh';

export default function RefreshControl() {
  const [phase, setPhase] = useState(REFRESH_PHASE.idle);
  const guardRef = useRef(createRefreshInFlightGuard());
  const holdRef = useRef(null);

  useEffect(() => () => {
    if (holdRef.current) clearTimeout(holdRef.current);
  }, []);

  const onPress = useCallback(async () => {
    if (!guardRef.current.tryBegin()) return;
    if (holdRef.current) clearTimeout(holdRef.current);
    setPhase(REFRESH_PHASE.refreshing);
    try {
      const result = await refreshPowerSync();
      setPhase(result.outcome === 'updated' ? REFRESH_PHASE.updated : REFRESH_PHASE.noSignal);
    } catch {
      setPhase(REFRESH_PHASE.noSignal);
    } finally {
      guardRef.current.end();
      holdRef.current = setTimeout(() => setPhase(REFRESH_PHASE.idle), UPDATED_HOLD_MS);
    }
  }, []);

  const busy = phase === REFRESH_PHASE.refreshing;
  const noSignal = phase === REFRESH_PHASE.noSignal;
  const accent = noSignal ? C.amber : C.teal;

  return (
    <TouchableOpacity
      style={[styles.pill, { borderColor: accent }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={busy}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Refresh"
      accessibilityState={{ busy, disabled: busy }}
    >
      <Text style={[styles.label, { color: accent }]}>{refreshLabel(phase)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: C.darkRaised,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  label: {
    fontFamily: F.display,
    fontSize: 13,
    letterSpacing: 1.5,
  },
});
