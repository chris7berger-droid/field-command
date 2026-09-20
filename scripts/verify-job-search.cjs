#!/usr/bin/env node
/**
 * Focused All Jobs Search checks. Exercises src/lib/jobSearch.js the same
 * way Search Jobs does: live call_log + live jobs parent, no week/stage gate.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/jobSearch.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(`${src}\nmodule.exports = {
  liveCallLogIds, searchableCallLogJobs, normalizeQuery, numberQuery,
  jobNumberKey, matchKind, filterSearchableJobs,
};`, sandbox);
const {
  searchableCallLogJobs, matchKind, filterSearchableJobs, jobNumberKey,
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

const lastWeek = {
  id: '3712',
  job_number: 10176,
  job_name: 'TEST Exact Penny Pricing',
  stage: 'Parked',
};
const vis1 = {
  id: '3712-sold',
  job_number: 10176,
  job_name: 'TEST Exact Penny Pricing',
  stage: 'Sold',
};
const inWeek = {
  id: '4001',
  job_number: 10200,
  job_name: 'This Week Roof',
  stage: 'Scheduled',
};
const deletedCl = {
  id: '5001',
  job_number: 10999,
  job_name: 'Deleted Job',
  stage: 'Parked',
};
const named = {
  id: '4002',
  job_number: 8844,
  job_name: 'Harbor View Overlay',
  stage: 'In Progress',
};

const liveJobRows = [
  { call_log_id: '3712', job_num: '10176', scheduled_start: '2026-08-01', scheduled_end: '2026-08-04' },
  { call_log_id: '3712-sold', job_num: '10176' },
  { call_log_id: '4001', job_num: '10200' },
  { call_log_id: '4002', job_num: '8844' },
  { call_log_id: '9999', job_num: '77777' }, // orphan jobs row — no call_log
];

check('live job outside this week is searchable', () => {
  const list = searchableCallLogJobs([lastWeek, inWeek], liveJobRows);
  const ids = list.map((j) => String(j.id));
  assert.ok(ids.includes('3712'), 'dated last-week job must stay in the search universe');
  assert.ok(ids.includes('4001'));
  assert.strictEqual(list.find((j) => String(j.id) === '3712').job_number, 10176);
});

check('VIS-1 Sold+Parked/live Schedule job remains searchable', () => {
  const list = searchableCallLogJobs([vis1], liveJobRows);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(String(list[0].id), '3712-sold');
  assert.strictEqual(list[0].stage, 'Sold');
});

check('deleted job excluded', () => {
  const list = searchableCallLogJobs([deletedCl, lastWeek], liveJobRows);
  const ids = list.map((j) => String(j.id));
  assert.ok(!ids.includes('5001'));
  assert.ok(ids.includes('3712'));
});

check('orphan jobs row without call_log excluded', () => {
  const list = searchableCallLogJobs([lastWeek], liveJobRows);
  assert.ok(!list.some((j) => String(j.id) === '9999'));
  assert.ok(!list.some((j) => String(j.job_num) === '77777' && String(j.id) !== '3712'));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(String(list[0].id), '3712');
});

check('job-number matching is primary', () => {
  const universe = searchableCallLogJobs([lastWeek, named], liveJobRows);
  const byNumber = filterSearchableJobs(universe, '10176');
  assert.strictEqual(byNumber.length, 1);
  assert.strictEqual(String(byNumber[0].id), '3712');
  assert.strictEqual(matchKind(lastWeek, '#10176'), 'exact_number');
  assert.strictEqual(matchKind(lastWeek, '101'), 'prefix_number');
  assert.strictEqual(jobNumberKey(lastWeek), '10176');
});

check('job-name matching is secondary', () => {
  const universe = searchableCallLogJobs([lastWeek, named], liveJobRows);
  const byName = filterSearchableJobs(universe, 'harbor');
  assert.strictEqual(byName.length, 1);
  assert.strictEqual(String(byName[0].id), '4002');
  assert.strictEqual(matchKind(named, 'Harbor View'), 'name');
  assert.strictEqual(matchKind(lastWeek, 'harbor'), null);
});

check('number hits rank ahead of name hits', () => {
  const numNamed = {
    id: '4003',
    job_number: 555,
    job_name: 'Includes 10176 in the title',
    stage: 'Parked',
  };
  const universe = searchableCallLogJobs(
    [lastWeek, numNamed],
    [...liveJobRows, { call_log_id: '4003' }],
  );
  const hits = filterSearchableJobs(universe, '10176');
  assert.strictEqual(String(hits[0].id), '3712');
  assert.strictEqual(String(hits[1].id), '4003');
});

const jobSearchScreen = fs.readFileSync(
  path.join(__dirname, '../src/screens/JobSearchScreen.js'),
  'utf8'
);
const jobList = fs.readFileSync(
  path.join(__dirname, '../src/screens/JobListScreen.js'),
  'utf8'
);
const app = fs.readFileSync(
  path.join(__dirname, '../App.js'),
  'utf8'
);
const home = fs.readFileSync(
  path.join(__dirname, '../src/screens/HomeScreen.js'),
  'utf8'
);

check('navigation uses call_log.id', () => {
  assert.ok(jobSearchScreen.includes("navigate('JobMenu'"));
  assert.ok(jobSearchScreen.includes('jobId: item.id'));
  assert.ok(!jobSearchScreen.includes('jobId: item.call_log_id'));
  assert.ok(!jobSearchScreen.includes('jobId: live'));
});

check('Search Jobs does not week-filter or Sales-stage-filter', () => {
  assert.ok(!jobSearchScreen.includes('isListedThisWeek'));
  assert.ok(!jobSearchScreen.includes('isActiveThisWeek'));
  assert.ok(!jobSearchScreen.includes("WHERE stage IN"));
  assert.ok(jobSearchScreen.includes('SEARCH ALL JOBS'));
  assert.ok(jobSearchScreen.includes('searchableCallLogJobs'));
  assert.ok(jobSearchScreen.includes('LIVE_JOB_FILTER'));
  assert.ok(jobSearchScreen.includes('SELECT * FROM call_log'));
});

check('View All week/stage behavior is unchanged', () => {
  assert.ok(jobList.includes('isListedThisWeek'));
  assert.ok(jobList.includes(
    "SELECT * FROM call_log WHERE stage IN ('Scheduled', 'In Progress', 'Parked', 'mobilized', 'in_progress')"
  ));
  assert.ok(jobList.includes("navigate('JobSearch')"));
  assert.ok(jobList.includes('SEARCH ALL JOBS'));
});

check('Home is unchanged and stack registers JobSearch', () => {
  assert.ok(home.includes('buildHomeWeekJobs'));
  assert.ok(!home.includes('JobSearch'));
  assert.ok(!home.includes('SEARCH ALL JOBS'));
  assert.ok(app.includes("name=\"JobSearch\""));
  assert.ok(app.includes('JobSearchScreen'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall job-search checks passed');
