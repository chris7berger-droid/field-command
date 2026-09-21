#!/usr/bin/env node
/**
 * Overnight PUNCH OUT NOW: Clock In GPS ladder + non-blocking weather patch.
 * Does not change Time Clock Clock Out.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const barPath = path.join(__dirname, '../src/components/PunchStatusBar.js');
const barSrc = fs.readFileSync(barPath, 'utf8');
const punchOutNow = barSrc.slice(
  barSrc.indexOf('const punchOutNow'),
  barSrc.indexOf('const chooseNightWork')
);
const locSrc = fs.readFileSync(path.join(__dirname, '../src/lib/location.js'), 'utf8');
const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/TimeClockTab.js'), 'utf8');

check('PunchStatusBar uses getClockInPosition, not High-only getCurrentPosition', () => {
  assert.ok(barSrc.includes("import { getClockInPosition } from '../lib/location'"));
  assert.ok(!barSrc.includes('getCurrentPosition'));
  assert.ok(punchOutNow.includes('await getClockInPosition()'));
});

check('GPS ladder is last-known, then Balanced, then High', () => {
  const fn = locSrc.slice(locSrc.indexOf('export async function getClockInPosition'));
  const last = fn.indexOf('getLastKnownPositionAsync');
  const balanced = fn.indexOf('Accuracy.Balanced');
  const high = fn.indexOf('Accuracy.High');
  assert.ok(last >= 0 && balanced > last && high > balanced);
});

check('weather starts after GPS success and is not awaited before INSERT', () => {
  const gps = punchOutNow.indexOf('await getClockInPosition()');
  const weather = punchOutNow.indexOf('fetchWeather(lat, lng)');
  const insert = punchOutNow.indexOf('INSERT INTO time_punches');
  assert.ok(gps >= 0 && weather > gps && insert > weather);
  assert.ok(!punchOutNow.includes('await fetchWeather'));
  assert.ok(punchOutNow.includes('weatherPromise = fetchWeather(lat, lng)'));
});

check('INSERT writes clock_out with weather null and patches the same punch id', () => {
  assert.ok(punchOutNow.includes("punchId = generateId()"));
  assert.ok(punchOutNow.includes('null, null,'));
  assert.ok(!punchOutNow.includes('weather?.temp_f'));
  assert.ok(punchOutNow.includes(
    'UPDATE time_punches SET weather_temp=?, weather_condition=?, synced=0 WHERE id=?'
  ));
  assert.ok(punchOutNow.includes('weatherData.temp_f, weatherData.condition, punchId'));
});

check('busy is released after INSERT, not after weather', () => {
  const insert = punchOutNow.indexOf('INSERT INTO time_punches');
  const busyOff = punchOutNow.indexOf('setBusy(false)');
  const weatherUpdate = punchOutNow.indexOf('UPDATE time_punches SET weather_temp');
  assert.ok(insert >= 0 && busyOff > insert && weatherUpdate > busyOff);
});

check('GPS failure still writes; no new hard block, geofence, or duty gates', () => {
  assert.ok(punchOutNow.includes("Still clock out. They're fixing a missed punch"));
  assert.ok(!punchOutNow.includes('LOCATION_DENIED'));
  assert.ok(!punchOutNow.includes('checkGeofence'));
  assert.ok(!punchOutNow.includes('missingClockOutDuties'));
  assert.ok(!punchOutNow.includes('Alert.alert(\'Location Required\''));
});

check('overnight association, in-flight guard, Night Work, and Notify Office are unchanged', () => {
  assert.ok(punchOutNow.includes('if (!openPunch || busy) return'));
  assert.ok(punchOutNow.includes('openPunch.job_id'));
  assert.ok(punchOutNow.includes('requireCanonicalTeamMemberId(openPunch.employee_id'));
  assert.ok(punchOutNow.includes('today,'));
  assert.ok(punchOutNow.includes("'clock_out'"));
  assert.ok(barSrc.includes('PUNCH OUT NOW AND NOTIFY OFFICE'));
  assert.ok(barSrc.includes('NIGHT WORK'));
  assert.ok(barSrc.includes('chooseNightWork'));
  assert.ok(barSrc.includes('disabled={busy}'));
});

check('Time Clock Clock Out still uses High GPS and awaits weather', () => {
  assert.ok(tabSrc.includes('const weatherData = await fetchWeather'));
  const confirm = tabSrc.indexOf('const confirmClockOut');
  assert.ok(tabSrc.indexOf('await checkGPS()', confirm) > confirm);
  const getCurrent = locSrc.slice(
    locSrc.indexOf('export async function getCurrentPosition'),
    locSrc.indexOf('export async function getClockInPosition')
  );
  assert.ok(getCurrent.includes('Accuracy.High'));
  assert.ok(!getCurrent.includes('getLastKnownPositionAsync'));
  assert.ok(!getCurrent.includes('Accuracy.Balanced'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
