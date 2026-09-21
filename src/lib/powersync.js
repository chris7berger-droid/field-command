/**
 * PowerSync database singleton + React provider helper
 * Uses @powersync/op-sqlite for the SQLite adapter.
 */
import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';
import { SupabaseConnector } from './connector';
import { runManualRefresh, waitForPostTapCheckpoint } from './manualRefresh';

let _db = null;
let _connector = null;

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
 */
export async function connectPowerSync() {
  const db = getPowerSync();
  const connector = getConnector();
  await db.connect(connector);
  return db;
}

/**
 * Crew-triggered check-now. Reuses connect() so the SDK starts a new
 * streaming session and checkpoint comparison. Does not clear local data.
 * connect() resolving is not success — wait for a post-tap checkpoint.
 */
export async function refreshPowerSync(options = {}) {
  const db = getPowerSync();
  const connector = getConnector();
  return runManualRefresh({
    connect: () => db.connect(connector),
    wait: (startedAt, waitOptions) => waitForPostTapCheckpoint(db, startedAt, waitOptions),
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
