#!/usr/bin/env node
/**
 * PowerSync App.js connection owner: when to call connect() after a dead stream.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/powerSyncLifecycle.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${src}\nmodule.exports = { shouldEnsurePowerSyncConnect, POWERSYNC_ENSURE_COOLDOWN_MS };`,
  sandbox
);
const { shouldEnsurePowerSyncConnect, POWERSYNC_ENSURE_COOLDOWN_MS } = sandbox.module.exports;

const appSrc = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
const powersyncSrc = fs.readFileSync(path.join(__dirname, '../src/lib/powersync.js'), 'utf8');
const refreshSrc = fs.readFileSync(path.join(__dirname, '../src/lib/manualRefresh.js'), 'utf8');
const refreshCtl = fs.readFileSync(path.join(__dirname, '../src/components/RefreshControl.js'), 'utf8');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(`  ${err.message}`);
  }
}

const dead = { connected: false, connecting: false };
const live = { connected: true, connecting: false };
const connecting = { connected: false, connecting: true };

check('dead stream should ensure connect', () => {
  assert.strictEqual(shouldEnsurePowerSyncConnect(dead), true);
  assert.strictEqual(shouldEnsurePowerSyncConnect(undefined), true);
});

check('live or connecting must not ensure connect', () => {
  assert.strictEqual(shouldEnsurePowerSyncConnect(live), false);
  assert.strictEqual(shouldEnsurePowerSyncConnect(connecting), false);
});

check('in-flight connect must not duplicate', () => {
  assert.strictEqual(shouldEnsurePowerSyncConnect(dead, { inFlight: true }), false);
});

check('cooldown blocks another connect after a failed attempt', () => {
  const now = 1_000_000;
  assert.strictEqual(
    shouldEnsurePowerSyncConnect(dead, {
      cooldownUntil: now + POWERSYNC_ENSURE_COOLDOWN_MS,
      now,
    }),
    false
  );
  assert.strictEqual(
    shouldEnsurePowerSyncConnect(dead, {
      cooldownUntil: now + POWERSYNC_ENSURE_COOLDOWN_MS,
      now: now + POWERSYNC_ENSURE_COOLDOWN_MS,
    }),
    true
  );
});

check('App.js owns ensure-connect; Refresh algorithm is unchanged', () => {
  assert.ok(appSrc.includes('shouldEnsurePowerSyncConnect'));
  assert.ok(appSrc.includes('const canConnect = Boolean(dbReady && session && user)'));
  assert.ok(appSrc.includes('AppState.addEventListener'));
  assert.ok(appSrc.includes('registerListener'));
  assert.ok(!appSrc.includes('connectedRef'));
  assert.ok(powersyncSrc.includes('_connectInFlight'));
  assert.ok(powersyncSrc.includes('connect: () => db.connect(connector)'));
  assert.ok(refreshSrc.includes('if (status?.connected)'));
  assert.ok(refreshSrc.includes('usedConnect: true'));
  assert.ok(refreshCtl.includes('refreshPowerSync'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
