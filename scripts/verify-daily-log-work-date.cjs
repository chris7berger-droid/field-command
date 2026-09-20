#!/usr/bin/env node
/**
 * Daily Log work_date grouping, legacy created_at fallback, eligibility,
 * late vs clock-out, ADL, required-before-ADL, PRT isolation hooks.
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
const dutyPath = path.join(__dirname, '../src/lib/dayDuty.js');
const dutySrc = fs.readFileSync(dutyPath, 'utf8')
  .replace(/import \{[^}]+\} from '\.\/utils';\n/, '')
  .replace(/^export /gm, '');

const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${utilsSrc}\n${histSrc}\n${dutySrc}\nmodule.exports = {
    entryWorkDate, dailyLogWorkDates, dailyLogEntriesOnDate, dailyLogEntriesForPeriod,
    missingRequiredLogTypes, nextRequiredLogType, eligibleWorkDates,
    canWriteDailyLogOnDate, punchWorkDate, punchWorkDatesForJob,
    applicableClockOutTime, requiredPeriodStatus, canComposeRequiredOnDate,
    canComposeAdlOnDate, dailyLogAccessGate, reportClockGate, formatLogSubmittedAt, adlCountOnDate, localYmd
  };`,
  sandbox
);
const {
  entryWorkDate, dailyLogWorkDates, dailyLogEntriesOnDate, dailyLogEntriesForPeriod,
  missingRequiredLogTypes, nextRequiredLogType, eligibleWorkDates,
  canWriteDailyLogOnDate, punchWorkDatesForJob,
  applicableClockOutTime, requiredPeriodStatus, canComposeRequiredOnDate,
  canComposeAdlOnDate, dailyLogAccessGate, reportClockGate, formatLogSubmittedAt, adlCountOnDate,
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

const SAT = '2026-09-19';
const SUN = '2026-09-20';
const SAT_SOD_LEGACY = {
  id: 'sod-legacy',
  entry_type: 'SOD',
  created_at: '2026-09-19 21:00:00.000+00',
};
const SAT_SOD_LATE = {
  id: 'sod-late',
  entry_type: 'SOD',
  work_date: SAT,
  created_at: '2026-09-20 16:30:00.000+00',
};
const SAT_ADL = {
  id: 'adl-1',
  entry_type: 'ADL',
  work_date: SAT,
  created_at: '2026-09-20 17:00:00.000+00',
};

check('legacy null work_date groups by localYmd(created_at)', () => {
  assert.strictEqual(entryWorkDate(SAT_SOD_LEGACY), SAT);
  assert.strictEqual(dailyLogEntriesOnDate([SAT_SOD_LEGACY, SAT_SOD_LATE], SAT).length, 2);
  assert.strictEqual(dailyLogEntriesOnDate([SAT_SOD_LATE], SUN).length, 0);
});

check('explicit work_date wins over Sunday created_at', () => {
  assert.strictEqual(entryWorkDate(SAT_SOD_LATE), SAT);
  assert.strictEqual(JSON.stringify(dailyLogWorkDates([SAT_SOD_LATE], SUN)), JSON.stringify([SAT, SUN]));
});

check('ADL does not complete required SOD/MOD/EOD', () => {
  assert.strictEqual(JSON.stringify(missingRequiredLogTypes([SAT_ADL])), JSON.stringify(['SOD', 'MOD', 'EOD']));
  assert.strictEqual(nextRequiredLogType([SAT_ADL]), 'SOD');
  assert.strictEqual(canComposeAdlOnDate([SAT_ADL]), false);
});

check('required-before-ADL is SOD then MOD then EOD', () => {
  assert.strictEqual(nextRequiredLogType([]), 'SOD');
  assert.strictEqual(nextRequiredLogType([{ entry_type: 'SOD', created_at: 'x' }]), 'MOD');
  assert.strictEqual(nextRequiredLogType([
    { entry_type: 'SOD', created_at: 'x' },
    { entry_type: 'MOD', created_at: 'y' },
  ]), 'EOD');
  assert.strictEqual(nextRequiredLogType([
    { entry_type: 'SOD', created_at: 'x' },
    { entry_type: 'MOD', created_at: 'y' },
    { entry_type: 'EOD', created_at: 'z' },
  ]), null);
  assert.strictEqual(canComposeAdlOnDate([
    { entry_type: 'SOD', created_at: 'x' },
    { entry_type: 'MOD', created_at: 'y' },
    { entry_type: 'EOD', created_at: 'z' },
  ]), true);
});

check('ADL period includes legacy OTHER', () => {
  const rows = dailyLogEntriesForPeriod([
    SAT_ADL,
    { id: 'other', entry_type: 'OTHER', work_date: SAT, created_at: '2026-09-19 22:00:00.000+00' },
    SAT_SOD_LATE,
  ], 'ADL');
  assert.strictEqual(JSON.stringify(rows.map((e) => e.id)), JSON.stringify(['adl-1', 'other']));
});

check('eligibility is assignment or punch, not arbitrary dates', () => {
  const dates = eligibleWorkDates({
    assignmentDates: [SAT],
    punchDates: punchWorkDatesForJob([
      { punch_type: 'clock_in', job_id: '10176', employee_id: 'u1', punch_time: '2026-09-18T18:00:00.000Z', punch_date: '2026-09-18' },
    ], { jobId: '10176', employeeId: 'u1' }),
    today: SUN,
  });
  assert.ok(dates.includes(SAT));
  assert.ok(dates.includes('2026-09-18'));
  assert.ok(!dates.includes(SUN));
  assert.strictEqual(canWriteDailyLogOnDate(SAT, { today: SUN, eligibleDates: dates }), true);
  assert.strictEqual(canWriteDailyLogOnDate('2026-09-01', { today: SUN, eligibleDates: dates }), false);
  assert.strictEqual(canWriteDailyLogOnDate(SUN, { today: SUN, eligibleDates: dates, clockedIntoJob: true }), true);
  assert.strictEqual(canWriteDailyLogOnDate(SUN, { today: SUN, eligibleDates: dates, clockedIntoJob: false }), false);
});

check('overnight Punch Out Now still pairs Saturday clock-in to Sunday clock-out', () => {
  const out = applicableClockOutTime([
    { punch_type: 'clock_in', job_id: '10176', employee_id: 'u1', punch_time: '2026-09-19T16:00:00.000Z', punch_date: SAT },
    { punch_type: 'clock_out', job_id: '10176', employee_id: 'u1', punch_time: '2026-09-20T16:00:00.000Z', punch_date: SUN },
  ], { jobId: '10176', employeeId: 'u1', workDate: SAT });
  assert.strictEqual(out, '2026-09-20T16:00:00.000Z');
});

check('late is created_at after that shift clock-out; ADL does not make required late', () => {
  const clockOut = '2026-09-20T16:00:00.000Z';
  assert.strictEqual(requiredPeriodStatus([SAT_SOD_LATE], 'SOD', clockOut), 'late');
  assert.strictEqual(requiredPeriodStatus([SAT_SOD_LEGACY], 'SOD', clockOut), 'done');
  assert.strictEqual(requiredPeriodStatus([SAT_ADL], 'SOD', clockOut), 'missing');
  assert.strictEqual(requiredPeriodStatus([], 'SOD', clockOut), 'missing');
  assert.strictEqual(requiredPeriodStatus([SAT_SOD_LATE], 'SOD', null), 'done');
});

check('historical required is read-only once submitted; missing can compose', () => {
  assert.strictEqual(canComposeRequiredOnDate([SAT_SOD_LATE], 'SOD', { historical: true }), false);
  assert.strictEqual(canComposeRequiredOnDate([SAT_SOD_LATE], 'MOD', { historical: true }), true);
  assert.strictEqual(canComposeRequiredOnDate([], 'SOD', { historical: false }), true);
});

check('Daily Log access allows eligible with no punch; PRT clock gate does not', () => {
  const none = [];
  const log = dailyLogAccessGate('10176', none, { eligible: true });
  const prt = reportClockGate('10176', none);
  assert.strictEqual(log.allowed, true);
  assert.strictEqual(log.kind, 'eligible');
  assert.strictEqual(prt.allowed, false);
  assert.strictEqual(prt.kind, 'none');
});

check('submit stamp keeps created_at day when it differs from work_date', () => {
  const late = formatLogSubmittedAt(SAT_SOD_LATE);
  const sameDay = formatLogSubmittedAt(SAT_SOD_LEGACY);
  assert.ok(late);
  assert.ok(sameDay);
  assert.notStrictEqual(late, sameDay);
});

check('wrong-job punch still blocks Daily Log and PRT', () => {
  const punches = [
    { punch_type: 'clock_in', job_id: '99', punch_time: '2026-09-20T15:00:00.000Z', punch_date: SUN },
  ];
  assert.strictEqual(dailyLogAccessGate('10176', punches, { eligible: true }).allowed, false);
  assert.strictEqual(reportClockGate('10176', punches).kind, 'other');
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');
const timeClockSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/TimeClockTab.js'), 'utf8');
const homeSrc = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.js'), 'utf8');
const schemaSrc = fs.readFileSync(path.join(__dirname, '../src/lib/schema.js'), 'utf8');

check('schema declares nullable work_date', () => {
  assert.ok(schemaSrc.includes('work_date:'));
  assert.ok(schemaSrc.includes('by_job_work_date'));
});

check('ADL and legacy OTHER count toward Home ADL scorecard', () => {
  assert.strictEqual(adlCountOnDate([SAT_ADL]), 1);
  assert.strictEqual(adlCountOnDate([SAT_ADL, { entry_type: 'OTHER', work_date: SAT }]), 2);
  assert.strictEqual(adlCountOnDate([SAT_SOD_LATE, SAT_ADL]), 1);
  assert.strictEqual(adlCountOnDate([SAT_SOD_LATE]), 0);
});

check('Time Clock still waits on required SOD/MOD/EOD/PRT', () => {
  assert.ok(timeClockSrc.includes('missingClockOutDuties'));
});

check('Home THIS WEEK has an ADL row under PRT; count is tappable', () => {
  assert.ok(homeSrc.includes("PRT_DUTY.short, 'ADL'"));
  assert.ok(homeSrc.includes('adlCountOnDate'));
  assert.ok(homeSrc.includes('goWeekAdl'));
  assert.ok(homeSrc.includes("logType: 'ADL'"));
  assert.ok(homeSrc.includes('logDate: date'));
  assert.ok(homeSrc.includes('weekAdlCount'));
  assert.ok(!homeSrc.includes('weekAdlCount') || homeSrc.includes('color: C.teal'));
});

check('PRT still uses reportClockGate', () => {
  assert.ok(tabSrc.includes('reportClockGate'));
  assert.ok(homeSrc.includes('reportClockGate'));
});

check('new Daily Log writes set work_date and keep created_at', () => {
  assert.ok(tabSrc.includes('work_date, synced, created_at'));
  assert.ok(tabSrc.includes('new Date().toISOString()'));
  assert.ok(tabSrc.includes('dailyLogAccessGate'));
  assert.ok(tabSrc.includes("openLogPeriod('ADL'"));
  assert.ok(tabSrc.includes('formatLogSubmittedAt(entry)'));
  assert.ok(tabSrc.includes('Required Daily Log Due') || tabSrc.includes('requiredLogDueCopy'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
