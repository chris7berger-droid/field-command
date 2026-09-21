/**
 * Manual PowerSync refresh — reconnect for a new checkpoint, then wait for a
 * post-tap completion signal. Does not clear the local DB or touch CRUD.
 */

export const REFRESH_TIMEOUT_MS = 15000;
export const UPDATED_HOLD_MS = 2000;

export const REFRESH_PHASE = {
  idle: 'idle',
  refreshing: 'refreshing',
  updated: 'updated',
  noSignal: 'noSignal',
};

export const REFRESH_LABEL = {
  idle: 'REFRESH',
  refreshing: 'REFRESHING…',
  updated: 'UPDATED',
  noSignal: 'NO SIGNAL',
};

export function refreshLabel(phase) {
  return REFRESH_LABEL[phase] || REFRESH_LABEL.idle;
}

export function isPostTapCheckpointComplete(status, startedAt) {
  if (!status || !status.connected) return false;
  if (status.dataFlowStatus?.downloading) return false;
  const last = status.lastSyncedAt;
  if (last == null || last === '') return false;
  const lastMs = typeof last?.getTime === 'function' ? last.getTime() : Date.parse(last);
  if (!Number.isFinite(lastMs)) return false;
  return lastMs >= startedAt;
}

export function refreshOutcome(waitResult) {
  return waitResult?.complete ? 'updated' : 'noSignal';
}

/**
 * Wait until the DB has applied a checkpoint at or after startedAt.
 * connect() resolving is not enough — callers must wait through this.
 */
export async function waitForPostTapCheckpoint(db, startedAt, options = {}) {
  const timeoutMs = options.timeoutMs ?? REFRESH_TIMEOUT_MS;
  const outer = options.signal;

  if (isPostTapCheckpointComplete(db.currentStatus, startedAt)) {
    return { complete: true, timedOut: false };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }

  try {
    await db.waitForStatus(
      (status) => isPostTapCheckpointComplete(status, startedAt),
      controller.signal
    );
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuterAbort);
  }

  if (isPostTapCheckpointComplete(db.currentStatus, startedAt)) {
    return { complete: true, timedOut: false };
  }
  return { complete: false, timedOut, aborted: !timedOut };
}

/**
 * connect() then wait. UPDATED is only allowed when wait reports complete.
 */
export async function runManualRefresh({
  connect,
  wait,
  startedAt = Date.now(),
  timeoutMs = REFRESH_TIMEOUT_MS,
  signal,
} = {}) {
  try {
    await connect();
  } catch {
    return {
      startedAt,
      complete: false,
      timedOut: false,
      outcome: 'noSignal',
    };
  }

  const waitResult = await wait(startedAt, { timeoutMs, signal });
  return {
    startedAt,
    complete: !!waitResult.complete,
    timedOut: !!waitResult.timedOut,
    outcome: refreshOutcome(waitResult),
  };
}

export function createRefreshInFlightGuard() {
  let inFlight = false;
  return {
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end() {
      inFlight = false;
    },
    isInFlight() {
      return inFlight;
    },
  };
}
