#!/usr/bin/env node
/**
 * CLOCK IN GPS tiering + non-blocking weather patch.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/location.js');
const src = fs.readFileSync(srcPath, 'utf8')
  .replace(/^import .*$/m, '')
  .replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${src}\nmodule.exports = { CLOCK_IN_MAX_AGE_MS, CLOCK_IN_MAX_ACCURACY_M, clockInFixIsAccurate, clockInFixIsFresh };`,
  sandbox
);
const {
  CLOCK_IN_MAX_AGE_MS,
  CLOCK_IN_MAX_ACCURACY_M,
  clockInFixIsAccurate,
  clockInFixIsFresh,
} = sandbox.module.exports;

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

check('Clock In accept thresholds are 30s and 50m', () => {
  assert.strictEqual(CLOCK_IN_MAX_AGE_MS, 30 * 1000);
  assert.strictEqual(CLOCK_IN_MAX_ACCURACY_M, 50);
});

check('accuracy: missing/null/over 50m rejected, 50m accepted', () => {
  assert.strictEqual(clockInFixIsAccurate(undefined), false);
  assert.strictEqual(clockInFixIsAccurate({}), false);
  assert.strictEqual(clockInFixIsAccurate({ accuracy: null }), false);
  assert.strictEqual(clockInFixIsAccurate({ accuracy: 50.1 }), false);
  assert.strictEqual(clockInFixIsAccurate({ accuracy: 51 }), false);
  assert.strictEqual(clockInFixIsAccurate({ accuracy: 50 }), true);
  assert.strictEqual(clockInFixIsAccurate({ accuracy: 12 }), true);
});

check('freshness: >30s or missing timestamp rejected', () => {
  const now = 1_000_000;
  assert.strictEqual(clockInFixIsFresh({ timestamp: now - 30 * 1000 }, now), true);
  assert.strictEqual(clockInFixIsFresh({ timestamp: now - 30 * 1000 - 1 }, now), false);
  assert.strictEqual(clockInFixIsFresh({ timestamp: now - 5000 }, now), true);
  assert.strictEqual(clockInFixIsFresh({}, now), false);
  assert.strictEqual(clockInFixIsFresh(null, now), false);
});

const locSrc = fs.readFileSync(srcPath, 'utf8');
check('getClockInPosition tries last-known, then Balanced, then High', () => {
  const fn = locSrc.slice(locSrc.indexOf('export async function getClockInPosition'));
  const last = fn.indexOf('getLastKnownPositionAsync');
  const balanced = fn.indexOf('Accuracy.Balanced');
  const high = fn.indexOf('Accuracy.High');
  assert.ok(last >= 0 && balanced > last && high > balanced);
  assert.ok(fn.includes('maxAge: CLOCK_IN_MAX_AGE_MS'));
  assert.ok(fn.includes('requiredAccuracy: CLOCK_IN_MAX_ACCURACY_M'));
});

check('getCurrentPosition (Clock Out / other) still uses High only', () => {
  const fn = locSrc.slice(
    locSrc.indexOf('export async function getCurrentPosition'),
    locSrc.indexOf('export async function getClockInPosition')
  );
  assert.ok(fn.includes('Accuracy.High'));
  assert.ok(!fn.includes('getLastKnownPositionAsync'));
  assert.ok(!fn.includes('Accuracy.Balanced'));
});

check('150m geofence default unchanged', () => {
  assert.ok(locSrc.includes('jobSite.geofence_radius || 150'));
});

const tabPath = path.join(__dirname, '../src/screens/tabs/TimeClockTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');

check('CLOCK IN uses getClockInPosition and does not await weather before INSERT', () => {
  const clockIn = tabSrc.indexOf('position = await getClockInPosition()');
  const write = tabSrc.indexOf('writePunch(currentStep.punch, position, null, gpsOverride)', clockIn);
  const weatherStart = tabSrc.indexOf('fetchWeather(', clockIn);
  assert.ok(clockIn >= 0);
  assert.ok(write > clockIn);
  assert.ok(weatherStart > clockIn && weatherStart < write);
  const clockInBlock = tabSrc.slice(clockIn, tabSrc.indexOf('let gpsResult', clockIn));
  assert.ok(!clockInBlock.includes('await fetchWeather'));
  assert.ok(clockInBlock.includes('advanceStep()'));
});

check('CLOCK IN patches weather onto the same punch after INSERT', () => {
  assert.ok(tabSrc.includes('UPDATE time_punches SET weather_temp=?, weather_condition=?, synced=0 WHERE id=?'));
});

check('CLOCK IN keeps geofence warn-before-write and duplicate-submit lock', () => {
  const slice = tabSrc.slice(
    tabSrc.indexOf('if (isClockIn) {'),
    tabSrc.indexOf('let gpsResult')
  );
  assert.ok(slice.includes('checkGeofence(position, job)'));
  assert.ok(slice.includes('setShowGeofenceModal(true)'));
  assert.ok(tabSrc.includes('clockInSubmitGuard.tryBegin()'));
  assert.ok(slice.includes('releaseClockInSubmit()'));
});

check('Clock Out still awaits weather via checkGPS', () => {
  assert.ok(tabSrc.includes('const weatherData = await fetchWeather'));
  const confirm = tabSrc.indexOf('const confirmClockOut');
  assert.ok(tabSrc.indexOf('await checkGPS()', confirm) > confirm);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
