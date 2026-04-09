/**
 * PowerSync ↔ Supabase Connector
 *
 * - fetchCredentials: provides PowerSync with the Supabase JWT
 * - uploadData: pushes local writes (time_punches, daily_production_reports) to Supabase
 */
import { UpdateType } from '@powersync/react-native';
import { supabase } from './supabase';

const POWERSYNC_URL =
  process.env.EXPO_PUBLIC_POWERSYNC_URL || '';

// Fatal Supabase errors that should not be retried (discard the transaction)
const FATAL_CODES = [
  /^22...$/, // Data Exception
  /^23...$/, // Integrity Constraint Violation
  /^42501$/, // Insufficient Privilege (RLS)
];

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
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq('id', op.id);
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
