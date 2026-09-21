/**
 * Compact global REFRESH chip. Lives in authenticated app chrome, not PunchStatusBar.
 * Tapping asks PowerSync for a new session/checkpoint. Local watched queries
 * pick up any new rows on their own.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, S } from '../lib/tokens';
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
  const color = phase === REFRESH_PHASE.noSignal ? C.amber : C.teal;

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Refresh"
      accessibilityState={{ busy, disabled: busy }}
    >
      <Text style={[styles.label, { color }]}>{refreshLabel(phase)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 4,
    paddingHorizontal: S.sm,
  },
  label: {
    fontFamily: F.display,
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
