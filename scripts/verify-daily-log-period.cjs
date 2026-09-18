#!/usr/bin/env node
/**
 * Daily Log selected period: SOD/MOD/EOD content is exclusive.
 * Completed SOD must not stay on screen when MOD is selected.
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
  `${utilsSrc}\n${histSrc}\nmodule.exports = { dailyLogEntriesOnDate, dailyLogEntriesForPeriod };`,
  sandbox
);
const { dailyLogEntriesOnDate, dailyLogEntriesForPeriod } = sandbox.module.exports;

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
const SOD = {
  id: 'sod-1',
  entry_type: 'SOD',
  notes: 'Site open',
  photos: '["https://example.test/sod.jpg"]',
  created_at: '2026-09-18 14:10:00.000+00',
};
const MOD = {
  id: 'mod-1',
  entry_type: 'MOD',
  notes: 'Mid day',
  photos: '["https://example.test/mod.jpg"]',
  created_at: '2026-09-18 18:10:00.000+00',
};
const EOD = {
  id: 'eod-1',
  entry_type: 'EOD',
  notes: 'Wrapped',
  photos: '["https://example.test/eod.jpg"]',
  created_at: '2026-09-18 23:01:00.000+00',
};
const OTHER = {
  id: 'other-1',
  entry_type: 'OTHER',
  notes: 'Extra',
  photos: '[]',
  created_at: '2026-09-18 19:00:00.000+00',
};

const todayEntries = dailyLogEntriesOnDate([SOD, MOD, EOD, OTHER], TODAY);

check('no selected period still shows the whole day', () => {
  assert.strictEqual(
    JSON.stringify(dailyLogEntriesForPeriod(todayEntries, null).map((e) => e.id)),
    JSON.stringify(['sod-1', 'mod-1', 'eod-1', 'other-1'])
  );
});

check('selecting MOD hides completed SOD (Build 8 regression)', () => {
  const visible = dailyLogEntriesForPeriod(todayEntries, 'MOD');
  assert.strictEqual(JSON.stringify(visible.map((e) => e.entry_type)), JSON.stringify(['MOD']));
  assert.ok(!visible.some((e) => e.entry_type === 'SOD'));
  assert.ok(!visible.some((e) => e.entry_type === 'EOD'));
});

check('selecting SOD or EOD shows only that period', () => {
  assert.strictEqual(JSON.stringify(dailyLogEntriesForPeriod(todayEntries, 'SOD').map((e) => e.id)), JSON.stringify(['sod-1']));
  assert.strictEqual(JSON.stringify(dailyLogEntriesForPeriod(todayEntries, 'EOD').map((e) => e.id)), JSON.stringify(['eod-1']));
});

check('incomplete MOD has no historical cards from other periods', () => {
  const beforeMod = dailyLogEntriesOnDate([SOD, EOD], TODAY);
  assert.strictEqual(dailyLogEntriesForPeriod(beforeMod, 'MOD').length, 0);
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');

check('ReportTab renders the period-filtered list and keeps Add another', () => {
  assert.ok(tabSrc.includes('dailyLogEntriesForPeriod(viewedLogEntries, selectedLogType)'));
  assert.ok(tabSrc.includes('visibleLogEntries.map((entry)'));
  assert.ok(tabSrc.includes('openLogPeriod(lt.key, { compose: true })'));
  assert.ok(tabSrc.includes("submittedTypes.has(lt.key) ? 'Add another'"));
  assert.ok(tabSrc.includes('composerLogTypeAfterLoad(initialLogType, submittedTypes)'));
  assert.ok(tabSrc.includes('if (viewDate !== today) return;'));
  assert.ok(tabSrc.includes('uploadPhotos(photosToUpload, jobId)'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
