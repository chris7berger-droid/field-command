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
  phaseAfterRefreshResult,
} from '../lib/manualRefresh';

export default function RefreshControl({ active = true }) {
  const [phase, setPhase] = useState(REFRESH_PHASE.idle);
  const guardRef = useRef(createRefreshInFlightGuard());
  const holdRef = useRef(null);
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    if (!active) {
      abortRef.current.abort();
      if (holdRef.current) clearTimeout(holdRef.current);
      return undefined;
    }
    if (abortRef.current.signal.aborted) {
      abortRef.current = new AbortController();
    }
    const controller = abortRef.current;
    return () => {
      controller.abort();
      if (holdRef.current) clearTimeout(holdRef.current);
    };
  }, [active]);

  const onPress = useCallback(async () => {
    if (!guardRef.current.tryBegin()) return;
    if (holdRef.current) clearTimeout(holdRef.current);
    const signal = abortRef.current.signal;
    setPhase(REFRESH_PHASE.refreshing);
    try {
      const result = await refreshPowerSync({ signal });
      const next = phaseAfterRefreshResult(result, signal);
      if (!next) return;
      setPhase(next);
    } catch {
      if (signal.aborted) return;
      setPhase(REFRESH_PHASE.noSignal);
    } finally {
      guardRef.current.end();
      if (signal.aborted) return;
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
