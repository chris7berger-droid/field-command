#!/usr/bin/env node
/**
 * CLOCK OUT duplicate-submit wiring. Same in-flight factory as Clock In.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/clockInSubmitGuard.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(`${src}\nmodule.exports = { createClockInSubmitGuard };`, sandbox);
const { createClockInSubmitGuard } = sandbox.module.exports;

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

check('second tryBegin is ignored while CLOCK OUT is in-flight', () => {
  const g = createClockInSubmitGuard();
  assert.strictEqual(g.tryBegin(), true);
  assert.strictEqual(g.tryBegin(), false);
  g.end();
  assert.strictEqual(g.tryBegin(), true);
});

const tabPath = path.join(__dirname, '../src/screens/tabs/TimeClockTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');

check('TimeClockTab locks CLOCK OUT before GPS and keeps the confirm modal up', () => {
  assert.ok(tabSrc.includes('clockOutSubmitGuard.tryBegin()'));
  assert.ok(tabSrc.includes("CLOCKING OUT..."));
  assert.ok(tabSrc.includes('if (clockOutConfirming.current) return'));
  assert.ok(tabSrc.includes('setShowClockOutModal(false)'));
  const confirmFn = tabSrc.indexOf('const confirmClockOut');
  const closeModal = tabSrc.indexOf('setShowClockOutModal(false)', confirmFn);
  const writePunch = tabSrc.indexOf("writePunch('clock_out'", confirmFn);
  assert.ok(confirmFn >= 0 && closeModal > writePunch, 'modal must stay until clock_out write finishes');
});

check('CLOCK OUT button disables while processing', () => {
  assert.ok(tabSrc.includes("clockOutProcessing && currentStep.punch === 'clock_out'"));
  assert.ok(tabSrc.includes('Please wait'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
