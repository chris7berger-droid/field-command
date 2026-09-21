/**
 * Manual PowerSync refresh. A live stream is the check — do not tear it down.
 * Reconnect only when disconnected. Does not clear the local DB or touch CRUD.
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

function lastSyncedMs(status) {
  const last = status?.lastSyncedAt;
  if (last == null || last === '') return NaN;
  return typeof last?.getTime === 'function' ? last.getTime() : Date.parse(last);
}

function hasCompletedSync(status) {
  if (status?.hasSynced) return true;
  return Number.isFinite(lastSyncedMs(status));
}

/** Live session is current: connected, not downloading, already synced once. */
export function isLiveCurrent(status) {
  if (!status?.connected) return false;
  if (status.dataFlowStatus?.downloading) return false;
  return hasCompletedSync(status);
}

export function isPostTapCheckpointComplete(status, startedAt) {
  if (!status || !status.connected) return false;
  if (status.dataFlowStatus?.downloading) return false;
  const lastMs = lastSyncedMs(status);
  if (!Number.isFinite(lastMs)) return false;
  return lastMs >= startedAt;
}

export function refreshOutcome(waitResult) {
  return waitResult?.complete ? 'updated' : 'noSignal';
}

export async function waitForStatusMatch(db, predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? REFRESH_TIMEOUT_MS;
  const outer = options.signal;

  if (predicate(db.currentStatus)) {
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
    await db.waitForStatus(predicate, controller.signal);
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuterAbort);
  }

  if (predicate(db.currentStatus)) {
    return { complete: true, timedOut: false };
  }
  return { complete: false, timedOut, aborted: !timedOut };
}

/**
 * Wait until the DB has applied a checkpoint at or after startedAt.
 * Used after a disconnected reconnect. connect() resolving is not enough.
 */
export async function waitForPostTapCheckpoint(db, startedAt, options = {}) {
  return waitForStatusMatch(
    db,
    (status) => isPostTapCheckpointComplete(status, startedAt),
    options
  );
}

function withTimeout(promise, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const onAbort = () => finish({ kind: 'abort' });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => promise)
      .then(() => finish({ kind: 'ok' }))
      .catch((error) => finish({ kind: 'failed', error }));
  });
}

/**
 * Connected live stream → UPDATED without reconnect.
 * Downloading live stream → wait until download settles.
 * Disconnected → connect(), whole-operation timeout, then post-tap checkpoint.
 */
export async function runManualRefresh({
  getStatus,
  connect,
  wait,
  startedAt = Date.now(),
  timeoutMs = REFRESH_TIMEOUT_MS,
  signal,
} = {}) {
  const status = typeof getStatus === 'function' ? getStatus() : null;

  if (status?.connected) {
    if (isLiveCurrent(status)) {
      return {
        startedAt,
        complete: true,
        timedOut: false,
        outcome: 'updated',
        usedConnect: false,
      };
    }
    const waitResult = await wait(startedAt, {
      timeoutMs,
      signal,
      predicate: isLiveCurrent,
    });
    return {
      startedAt,
      complete: !!waitResult.complete,
      timedOut: !!waitResult.timedOut,
      outcome: refreshOutcome(waitResult),
      usedConnect: false,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort);
  }

  try {
    const connectResult = await withTimeout(connect(), controller.signal);
    if (connectResult.kind === 'abort') {
      return {
        startedAt,
        complete: false,
        timedOut,
        outcome: 'noSignal',
        usedConnect: true,
      };
    }
    if (connectResult.kind === 'failed') {
      return {
        startedAt,
        complete: false,
        timedOut: false,
        outcome: 'noSignal',
        usedConnect: true,
      };
    }

    const remaining = Math.max(0, timeoutMs - (Date.now() - startedAt));
    if (remaining === 0 || controller.signal.aborted) {
      return {
        startedAt,
        complete: false,
        timedOut: true,
        outcome: 'noSignal',
        usedConnect: true,
      };
    }

    const waitResult = await wait(startedAt, {
      timeoutMs: remaining,
      signal: controller.signal,
      predicate: (s) => isPostTapCheckpointComplete(s, startedAt),
    });
    return {
      startedAt,
      complete: !!waitResult.complete,
      timedOut: !!(timedOut || waitResult.timedOut),
      outcome: refreshOutcome(waitResult),
      usedConnect: true,
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
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
