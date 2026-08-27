/**
 * PowerSync ↔ Supabase Connector
 *
 * - fetchCredentials: provides PowerSync with the Supabase JWT
 * - uploadData: pushes local writes (time_punches, daily_production_reports,
 *   daily_log_entries, job_material_checks) to Supabase. Table-generic: any
 *   writable table in the PowerSync schema syncs up here automatically.
 */
import { UpdateType } from '@powersync/react-native';
import { supabase } from './supabase';

const POWERSYNC_URL =
  process.env.EXPO_PUBLIC_POWERSYNC_URL || 'https://69d81f100e377e689729db98.powersync.journeyapps.com';

// Fatal Supabase errors that should not be retried (discard the transaction)
const FATAL_CODES = [
  /^22...$/, // Data Exception
  /^23...$/, // Integrity Constraint Violation
  /^42501$/, // Insufficient Privilege (RLS)
];

// JSONB columns whose values the app stores as JSON *strings* in local SQLite.
// They must be sent to PostgREST as parsed JSON, or a JSONB column stores the
// string itself (jsonb_typeof = 'string') and reads come back double-encoded.
const JSON_COLUMNS = {
  daily_production_reports: ['tasks', 'materials_used', 'photos'],
  daily_log_entries: ['photos'],
};

function coerceJsonColumns(tableName, data) {
  const cols = JSON_COLUMNS[tableName];
  if (!cols || !data) return data;
  const out = { ...data };
  for (const c of cols) {
    if (typeof out[c] === 'string') {
      try { out[c] = JSON.parse(out[c]); } catch { /* leave as-is if not JSON */ }
    }
  }
  return out;
}

export class SupabaseConnector {
  constructor() {
    this.client = supabase;
  }

  async fetchCredentials() {
    const {
      data: { session },
      error,
    } = await this.client.auth.getSession();

    if (!session || error) {
      throw new Error(
        `Could not fetch Supabase credentials: ${error?.message || 'no session'}`
      );
    }

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token ?? '',
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }

  async uploadData(database) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result;

        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...coerceJsonColumns(op.table, op.opData), id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(coerceJsonColumns(op.table, op.opData)).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }

        if (result?.error) {
          throw result.error;
        }
      }
      await transaction.complete();
    } catch (ex) {
      if (
        typeof ex.code === 'string' &&
        FATAL_CODES.some((r) => r.test(ex.code))
      ) {
        // Unrecoverable — discard so we don't retry forever
        console.error('PowerSync upload fatal error — discarding:', lastOp, ex);
        await transaction.complete();
      } else {
        // Retryable — PowerSync will retry after backoff
        throw ex;
      }
    }
  }
}
