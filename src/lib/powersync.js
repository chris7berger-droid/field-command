/**
 * PowerSync database singleton + React provider helper
 * Uses @powersync/op-sqlite for the SQLite adapter.
 */
import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';
import { SupabaseConnector } from './connector';
import {
  runManualRefresh,
  waitForStatusMatch,
  isPostTapCheckpointComplete,
} from './manualRefresh';
import { createConnectCoalescer } from './powerSyncLifecycle';

let _db = null;
let _connector = null;

const _connect = createConnectCoalescer(async () => {
  const db = getPowerSync();
  const connector = getConnector();
  await db.connect(connector);
  return db;
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
  return _connect.connect();
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
