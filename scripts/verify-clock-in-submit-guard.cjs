#!/usr/bin/env node
/**
 * CLOCK IN duplicate-submit guard. Loads src/lib/clockInSubmitGuard.js
 * the same way verify-home-visibility.cjs loads crew.js.
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

check('first tryBegin starts in-flight', () => {
  const g = createClockInSubmitGuard();
  assert.strictEqual(g.tryBegin(), true);
  assert.strictEqual(g.isInFlight(), true);
});

check('second tryBegin is ignored while in-flight', () => {
  const g = createClockInSubmitGuard();
  assert.strictEqual(g.tryBegin(), true);
  assert.strictEqual(g.tryBegin(), false);
  assert.strictEqual(g.tryBegin(), false);
  assert.strictEqual(g.isInFlight(), true);
});

check('end() allows a later CLOCK IN', () => {
  const g = createClockInSubmitGuard();
  assert.strictEqual(g.tryBegin(), true);
  g.end();
  assert.strictEqual(g.isInFlight(), false);
  assert.strictEqual(g.tryBegin(), true);
});

check('second tryBegin during a GPS/write wait is ignored', () => {
  const g = createClockInSubmitGuard();
  assert.strictEqual(g.tryBegin(), true);
  // GPS / permission / write still running
  assert.strictEqual(g.tryBegin(), false);
  assert.strictEqual(g.isInFlight(), true);
  g.end();
  assert.strictEqual(g.tryBegin(), true);
});

const tabPath = path.join(__dirname, '../src/screens/tabs/TimeClockTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');

check('TimeClockTab wires the CLOCK IN in-flight guard', () => {
  assert.ok(tabSrc.includes("from '../../lib/clockInSubmitGuard'"));
  assert.ok(tabSrc.includes('clockInSubmitGuard.tryBegin()'));
  assert.ok(tabSrc.includes("currentStep.punch === 'clock_in'"));
});

check('TimeClockTab shows processing copy and disables CLOCK IN', () => {
  assert.ok(tabSrc.includes("CLOCKING IN..."));
  assert.ok(tabSrc.includes("Please wait"));
  assert.ok(tabSrc.includes('disabled={clockInProcessing && currentStep.punch === \'clock_in\'}'));
});

check('failed CLOCK IN (location denied / write error) releases the lock', () => {
  assert.ok(tabSrc.includes('releaseClockInSubmit()'));
  assert.ok(tabSrc.includes("e.message === 'LOCATION_DENIED'"));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
