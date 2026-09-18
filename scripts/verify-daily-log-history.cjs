#!/usr/bin/env node
/**
 * Daily Log history: prior work dates for the current job are read-only.
 * Today's composer, clock-out gating, and Home dots stay as they are.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsPath = path.join(__dirname, '../src/lib/utils.js');
const utilsSrc = fs.readFileSync(utilsPath, 'utf8').replace(/^export /gm, '');
const histPath = path.join(__dirname, '../src/lib/dailyLogHistory.js');
const histSrc = fs.readFileSync(histPath, 'utf8')
  .replace(/import \{[^}]+\} from '\.\/utils';\n/, '')
  .replace(/^export /gm, '');

const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${utilsSrc}\n${histSrc}\nmodule.exports = { dailyLogWorkDates, dailyLogEntriesOnDate, adjacentLogDate, createdOnLocalYmd, localYmd };`,
  sandbox
);
const { dailyLogWorkDates, dailyLogEntriesOnDate, adjacentLogDate } = sandbox.module.exports;

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

const TODAY = '2026-09-18';
const YESTERDAY = '2026-09-17';
const PRIOR = '2026-09-16';
const YESTERDAY_SOD = {
  id: 'sod-y',
  entry_type: 'SOD',
  notes: 'Site open',
  photos: '["https://example.test/sod.jpg"]',
  created_at: '2026-09-17 21:44:43.961+00',
};
const YESTERDAY_MOD = {
  id: 'mod-y',
  entry_type: 'MOD',
  notes: 'Mid day',
  photos: '[]',
  created_at: '2026-09-17 22:10:00.000+00',
};
const TODAY_EOD = {
  id: 'eod-t',
  entry_type: 'EOD',
  notes: 'Wrapped',
  photos: '["https://example.test/eod.jpg"]',
  created_at: '2026-09-18 23:01:00.000+00',
};
const FUTURE = {
  id: 'future',
  entry_type: 'SOD',
  created_at: '2026-09-19 08:00:00.000+00',
};

check('work dates always include today even with no entries', () => {
  assert.strictEqual(JSON.stringify(dailyLogWorkDates([], TODAY)), JSON.stringify([TODAY]));
  assert.strictEqual(JSON.stringify(dailyLogWorkDates(null, TODAY)), JSON.stringify([TODAY]));
});

check('prior SOD/MOD dates are included and sorted', () => {
  assert.strictEqual(
    JSON.stringify(dailyLogWorkDates([YESTERDAY_MOD, TODAY_EOD, YESTERDAY_SOD], TODAY)),
    JSON.stringify([YESTERDAY, TODAY])
  );
});

check('future dates are excluded', () => {
  assert.strictEqual(JSON.stringify(dailyLogWorkDates([FUTURE, TODAY_EOD], TODAY)), JSON.stringify([TODAY]));
});

check('entries on a prior date keep type, notes, photos, and time stamp', () => {
  const onY = dailyLogEntriesOnDate([YESTERDAY_SOD, TODAY_EOD, YESTERDAY_MOD], YESTERDAY);
  assert.strictEqual(JSON.stringify(onY.map((e) => e.id)), JSON.stringify(['sod-y', 'mod-y']));
  assert.strictEqual(onY[0].entry_type, 'SOD');
  assert.strictEqual(onY[0].notes, 'Site open');
  assert.ok(onY[0].photos.includes('sod.jpg'));
  assert.ok(onY[0].created_at);
  assert.strictEqual(JSON.stringify(dailyLogEntriesOnDate([YESTERDAY_SOD], TODAY).map((e) => e.id)), JSON.stringify([]));
});

check('prev/next move between work dates only', () => {
  const dates = dailyLogWorkDates([
    { created_at: '2026-09-16 18:00:00.000+00' },
    YESTERDAY_SOD,
    TODAY_EOD,
  ], TODAY);
  assert.strictEqual(JSON.stringify(dates), JSON.stringify([PRIOR, YESTERDAY, TODAY]));
  assert.strictEqual(adjacentLogDate(dates, TODAY, -1), YESTERDAY);
  assert.strictEqual(adjacentLogDate(dates, YESTERDAY, -1), PRIOR);
  assert.strictEqual(adjacentLogDate(dates, PRIOR, -1), null);
  assert.strictEqual(adjacentLogDate(dates, PRIOR, 1), YESTERDAY);
  assert.strictEqual(adjacentLogDate(dates, YESTERDAY, 1), TODAY);
  assert.strictEqual(adjacentLogDate(dates, TODAY, 1), null);
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');
const timeClockSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/TimeClockTab.js'), 'utf8');
const homeSrc = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.js'), 'utf8');

check('Daily Log query is this job, not today-only', () => {
  assert.ok(tabSrc.includes('SELECT * FROM daily_log_entries WHERE job_id = ? ORDER BY created_at ASC'));
  assert.ok(!tabSrc.includes('AND created_at >= ? ORDER BY created_at ASC'));
  assert.ok(tabSrc.includes('dailyLogEntriesOnDate(logEntries, today)'));
  assert.ok(tabSrc.includes('dailyLogEntriesOnDate(logEntries, viewDate)'));
});

check('composer, start buttons, and sticky submit are today-only', () => {
  assert.ok(tabSrc.includes('viewingToday && logType'));
  assert.ok(tabSrc.includes(') : viewingToday ? ('));
  assert.ok(tabSrc.includes("{section === 'log' && viewingToday && logType && ("));
  assert.ok(tabSrc.includes("if (viewDate !== today) return;"));
  assert.ok(tabSrc.includes("Read only — previous work day"));
});

check('historical cards stay read-only (type, time, notes, photos)', () => {
  const histStart = tabSrc.indexOf('viewedLogEntries.map((entry)');
  const histEnd = tabSrc.indexOf('{/* New entry composer');
  assert.ok(histStart >= 0 && histEnd > histStart);
  const hist = tabSrc.slice(histStart, histEnd);
  assert.ok(hist.includes('entry.entry_type'));
  assert.ok(hist.includes("toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })"));
  assert.ok(hist.includes('entry.notes'));
  assert.ok(hist.includes('parseJSON(entry.photos, [])'));
  assert.ok(!hist.includes('onPress'));
  assert.ok(!hist.includes('TextInput'));
});

check('today composer, clock-out gating, and Home dots are unchanged', () => {
  assert.ok(tabSrc.includes("submittedTypes.has(lt.key) ? 'Add another'"));
  assert.ok(tabSrc.includes('composerLogTypeAfterLoad(initialLogType, submittedTypes)'));
  assert.ok(tabSrc.includes('uploadPhotos(photosToUpload, jobId)'));
  assert.ok(timeClockSrc.includes('missingClockOutDuties'));
  assert.ok(timeClockSrc.includes('SELECT entry_type FROM daily_log_entries WHERE job_id = ? AND created_at >= ?'));
  assert.ok(homeSrc.includes('weekCardTitle}>THIS WEEK'));
  assert.ok(homeSrc.includes('logType: isLog ? dutyKey : undefined'));
  assert.ok(!homeSrc.includes('setViewDate'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
