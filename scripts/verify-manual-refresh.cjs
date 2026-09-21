#!/usr/bin/env node
/**
 * Manual Refresh — reconnect/checkpoint completion, no disconnectAndClear,
 * UPDATED is not connect() returning, timeout/offline, in-flight guard.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const libPath = path.join(__dirname, '../src/lib/manualRefresh.js');
const src = fs.readFileSync(libPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(
  `${src}\nmodule.exports = {
    isPostTapCheckpointComplete,
    refreshOutcome,
    waitForPostTapCheckpoint,
    runManualRefresh,
    createRefreshInFlightGuard,
    REFRESH_LABEL,
    refreshLabel,
  };`,
  sandbox
);
const {
  isPostTapCheckpointComplete,
  refreshOutcome,
  waitForPostTapCheckpoint,
  runManualRefresh,
  createRefreshInFlightGuard,
  REFRESH_LABEL,
  refreshLabel,
} = sandbox.module.exports;

const powersyncSrc = fs.readFileSync(path.join(__dirname, '../src/lib/powersync.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
const controlSrc = fs.readFileSync(path.join(__dirname, '../src/components/RefreshControl.js'), 'utf8');
const punchSrc = fs.readFileSync(path.join(__dirname, '../src/components/PunchStatusBar.js'), 'utf8');

let failed = 0;
function check(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.then(() => console.log(`ok  ${name}`)).catch((err) => {
        failed += 1;
        console.error(`not ok  ${name}`);
        console.error(`  ${err.message}`);
      });
    }
    console.log(`ok  ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(`  ${err.message}`);
    return Promise.resolve();
  }
}

function makeStatus(overrides = {}) {
  return {
    connected: false,
    dataFlowStatus: { downloading: false },
    lastSyncedAt: undefined,
    ...overrides,
  };
}

function makeFakeDb(initial) {
  let status = initial;
  const listeners = [];
  return {
    get currentStatus() {
      return status;
    },
    setStatus(next) {
      status = next;
      listeners.slice().forEach((fn) => fn(status));
    },
    waitForStatus(predicate, signal) {
      if (predicate(status)) return Promise.resolve();
      return new Promise((resolve) => {
        const dispose = () => {
          const i = listeners.indexOf(onStatus);
          if (i >= 0) listeners.splice(i, 1);
        };
        function abort() {
          dispose();
          signal?.removeEventListener?.('abort', abort);
          resolve();
        }
        function onStatus(next) {
          if (predicate(next)) abort();
        }
        listeners.push(onStatus);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort);
      });
    },
  };
}

async function run() {
  await check('connected + not downloading + lastSyncedAt >= start is complete', () => {
    const startedAt = 1_000;
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: true, lastSyncedAt: new Date(1_000) }),
        startedAt
      ),
      true
    );
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: true, lastSyncedAt: new Date(1_500) }),
        startedAt
      ),
      true
    );
  });

  await check('not connected is incomplete even with a fresh lastSyncedAt', () => {
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: false, lastSyncedAt: new Date(2_000) }),
        1_000
      ),
      false
    );
  });

  await check('downloading is incomplete', () => {
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({
          connected: true,
          lastSyncedAt: new Date(2_000),
          dataFlowStatus: { downloading: true },
        }),
        1_000
      ),
      false
    );
  });

  await check('stale lastSyncedAt after tap is incomplete', () => {
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: true, lastSyncedAt: new Date(500) }),
        1_000
      ),
      false
    );
  });

  await check('missing lastSyncedAt is incomplete', () => {
    assert.strictEqual(
      isPostTapCheckpointComplete(makeStatus({ connected: true }), 1_000),
      false
    );
  });

  await check('refreshOutcome is updated only when wait complete', () => {
    assert.strictEqual(refreshOutcome({ complete: true }), 'updated');
    assert.strictEqual(refreshOutcome({ complete: false, timedOut: true }), 'noSignal');
    assert.strictEqual(refreshOutcome({ complete: false }), 'noSignal');
    assert.strictEqual(refreshOutcome(null), 'noSignal');
  });

  await check('labels match crew copy', () => {
    assert.strictEqual(REFRESH_LABEL.idle, 'REFRESH');
    assert.strictEqual(REFRESH_LABEL.refreshing, 'REFRESHING…');
    assert.strictEqual(REFRESH_LABEL.updated, 'UPDATED');
    assert.strictEqual(REFRESH_LABEL.noSignal, 'NO SIGNAL');
    assert.strictEqual(refreshLabel('updated'), 'UPDATED');
  });

  await check('wait completes when lastSyncedAt advances after tap', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({
      connected: true,
      lastSyncedAt: new Date(startedAt - 5_000),
    }));
    const pending = waitForPostTapCheckpoint(db, startedAt, { timeoutMs: 500 });
    setTimeout(() => {
      db.setStatus(makeStatus({
        connected: true,
        lastSyncedAt: new Date(startedAt + 10),
      }));
    }, 20);
    const result = await pending;
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.timedOut, false);
  });

  await check('timeout without a post-tap checkpoint is not complete', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({
      connected: true,
      lastSyncedAt: new Date(startedAt - 5_000),
    }));
    const result = await waitForPostTapCheckpoint(db, startedAt, { timeoutMs: 40 });
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.timedOut, true);
  });

  await check('connect() returning is not UPDATED', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({
      connected: true,
      lastSyncedAt: new Date(startedAt - 5_000),
    }));
    const result = await runManualRefresh({
      startedAt,
      connect: async () => {
        // Stream reports connected, but the post-tap checkpoint has not applied.
        db.setStatus(makeStatus({
          connected: true,
          lastSyncedAt: new Date(startedAt - 5_000),
        }));
      },
      wait: (at, opts) => waitForPostTapCheckpoint(db, at, { ...opts, timeoutMs: 40 }),
      timeoutMs: 40,
    });
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.outcome, 'noSignal');
  });

  await check('UPDATED only after post-tap checkpoint, not because connect resolved', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({
      connected: false,
      lastSyncedAt: new Date(startedAt - 5_000),
    }));
    const order = [];
    const result = await runManualRefresh({
      startedAt,
      connect: async () => {
        order.push('connect');
        db.setStatus(makeStatus({
          connected: true,
          lastSyncedAt: new Date(startedAt - 5_000),
          dataFlowStatus: { downloading: true },
        }));
      },
      wait: async (at, opts) => {
        order.push('wait');
        setTimeout(() => {
          db.setStatus(makeStatus({
            connected: true,
            lastSyncedAt: new Date(at + 5),
            dataFlowStatus: { downloading: false },
          }));
        }, 15);
        return waitForPostTapCheckpoint(db, at, { ...opts, timeoutMs: 400 });
      },
      timeoutMs: 400,
    });
    assert.deepStrictEqual(order, ['connect', 'wait']);
    assert.strictEqual(result.outcome, 'updated');
    assert.strictEqual(result.complete, true);
  });

  await check('connect throw / offline is NO SIGNAL, never UPDATED', async () => {
    const result = await runManualRefresh({
      connect: async () => {
        throw new Error('network down');
      },
      wait: async () => {
        throw new Error('wait must not run after connect failure');
      },
    });
    assert.strictEqual(result.outcome, 'noSignal');
    assert.strictEqual(result.complete, false);
  });

  await check('in-flight guard ignores a second tap', () => {
    const g = createRefreshInFlightGuard();
    assert.strictEqual(g.tryBegin(), true);
    assert.strictEqual(g.tryBegin(), false);
    assert.strictEqual(g.tryBegin(), false);
    assert.strictEqual(g.isInFlight(), true);
    g.end();
    assert.strictEqual(g.tryBegin(), true);
  });

  await check('refreshPowerSync never calls disconnectAndClear', () => {
    const refreshFn = powersyncSrc.slice(
      powersyncSrc.indexOf('export async function refreshPowerSync'),
      powersyncSrc.indexOf('export async function disconnectPowerSync')
    );
    assert.ok(refreshFn.includes('db.connect(connector)'));
    assert.ok(!refreshFn.includes('disconnectAndClear'));
    assert.ok(!refreshFn.includes('disconnectPowerSync'));
    const onlyClear = powersyncSrc.match(/disconnectAndClear/g) || [];
    assert.strictEqual(onlyClear.length, 1);
    assert.ok(powersyncSrc.includes('await db.disconnectAndClear()'));
    const clearAt = powersyncSrc.indexOf('disconnectAndClear');
    const disconnectFnAt = powersyncSrc.indexOf('export async function disconnectPowerSync');
    assert.ok(clearAt > disconnectFnAt, 'disconnectAndClear stays only on sign-out helper');
  });

  await check('UI does not use useQuery().refresh as the sync mechanism', () => {
    assert.ok(!controlSrc.includes('useQuery'));
    assert.ok(controlSrc.includes('refreshPowerSync'));
    assert.ok(controlSrc.includes("result.outcome === 'updated'"));
    assert.ok(controlSrc.includes('tryBegin()'));
    assert.ok(controlSrc.includes('disabled={busy}'));
  });

  await check('Refresh is a shell sibling, PunchStatusBar punch logic untouched', () => {
    assert.ok(appSrc.includes("import RefreshControl from './src/components/RefreshControl'"));
    assert.ok(appSrc.includes('<RefreshControl />'));
    assert.ok(appSrc.includes('<PunchStatusBar />'));
    assert.ok(!punchSrc.includes('refreshPowerSync'));
    assert.ok(!punchSrc.includes('REFRESH'));
    assert.ok(punchSrc.includes('PUNCH OUT NOW AND NOTIFY OFFICE'));
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nall ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
