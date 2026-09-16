#!/usr/bin/env node
/**
 * Deterministic Home membership checks. Loads src/lib/crew.js by stripping
 * ESM exports so we exercise the same helpers Home uses (no extra test runner).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/crew.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(`${src}\nmodule.exports = {
  flipName, namesMatch, assignmentInHomeWeek, assignedCallLogIds,
  punchesForEmployee, homeVisibleJobIds,
};`, sandbox);
const {
  flipName, namesMatch, assignedCallLogIds, punchesForEmployee, homeVisibleJobIds,
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

check('"Chris Berger" matches "Berger, Chris"', () => {
  assert.strictEqual(flipName('Berger, Chris'), 'Chris Berger');
  assert.ok(namesMatch('Chris Berger', 'Berger, Chris'));
  assert.ok(namesMatch('Berger, Chris', 'Chris Berger'));
});

check('case and whitespace normalization', () => {
  assert.ok(namesMatch('  chris berger  ', 'BERGER, CHRIS'));
  assert.ok(namesMatch('Chris Berger', 'Berger,  Chris'));
});

check('unrelated names do not match', () => {
  assert.ok(!namesMatch('Chris Berger', 'Troy'));
  assert.ok(!namesMatch('Chris Berger', 'Berger, Troy'));
  assert.ok(!namesMatch('', 'Chris Berger'));
  assert.ok(!namesMatch('Chris Berger', ''));
});

const monday = '2026-09-14';
const sunday = '2026-09-20';
const assignRows = [
  { call_log_id: '100', crew_name: 'Berger, Chris', date: '2026-09-16' },
  { call_log_id: '101', crew_name: 'Troy', date: '2026-09-16' },
  { call_log_id: '102', crew_name: 'Berger, Chris', date: '2026-09-21' },
  { call_log_id: '103', crew_name: 'Chris Berger', date: '2026-09-15T00:00:00.000Z' },
];

check('assignment rows for other people do not qualify', () => {
  const ids = assignedCallLogIds({
    assignRows, memberName: 'Chris Berger', monday, sunday,
  });
  assert.ok(!ids.has('101'));
});

check('assignment outside Home week does not qualify', () => {
  const ids = assignedCallLogIds({
    assignRows, memberName: 'Chris Berger', monday, sunday,
  });
  assert.ok(!ids.has('102'));
  assert.ok(ids.has('100'));
  assert.ok(ids.has('103'));
});

check("Chris with no crew/assignments sees no Home jobs", () => {
  const ids = assignedCallLogIds({
    assignRows: [
      { call_log_id: '44', crew_name: 'Troy', date: '2026-09-16' },
    ],
    memberName: 'Chris Berger',
    monday,
    sunday,
  });
  assert.strictEqual(ids.size, 0);
});

check("THIS user's open punch preserves job", () => {
  const assigned = assignedCallLogIds({
    assignRows: [], memberName: 'Chris Berger', monday, sunday,
  });
  const mine = punchesForEmployee([
    { employee_id: 'f5a6379d-5457-414c-a13f-d27838674911', job_id: '3712', punch_type: 'clock_in' },
    { employee_id: 'someone-else', job_id: '9999', punch_type: 'clock_in' },
  ], 'f5a6379d-5457-414c-a13f-d27838674911');
  const visible = homeVisibleJobIds({
    assignedIds: assigned,
    openPunch: mine.find((p) => p.punch_type === 'clock_in'),
  });
  assert.ok(visible.has('3712'));
  assert.ok(!visible.has('9999'));
});

check("another user's punch does not preserve job", () => {
  const mine = punchesForEmployee([
    { employee_id: 'someone-else', job_id: '8888', punch_type: 'clock_in' },
  ], 'f5a6379d-5457-414c-a13f-d27838674911');
  const visible = homeVisibleJobIds({
    assignedIds: new Set(),
    openPunch: mine[0] || null,
  });
  assert.strictEqual(visible.size, 0);
  assert.ok(!visible.has('8888'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall home-visibility checks passed');
