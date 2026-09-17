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
  flipName, namesMatch, assignmentInHomeWeek, assignmentTeamMemberId,
  assignmentMatchesUser, assignedCallLogIds,
  punchesForEmployee, homeVisibleJobIds,
};`, sandbox);
const {
  flipName, namesMatch, assignmentTeamMemberId, assignedCallLogIds,
  punchesForEmployee, homeVisibleJobIds,
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

const CHRIS_ID = 'f5a6379d-5457-414c-a13f-d27838674911';
const TROY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const monday = '2026-09-14';
const sunday = '2026-09-20';

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

check('blank client UUIDs are treated as legacy', () => {
  assert.strictEqual(assignmentTeamMemberId(null), null);
  assert.strictEqual(assignmentTeamMemberId(undefined), null);
  assert.strictEqual(assignmentTeamMemberId(''), null);
  assert.strictEqual(assignmentTeamMemberId('   '), null);
  assert.strictEqual(assignmentTeamMemberId('null'), null);
  assert.strictEqual(assignmentTeamMemberId('NULL'), null);
  assert.strictEqual(assignmentTeamMemberId(CHRIS_ID), CHRIS_ID);
});

const assignRows = [
  { call_log_id: '100', crew_name: 'Berger, Chris', date: '2026-09-16' },
  { call_log_id: '101', crew_name: 'Troy', date: '2026-09-16' },
  { call_log_id: '102', crew_name: 'Berger, Chris', date: '2026-09-21' },
  { call_log_id: '103', crew_name: 'Chris Berger', date: '2026-09-15T00:00:00.000Z' },
];

check('assignment rows for other people do not qualify', () => {
  const ids = assignedCallLogIds({
    assignRows, memberName: 'Chris Berger', userId: CHRIS_ID, monday, sunday,
  });
  assert.ok(!ids.has('101'));
});

check('assignment outside Home week does not qualify', () => {
  const ids = assignedCallLogIds({
    assignRows, memberName: 'Chris Berger', userId: CHRIS_ID, monday, sunday,
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
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.strictEqual(ids.size, 0);
});

check('canonical UUID match is visible even if crew_name spelling differs', () => {
  const ids = assignedCallLogIds({
    assignRows: [{
      call_log_id: '200',
      crew_name: 'Smith, NotChris',
      date: '2026-09-16',
      team_member_id: CHRIS_ID,
    }],
    memberName: 'Chris Berger',
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.ok(ids.has('200'));
});

check('another user UUID is hidden even if crew_name matches', () => {
  const ids = assignedCallLogIds({
    assignRows: [{
      call_log_id: '201',
      crew_name: 'Berger, Chris',
      date: '2026-09-16',
      team_member_id: TROY_ID,
    }],
    memberName: 'Chris Berger',
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.ok(!ids.has('201'));
  assert.strictEqual(ids.size, 0);
});

check('null UUID + matching legacy name is visible', () => {
  const ids = assignedCallLogIds({
    assignRows: [{
      call_log_id: '202',
      crew_name: 'Berger, Chris',
      date: '2026-09-16',
      team_member_id: null,
    }],
    memberName: 'Chris Berger',
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.ok(ids.has('202'));
});

check('null UUID + nonmatching name is hidden', () => {
  const ids = assignedCallLogIds({
    assignRows: [{
      call_log_id: '203',
      crew_name: 'Troy',
      date: '2026-09-16',
      team_member_id: null,
    }],
    memberName: 'Chris Berger',
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.ok(!ids.has('203'));
  assert.strictEqual(ids.size, 0);
});

check('blank UUID uses name fallback only', () => {
  for (const blank of ['', '  ', 'null']) {
    const ids = assignedCallLogIds({
      assignRows: [{
        call_log_id: '204',
        crew_name: 'Berger, Chris',
        date: '2026-09-16',
        team_member_id: blank,
      }],
      memberName: 'Chris Berger',
      userId: CHRIS_ID,
      monday,
      sunday,
    });
    assert.ok(ids.has('204'), `blank ${JSON.stringify(blank)} should be legacy`);
  }
});

check('canonical UUID still respects Home week', () => {
  const ids = assignedCallLogIds({
    assignRows: [{
      call_log_id: '205',
      crew_name: 'Troy',
      date: '2026-09-21',
      team_member_id: CHRIS_ID,
    }],
    memberName: 'Chris Berger',
    userId: CHRIS_ID,
    monday,
    sunday,
  });
  assert.ok(!ids.has('205'));
});

check("THIS user's open punch preserves job", () => {
  const assigned = assignedCallLogIds({
    assignRows: [], memberName: 'Chris Berger', userId: CHRIS_ID, monday, sunday,
  });
  const mine = punchesForEmployee([
    { employee_id: CHRIS_ID, job_id: '3712', punch_type: 'clock_in' },
    { employee_id: 'someone-else', job_id: '9999', punch_type: 'clock_in' },
  ], CHRIS_ID);
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
  ], CHRIS_ID);
  const visible = homeVisibleJobIds({
    assignedIds: new Set(),
    openPunch: mine[0] || null,
  });
  assert.strictEqual(visible.size, 0);
  assert.ok(!visible.has('8888'));
});

check('View All / JobList is still unfiltered by person', () => {
  const jobList = fs.readFileSync(
    path.join(__dirname, '../src/screens/JobListScreen.js'),
    'utf8'
  );
  assert.ok(!jobList.includes('assignedCallLogIds'));
  assert.ok(!jobList.includes('assignmentMatchesUser'));
  assert.ok(jobList.includes(
    "SELECT * FROM call_log WHERE stage IN ('Scheduled', 'In Progress', 'Parked', 'mobilized', 'in_progress')"
  ));
});

check('Home selects assignments.team_member_id', () => {
  const home = fs.readFileSync(
    path.join(__dirname, '../src/screens/HomeScreen.js'),
    'utf8'
  );
  assert.ok(home.includes('a.team_member_id AS team_member_id'));
  assert.ok(home.includes('userId,'));
});

check('PowerSync client schema and committed rules include team_member_id', () => {
  const schema = fs.readFileSync(
    path.join(__dirname, '../src/lib/schema.js'),
    'utf8'
  );
  const rules = fs.readFileSync(
    path.join(__dirname, '../powersync-sync-rules.yaml'),
    'utf8'
  );
  assert.ok(/const assignments = new Table\(\s*\{[\s\S]*team_member_id:\s+column\.text/.test(schema));
  assert.ok(rules.includes(
    'SELECT id, job_id, crew_name, date, mobilization_id, team_member_id FROM assignments'
  ));
  assert.ok(!rules.includes('ALTER PUBLICATION'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall home-visibility checks passed');
