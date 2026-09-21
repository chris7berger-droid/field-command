/**
 * When to re-establish the PowerSync stream from App.js, and how callers
 * share one db.connect() — the SDK tears the stream down on every connect().
 */

export const POWERSYNC_ENSURE_COOLDOWN_MS = 15000;

export function isStreamDead(status) {
  return !status?.connected && !status?.connecting;
}

/**
 * Concurrent callers share one in-flight runConnect(). A second call does
 * not start another db.connect().
 */
export function createConnectCoalescer(runConnect) {
  let inFlight = null;
  return {
    connect() {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve(runConnect()).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    isInFlight() {
      return inFlight != null;
    },
  };
}

export function nextEnsureAction(status, {
  inFlight = false,
  cooldownUntil = 0,
  now = Date.now(),
} = {}) {
  if (inFlight) return { type: 'none' };
  if (status?.connected) return { type: 'none' };
  if (status?.connecting) return { type: 'none' };
  if (now < cooldownUntil) {
    return { type: 'wakeup', delayMs: cooldownUntil - now };
  }
  return { type: 'connect' };
}

export function shouldEnsurePowerSyncConnect(status, opts) {
  return nextEnsureAction(status, opts).type === 'connect';
}

/** After a connect attempt settles: only a truly dead stream gets a recovery timer. */
export function afterConnectAttempt(status, {
  now = Date.now(),
  cooldownMs = POWERSYNC_ENSURE_COOLDOWN_MS,
} = {}) {
  if (status?.connected || status?.connecting) {
    return { cooldownUntil: 0, wakeupDelayMs: null };
  }
  return { cooldownUntil: now + cooldownMs, wakeupDelayMs: cooldownMs };
}
