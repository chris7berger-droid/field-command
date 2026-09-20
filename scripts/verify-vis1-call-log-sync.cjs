#!/usr/bin/env node
/**
 * VIS-1: committed sync-rules shape. Legacy Sync Rules cannot subquery, so
 * Schedule-driven call_log must be a parameter bucket off jobs.status.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '../powersync-sync-rules.yaml'),
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

check('all_data Sales-stage call_log is preserved', () => {
  assert.ok(src.includes("SELECT * FROM call_log"));
  assert.ok(src.includes("WHERE stage = 'Scheduled'"));
  assert.ok(src.includes("OR stage = 'In Progress'"));
  assert.ok(src.includes("OR stage = 'Parked'"));
  assert.ok(src.includes("OR stage = 'mobilized'"));
  assert.ok(src.includes("OR stage = 'in_progress'"));
});

check('parked_scheduled_call_log uses supported parameter-bucket shape', () => {
  assert.ok(src.includes('parked_scheduled_call_log:'));
  assert.ok(src.includes('SELECT call_log_id'));
  assert.ok(src.includes('FROM jobs'));
  assert.ok(src.includes("status = 'Parked'"));
  assert.ok(src.includes("status = 'Scheduled'"));
  assert.ok(src.includes("status = 'Ongoing'"));
  assert.ok(src.includes("deleted = 'No'"));
  assert.ok(src.includes('SELECT * FROM call_log WHERE id = bucket.call_log_id'));
  assert.ok(!src.includes('IN (SELECT'));
  assert.ok(!/JOIN public\.|INNER JOIN/i.test(src));
});

check('assignment-window is not in VIS-1', () => {
  const params = src.slice(src.indexOf('parked_scheduled_call_log:'));
  assert.ok(!params.includes('FROM assignments'));
});

check('no publication change and no per-user filter', () => {
  assert.ok(!src.includes('ALTER PUBLICATION'));
  assert.ok(!src.includes('request.user_id'));
});

check('includes Ongoing parents and excludes Complete / Sold-only', () => {
  const params = src.slice(src.indexOf('parked_scheduled_call_log:'));
  assert.ok(params.includes("status = 'Ongoing'"));
  assert.ok(!params.includes("status = 'Complete'"));
  assert.ok(!params.includes("status = 'Sold'"));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall vis1 call_log sync-rule checks passed');
