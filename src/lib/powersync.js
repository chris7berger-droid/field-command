/**
 * PowerSync database singleton + React provider helper
 * Uses @powersync/op-sqlite for the SQLite adapter.
 */
import { PowerSyncDatabase, createBaseLogger, LogLevel } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';
import { SupabaseConnector } from './connector';
import {
  runManualRefresh,
  waitForStatusMatch,
  isPostTapCheckpointComplete,
} from './manualRefresh';
import { createConnectCoalescer } from './powerSyncLifecycle';

// TEMPORARY Simulator diagnostic. Do not log credentials.
const _psLogger = createBaseLogger();
_psLogger.useDefaults();
_psLogger.setLevel(LogLevel.DEBUG);

function diagError(error) {
  if (!error) return null;
  return {
    name: error.name || null,
    message: error.message || String(error),
    stack: error.stack || null,
  };
}

function diagStreams(status) {
  const streams = status?.syncStreams;
  if (!Array.isArray(streams)) return streams ?? null;
  return streams.map((entry) => {
    const sub = entry?.subscription || entry;
    return {
      name: sub?.name ?? null,
      isDefault: sub?.isDefault ?? null,
      active: sub?.active ?? null,
      hasSynced: sub?.hasSynced ?? null,
      lastSyncedAt: sub?.lastSyncedAt ?? null,
    };
  });
}

function diagInternalStreams(streams) {
  if (!Array.isArray(streams)) return streams ?? null;
  return streams.map((entry) => ({
    name: entry?.name ?? null,
    active: entry?.active ?? null,
    isDefault: entry?.is_default ?? entry?.isDefault ?? null,
    hasExplicitSubscription: entry?.has_explicit_subscription ?? entry?.hasExplicitSubscription ?? null,
    hasSynced: entry?.hasSynced ?? null,
    lastSyncedAt: entry?.last_synced_at ?? entry?.lastSyncedAt ?? null,
    progress: entry?.progress
      ? { total: entry.progress.total ?? null, downloaded: entry.progress.downloaded ?? null }
      : null,
  }));
}

function diagStatus(status) {
  const flow = status?.dataFlowStatus || {};
  let message = null;
  try {
    message = typeof status?.getMessage === 'function' ? status.getMessage() : null;
  } catch (err) {
    message = `getMessage failed: ${err?.message || err}`;
  }
  return {
    ts: new Date().toISOString(),
    connected: !!status?.connected,
    connecting: !!status?.connecting,
    hasSynced: status?.hasSynced ?? null,
    lastSyncedAt: status?.lastSyncedAt ?? null,
    downloading: !!flow.downloading,
    uploading: !!flow.uploading,
    downloadError: diagError(flow.downloadError),
    uploadError: diagError(flow.uploadError),
    syncStreams: diagStreams(status),
    internalStreamSubscriptions: diagInternalStreams(flow.internalStreamSubscriptions),
    message,
  };
}

let _db = null;
let _connector = null;

const _connect = createConnectCoalescer(async () => {
  const db = getPowerSync();
  const connector = getConnector();
  const startedAt = Date.now();
  console.log('[ps-diag] db.connect start', { ts: new Date(startedAt).toISOString() });
  try {
    await db.connect(connector);
    const finishedAt = Date.now();
    console.log('[ps-diag] db.connect finish', {
      ts: new Date(finishedAt).toISOString(),
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    return db;
  } catch (error) {
    const finishedAt = Date.now();
    console.log('[ps-diag] db.connect throw', {
      ts: new Date(finishedAt).toISOString(),
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      ...diagError(error),
    });
    throw error;
  }
});

export function getPowerSync() {
  if (!_db) {
    const factory = new OPSqliteOpenFactory({
      dbFilename: 'field-command.db',
    });

    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: factory,
    });
    _db.registerListener({
      statusChanged: (status) => {
        console.log('[ps-diag] statusChanged', diagStatus(status));
      },
      statusUpdated: (update) => {
        const flow = update?.dataFlow || {};
        console.log('[ps-diag] statusUpdated', {
          ts: new Date().toISOString(),
          connected: update?.connected ?? null,
          connecting: update?.connecting ?? null,
          hasSynced: update?.hasSynced ?? null,
          lastSyncedAt: update?.lastSyncedAt ?? null,
          downloading: flow.downloading ?? null,
          uploading: flow.uploading ?? null,
          downloadError: diagError(flow.downloadError),
          uploadError: diagError(flow.uploadError),
          internalStreamSubscriptions: diagInternalStreams(flow.internalStreamSubscriptions),
        });
      },
    });
  }
  return _db;
}

export function getConnector() {
  if (!_connector) {
    _connector = new SupabaseConnector();
  }
  return _connector;
}

/**
 * Call after successful auth to start syncing.
 * Concurrent callers share one in-flight db.connect() — the SDK tears down
 * the stream on every connect(), so App.js and Refresh must not overlap those calls.
 */
export async function connectPowerSync() {
  const startedAt = Date.now();
  console.log('[ps-diag] connectPowerSync start', { ts: new Date(startedAt).toISOString() });
  try {
    const result = await _connect.connect();
    const finishedAt = Date.now();
    console.log('[ps-diag] connectPowerSync finish', {
      ts: new Date(finishedAt).toISOString(),
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    return result;
  } catch (error) {
    const finishedAt = Date.now();
    console.log('[ps-diag] connectPowerSync throw', {
      ts: new Date(finishedAt).toISOString(),
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      ...diagError(error),
    });
    throw error;
  }
}

export function isPowerSyncConnectInFlight() {
  return _connect.isInFlight();
}

/**
 * Crew-triggered check-now. A healthy live stream is not torn down.
 * Reconnect only when disconnected, and only through connectPowerSync().
 * connect() resolving is not UPDATED.
 */
export async function refreshPowerSync(options = {}) {
  const db = getPowerSync();
  return runManualRefresh({
    getStatus: () => db.currentStatus,
    connect: connectPowerSync,
    isConnectInFlight: isPowerSyncConnectInFlight,
    wait: (startedAt, waitOptions) => waitForStatusMatch(
      db,
      waitOptions.predicate || ((s) => isPostTapCheckpointComplete(s, startedAt)),
      waitOptions
    ),
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
}

/**
 * Disconnect and reset (e.g. on sign out)
 */
export async function disconnectPowerSync() {
  const db = getPowerSync();
  await db.disconnectAndClear();
}
