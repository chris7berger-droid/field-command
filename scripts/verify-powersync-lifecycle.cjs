#!/usr/bin/env node
/**
 * PowerSync connection owner: coalesced connect(), when to ensure, wakeup that
 * cannot silently drop while the stream is truly dead.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/powerSyncLifecycle.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, Promise };
vm.runInNewContext(
  `${src}\nmodule.exports = {
    shouldEnsurePowerSyncConnect,
    nextEnsureAction,
    afterConnectAttempt,
    createConnectCoalescer,
    isStreamDead,
    POWERSYNC_ENSURE_COOLDOWN_MS,
  };`,
  sandbox
);
const {
  shouldEnsurePowerSyncConnect,
  nextEnsureAction,
  afterConnectAttempt,
  createConnectCoalescer,
  isStreamDead,
  POWERSYNC_ENSURE_COOLDOWN_MS,
} = sandbox.module.exports;

const appSrc = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
const powersyncSrc = fs.readFileSync(path.join(__dirname, '../src/lib/powersync.js'), 'utf8');
const refreshSrc = fs.readFileSync(path.join(__dirname, '../src/lib/manualRefresh.js'), 'utf8');
const refreshCtl = fs.readFileSync(path.join(__dirname, '../src/components/RefreshControl.js'), 'utf8');

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

const dead = { connected: false, connecting: false };
const live = { connected: true, connecting: false };
const connecting = { connected: false, connecting: true };

async function run() {
  await check('dead stream should ensure connect', () => {
    assert.strictEqual(isStreamDead(dead), true);
    assert.strictEqual(shouldEnsurePowerSyncConnect(dead), true);
    assert.strictEqual(shouldEnsurePowerSyncConnect(undefined), true);
    assert.strictEqual(nextEnsureAction(dead).type, 'connect');
  });

  await check('live or connecting must not ensure connect', () => {
    assert.strictEqual(shouldEnsurePowerSyncConnect(live), false);
    assert.strictEqual(shouldEnsurePowerSyncConnect(connecting), false);
    assert.strictEqual(nextEnsureAction(live).type, 'none');
    assert.strictEqual(nextEnsureAction(connecting).type, 'none');
  });

  await check('in-flight connect must not duplicate', () => {
    assert.strictEqual(shouldEnsurePowerSyncConnect(dead, { inFlight: true }), false);
    assert.strictEqual(nextEnsureAction(dead, { inFlight: true }).type, 'none');
  });

  await check('cooldown while truly dead schedules remaining wakeup, does not drop', () => {
    const now = 1_000_000;
    const cooldownUntil = now + POWERSYNC_ENSURE_COOLDOWN_MS;
    const during = nextEnsureAction(dead, { cooldownUntil, now });
    assert.strictEqual(during.type, 'wakeup');
    assert.strictEqual(during.delayMs, POWERSYNC_ENSURE_COOLDOWN_MS);
    const earlyFire = nextEnsureAction(dead, { cooldownUntil, now: cooldownUntil - 1 });
    assert.strictEqual(earlyFire.type, 'wakeup');
    assert.strictEqual(earlyFire.delayMs, 1);
    const expired = nextEnsureAction(dead, { cooldownUntil, now: cooldownUntil });
    assert.strictEqual(expired.type, 'connect');
  });

  await check('connecting during cooldown does not start a competing timer', () => {
    const now = 1_000_000;
    const action = nextEnsureAction(connecting, {
      cooldownUntil: now + POWERSYNC_ENSURE_COOLDOWN_MS,
      now,
    });
    assert.strictEqual(action.type, 'none');
  });

  await check('after a failed attempt, only a truly dead stream gets a wakeup', () => {
    const now = 5_000;
    const deadAfter = afterConnectAttempt(dead, { now, cooldownMs: 15_000 });
    assert.strictEqual(deadAfter.cooldownUntil, now + 15_000);
    assert.strictEqual(deadAfter.wakeupDelayMs, 15_000);
    const connectingAfter = afterConnectAttempt(connecting, { now });
    assert.strictEqual(connectingAfter.wakeupDelayMs, null);
    assert.strictEqual(connectingAfter.cooldownUntil, 0);
    const liveAfter = afterConnectAttempt(live, { now });
    assert.strictEqual(liveAfter.wakeupDelayMs, null);
  });

  await check('simultaneous connect callers coalesce to one attempt', async () => {
    let starts = 0;
    let resolveConnect;
    const coalescer = createConnectCoalescer(() => {
      starts += 1;
      return new Promise((resolve) => {
        resolveConnect = resolve;
      });
    });
    const first = coalescer.connect();
    const second = coalescer.connect();
    assert.strictEqual(first, second);
    assert.strictEqual(starts, 1);
    assert.strictEqual(coalescer.isInFlight(), true);
    resolveConnect();
    await first;
    assert.strictEqual(starts, 1);
    assert.strictEqual(coalescer.isInFlight(), false);
    coalescer.connect();
    assert.strictEqual(starts, 2);
  });

  await check('App.js owns ensure-connect with wakeup that cannot silently drop', () => {
    assert.ok(appSrc.includes('nextEnsureAction'));
    assert.ok(appSrc.includes('afterConnectAttempt'));
    assert.ok(appSrc.includes("action.type === 'wakeup'"));
    assert.ok(appSrc.includes('scheduleWakeup(action.delayMs)'));
    assert.ok(appSrc.includes('scheduleWakeup(after.wakeupDelayMs)'));
    assert.ok(appSrc.includes('const canConnect = Boolean(dbReady && session && user)'));
    assert.ok(appSrc.includes('AppState.addEventListener'));
    assert.ok(appSrc.includes('registerListener'));
    assert.ok(!appSrc.includes('connectedRef'));
    assert.ok(appSrc.includes('<RefreshControl active={canConnect} />'));
  });

  await check('Refresh and lifecycle share connectPowerSync, not raw db.connect', () => {
    assert.ok(powersyncSrc.includes('createConnectCoalescer'));
    assert.ok(powersyncSrc.includes('export async function connectPowerSync()'));
    assert.ok(powersyncSrc.includes('isPowerSyncConnectInFlight'));
    const refreshFn = powersyncSrc.slice(
      powersyncSrc.indexOf('export async function refreshPowerSync'),
      powersyncSrc.indexOf('export async function disconnectPowerSync')
    );
    assert.ok(refreshFn.includes('connect: connectPowerSync'));
    assert.ok(!refreshFn.includes('db.connect('));
    assert.ok(!refreshFn.includes('db.connect(connector)'));
    assert.ok(refreshSrc.includes('status?.connecting && !sharedInFlight'));
    assert.ok(refreshCtl.includes('refreshPowerSync({ signal })'));
    assert.ok(refreshCtl.includes('phaseAfterRefreshResult'));
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
