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

let _db = null;
let _connector = null;
let _connectInFlight = null;

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
 * the stream on every connect(), so App.js must not overlap those calls.
 */
export async function connectPowerSync() {
  if (_connectInFlight) return _connectInFlight;
  const db = getPowerSync();
  const connector = getConnector();
  _connectInFlight = db.connect(connector)
    .then(() => db)
    .finally(() => {
      _connectInFlight = null;
    });
  return _connectInFlight;
}

/**
 * Crew-triggered check-now. A healthy live stream is not torn down.
 * Reconnect only when disconnected. connect() resolving is not UPDATED.
 */
export async function refreshPowerSync(options = {}) {
  const db = getPowerSync();
  const connector = getConnector();
  return runManualRefresh({
    getStatus: () => db.currentStatus,
    connect: () => db.connect(connector),
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
