/**
 * When to re-establish the PowerSync stream from App.js.
 * Do not connect while live, while the SDK is already connecting/retrying,
 * while an App.js connect is in flight, or during the post-attempt cooldown.
 */
export const POWERSYNC_ENSURE_COOLDOWN_MS = 15000;

export function shouldEnsurePowerSyncConnect(status, {
  inFlight = false,
  cooldownUntil = 0,
  now = Date.now(),
} = {}) {
  if (inFlight) return false;
  if (now < cooldownUntil) return false;
  if (status?.connected) return false;
  if (status?.connecting) return false;
  return true;
}
