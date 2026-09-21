#!/usr/bin/env node
/**
 * Manual Refresh — live connected path, download wait, disconnected reconnect,
 * connecting wait (no competing connect), abort, shared coalescer, no disconnectAndClear.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadModule(relPath, exportNames) {
  const src = fs.readFileSync(path.join(__dirname, relPath), 'utf8').replace(/^export /gm, '');
  const sandbox = { module: { exports: {} }, exports: {}, console, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(`${src}\nmodule.exports = { ${exportNames.join(', ')} };`, sandbox);
  return sandbox.module.exports;
}

const {
  isLiveCurrent,
  isPostTapCheckpointComplete,
  refreshOutcome,
  phaseAfterRefreshResult,
  waitForStatusMatch,
  waitForPostTapCheckpoint,
  runManualRefresh,
  createRefreshInFlightGuard,
  REFRESH_LABEL,
  REFRESH_PHASE,
  refreshLabel,
} = loadModule('../src/lib/manualRefresh.js', [
  'isLiveCurrent',
  'isPostTapCheckpointComplete',
  'refreshOutcome',
  'phaseAfterRefreshResult',
  'waitForStatusMatch',
  'waitForPostTapCheckpoint',
  'runManualRefresh',
  'createRefreshInFlightGuard',
  'REFRESH_LABEL',
  'REFRESH_PHASE',
  'refreshLabel',
]);

const { createConnectCoalescer } = loadModule('../src/lib/powerSyncLifecycle.js', [
  'createConnectCoalescer',
]);

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
    connecting: false,
    hasSynced: false,
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

function neverConnect() {
  throw new Error('must not start another connect()');
}

async function run() {
  await check('live connected + hasSynced + not downloading is current', () => {
    assert.strictEqual(
      isLiveCurrent(makeStatus({ connected: true, hasSynced: true })),
      true
    );
  });

  await check('connected but downloading is not current', () => {
    assert.strictEqual(
      isLiveCurrent(makeStatus({
        connected: true,
        hasSynced: true,
        dataFlowStatus: { downloading: true },
      })),
      false
    );
  });

  await check('disconnected is not live-current even with hasSynced', () => {
    assert.strictEqual(
      isLiveCurrent(makeStatus({ connected: false, hasSynced: true })),
      false
    );
  });

  await check('connected + not downloading + lastSyncedAt >= start is complete', () => {
    const startedAt = 1_000;
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: true, lastSyncedAt: new Date(1_000) }),
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

  await check('stale lastSyncedAt after tap is incomplete for reconnect wait', () => {
    assert.strictEqual(
      isPostTapCheckpointComplete(
        makeStatus({ connected: true, lastSyncedAt: new Date(500) }),
        1_000
      ),
      false
    );
  });

  await check('refreshOutcome is updated only when wait complete', () => {
    assert.strictEqual(refreshOutcome({ complete: true }), 'updated');
    assert.strictEqual(refreshOutcome({ complete: false, timedOut: true }), 'noSignal');
    assert.strictEqual(refreshOutcome(null), 'noSignal');
  });

  await check('labels match crew copy', () => {
    assert.strictEqual(REFRESH_LABEL.idle, 'REFRESH');
    assert.strictEqual(REFRESH_LABEL.refreshing, 'REFRESHING…');
    assert.strictEqual(REFRESH_LABEL.updated, 'UPDATED');
    assert.strictEqual(REFRESH_LABEL.noSignal, 'NO SIGNAL');
    assert.strictEqual(refreshLabel('updated'), 'UPDATED');
  });

  await check('healthy connected refresh is UPDATED without connect()', async () => {
    let connectedCalls = 0;
    const result = await runManualRefresh({
      getStatus: () => makeStatus({ connected: true, hasSynced: true }),
      connect: async () => {
        connectedCalls += 1;
        neverConnect();
      },
      wait: async () => {
        throw new Error('wait must not run when already current');
      },
    });
    assert.strictEqual(connectedCalls, 0);
    assert.strictEqual(result.usedConnect, false);
    assert.strictEqual(result.outcome, 'updated');
    assert.strictEqual(result.complete, true);
  });

  await check('connected + downloading waits then UPDATED without reconnect', async () => {
    const db = makeFakeDb(makeStatus({
      connected: true,
      hasSynced: true,
      dataFlowStatus: { downloading: true },
    }));
    let connectedCalls = 0;
    const pending = runManualRefresh({
      getStatus: () => db.currentStatus,
      connect: async () => {
        connectedCalls += 1;
        neverConnect();
      },
      wait: (startedAt, opts) => waitForStatusMatch(db, opts.predicate, opts),
      timeoutMs: 400,
    });
    setTimeout(() => {
      db.setStatus(makeStatus({ connected: true, hasSynced: true }));
    }, 20);
    const result = await pending;
    assert.strictEqual(connectedCalls, 0);
    assert.strictEqual(result.usedConnect, false);
    assert.strictEqual(result.outcome, 'updated');
    assert.strictEqual(result.complete, true);
  });

  await check('disconnected refresh calls connect then waits for checkpoint', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({ connected: false }));
    const order = [];
    const result = await runManualRefresh({
      startedAt,
      getStatus: () => db.currentStatus,
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
            hasSynced: true,
            lastSyncedAt: new Date(at + 5),
          }));
        }, 15);
        return waitForPostTapCheckpoint(db, at, opts);
      },
      timeoutMs: 400,
    });
    assert.deepStrictEqual(order, ['connect', 'wait']);
    assert.strictEqual(result.usedConnect, true);
    assert.strictEqual(result.outcome, 'updated');
  });

  await check('connect() returning is not UPDATED', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({ connected: false }));
    const result = await runManualRefresh({
      startedAt,
      getStatus: () => db.currentStatus,
      connect: async () => {
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
    assert.strictEqual(result.usedConnect, true);
  });

  await check('whole-operation timeout includes a hung connect()', async () => {
    const t0 = Date.now();
    const result = await runManualRefresh({
      getStatus: () => makeStatus({ connected: false }),
      connect: () => new Promise(() => {}),
      wait: async () => {
        throw new Error('wait must not run after connect timeout');
      },
      timeoutMs: 50,
    });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 400, `timeout should not hang connect(); elapsed ${elapsed}ms`);
    assert.strictEqual(result.outcome, 'noSignal');
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.usedConnect, true);
  });

  await check('connect throw / offline is NO SIGNAL, never UPDATED', async () => {
    const result = await runManualRefresh({
      getStatus: () => makeStatus({ connected: false }),
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

  await check('connecting=true does not call another connect', async () => {
    const startedAt = Date.now();
    const db = makeFakeDb(makeStatus({ connecting: true }));
    let connectedCalls = 0;
    const pending = runManualRefresh({
      startedAt,
      getStatus: () => db.currentStatus,
      isConnectInFlight: () => false,
      connect: async () => {
        connectedCalls += 1;
        neverConnect();
      },
      wait: (at, opts) => waitForPostTapCheckpoint(db, at, opts),
      timeoutMs: 400,
    });
    setTimeout(() => {
      db.setStatus(makeStatus({
        connected: true,
        lastSyncedAt: new Date(startedAt + 5),
      }));
    }, 15);
    const result = await pending;
    assert.strictEqual(connectedCalls, 0);
    assert.strictEqual(result.usedConnect, false);
    assert.strictEqual(result.outcome, 'updated');
  });

  await check('timeout while connecting is NO SIGNAL without a competing connect', async () => {
    const db = makeFakeDb(makeStatus({ connecting: true }));
    let connectedCalls = 0;
    const result = await runManualRefresh({
      getStatus: () => db.currentStatus,
      isConnectInFlight: () => false,
      connect: async () => {
        connectedCalls += 1;
        neverConnect();
      },
      wait: (at, opts) => waitForPostTapCheckpoint(db, at, opts),
      timeoutMs: 40,
    });
    assert.strictEqual(connectedCalls, 0);
    assert.strictEqual(result.usedConnect, false);
    assert.strictEqual(result.outcome, 'noSignal');
    assert.strictEqual(result.timedOut, true);
  });

  await check('lifecycle owner + Refresh share one coalesced connect', async () => {
    let starts = 0;
    const coalescer = createConnectCoalescer(() => {
      starts += 1;
      return new Promise(() => {});
    });
    coalescer.connect();
    const result = await runManualRefresh({
      getStatus: () => makeStatus({ connected: false }),
      connect: () => coalescer.connect(),
      isConnectInFlight: () => coalescer.isInFlight(),
      wait: async () => {
        throw new Error('wait must not run after connect timeout');
      },
      timeoutMs: 40,
    });
    assert.strictEqual(starts, 1);
    assert.strictEqual(coalescer.isInFlight(), true);
    assert.strictEqual(result.outcome, 'noSignal');
    assert.strictEqual(result.timedOut, true);
    assert.strictEqual(result.usedConnect, true);
  });

  await check('aborted Refresh does not start connect', async () => {
    const controller = new AbortController();
    controller.abort();
    let connectedCalls = 0;
    const result = await runManualRefresh({
      getStatus: () => makeStatus({ connected: false }),
      connect: async () => {
        connectedCalls += 1;
        neverConnect();
      },
      wait: async () => {
        throw new Error('wait must not run after abort');
      },
      signal: controller.signal,
    });
    assert.strictEqual(connectedCalls, 0);
    assert.strictEqual(result.usedConnect, false);
    assert.strictEqual(result.outcome, 'noSignal');
    assert.strictEqual(result.aborted, true);
  });

  await check('late UPDATED after abort does not apply to Refresh UI', () => {
    const controller = new AbortController();
    controller.abort();
    assert.strictEqual(
      phaseAfterRefreshResult({ outcome: 'updated' }, controller.signal),
      null
    );
    assert.strictEqual(
      phaseAfterRefreshResult({ outcome: 'updated' }, { aborted: false }),
      REFRESH_PHASE.updated
    );
    assert.strictEqual(
      phaseAfterRefreshResult({ outcome: 'noSignal' }, { aborted: false }),
      REFRESH_PHASE.noSignal
    );
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

  await check('refreshPowerSync uses connectPowerSync, never raw db.connect or disconnectAndClear', () => {
    const refreshFn = powersyncSrc.slice(
      powersyncSrc.indexOf('export async function refreshPowerSync'),
      powersyncSrc.indexOf('export async function disconnectPowerSync')
    );
    assert.ok(refreshFn.includes('getStatus: () => db.currentStatus'));
    assert.ok(refreshFn.includes('connect: connectPowerSync'));
    assert.ok(refreshFn.includes('isConnectInFlight: isPowerSyncConnectInFlight'));
    assert.ok(!refreshFn.includes('db.connect'));
    assert.ok(!refreshFn.includes('disconnectAndClear'));
    assert.ok(powersyncSrc.includes('createConnectCoalescer'));
    const onlyClear = powersyncSrc.match(/disconnectAndClear/g) || [];
    assert.strictEqual(onlyClear.length, 1);
    const clearAt = powersyncSrc.indexOf('disconnectAndClear');
    const disconnectFnAt = powersyncSrc.indexOf('export async function disconnectPowerSync');
    assert.ok(clearAt > disconnectFnAt, 'disconnectAndClear stays only on sign-out helper');
  });

  await check('UI aborts on unmount/session loss and ignores late results', () => {
    assert.ok(!controlSrc.includes('useQuery'));
    assert.ok(controlSrc.includes('refreshPowerSync({ signal })'));
    assert.ok(controlSrc.includes('AbortController'));
    assert.ok(controlSrc.includes('controller.abort()') || controlSrc.includes('.abort()'));
    assert.ok(controlSrc.includes('active'));
    assert.ok(controlSrc.includes('phaseAfterRefreshResult'));
    assert.ok(controlSrc.includes('if (!next) return'));
    assert.ok(controlSrc.includes('if (signal.aborted) return'));
    assert.ok(controlSrc.includes('styles.pill'));
    assert.ok(controlSrc.includes('tryBegin()'));
    assert.ok(controlSrc.includes('disabled={busy}'));
  });

  await check('Refresh is a shell sibling, PunchStatusBar punch logic untouched', () => {
    assert.ok(appSrc.includes("import RefreshControl from './src/components/RefreshControl'"));
    assert.ok(appSrc.includes('<RefreshControl active={canConnect} />'));
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
