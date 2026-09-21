#!/usr/bin/env node
/**
 * Demo Mode is dev-only: fake GPS and 15s lunch follow demoActive,
 * both controls render only under __DEV__, release GPS calls stay in place.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tabSrc = fs.readFileSync(
  path.join(__dirname, '../src/screens/tabs/TimeClockTab.js'),
  'utf8'
);

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

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
  return src.slice(start, end);
}

check('demoActive is __DEV__ and demoMode, default off', () => {
  assert.ok(tabSrc.includes('const [demoMode, setDemoMode] = useState(false);'));
  assert.ok(tabSrc.includes('const [demoOnSite, setDemoOnSite] = useState(true);'));
  assert.ok(tabSrc.includes('const demoActive = __DEV__ && demoMode;'));
});

check('Clock In fake GPS uses demoActive, else getClockInPosition', () => {
  const clockIn = sliceBetween(tabSrc, 'if (isClockIn) {', 'let gpsResult');
  assert.ok(clockIn.includes('if (demoActive) {'));
  assert.ok(!clockIn.includes('demoMode'));
  assert.ok(clockIn.includes('position = await getClockInPosition()'));
  assert.ok(clockIn.includes('DEMO_POSITIONS.onSite'));
  assert.ok(clockIn.includes('DEMO_POSITIONS.offSite'));
});

check('checkGPS fake GPS uses demoActive, else getCurrentPosition', () => {
  const gps = sliceBetween(tabSrc, 'const checkGPS = useCallback', 'const writePunch = useCallback');
  assert.ok(gps.includes('if (demoActive) {'));
  assert.ok(!gps.includes('demoMode'));
  assert.ok(gps.includes('position = await getCurrentPosition()'));
  assert.ok(gps.includes('DEMO_POSITIONS.onSite'));
  assert.ok(gps.includes('DEMO_POSITIONS.offSite'));
});

check('demo lunch duration uses demoActive', () => {
  const lunch = sliceBetween(tabSrc, 'Lunch countdown', 'const lunchMin');
  assert.ok(lunch.includes('const duration = demoActive ? LUNCH_DURATION_DEMO_MS : LUNCH_DURATION_MS'));
  assert.ok(!lunch.includes('demoMode'));
  assert.ok(lunch.includes('LUNCH_DURATION_MS'));
});

check('both Demo Mode UI blocks are __DEV__-guarded', () => {
  const marker = 'styles.demoSection';
  const hits = [];
  let from = 0;
  while (from < tabSrc.length) {
    const at = tabSrc.indexOf(marker, from);
    if (at < 0) break;
    hits.push(tabSrc.slice(Math.max(0, at - 80), at));
    from = at + marker.length;
  }
  assert.strictEqual(hits.length, 2);
  for (const before of hits) {
    assert.ok(before.includes('{__DEV__ ? ('), `demo section missing __DEV__ guard:\n${before}`);
  }
  assert.ok(!tabSrc.includes('if (demoMode)'));
});

check('no new demo env or config flag', () => {
  assert.ok(!tabSrc.includes('EXPO_PUBLIC'));
  assert.ok(!tabSrc.includes('process.env'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${6} passed`);
