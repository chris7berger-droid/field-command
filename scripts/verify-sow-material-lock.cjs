#!/usr/bin/env node
/**
 * Historical SOW material checkbox lock. Loads the date predicates from
 * TasksTab.js the same way verify-daily-log-composer.cjs slices ReportTab.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tabPath = path.join(__dirname, '../src/screens/tabs/TasksTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');
const start = tabSrc.indexOf('export function isHistoricalSowWorkDate');
const end = tabSrc.indexOf('function fmtHrs');
assert.ok(start >= 0 && end > start, 'isHistoricalSowWorkDate must exist');
const fnSrc = tabSrc.slice(start, end).replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${fnSrc}\nmodule.exports = { isHistoricalSowWorkDate, materialCheckMatchDate };`,
  sandbox
);
const { isHistoricalSowWorkDate, materialCheckMatchDate } = sandbox.module.exports;

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

const today = '2026-09-20';
const past = '2026-09-19';
const future = '2026-09-21';

check('past work date is historical', () => {
  assert.strictEqual(isHistoricalSowWorkDate(past, today), true);
});

check('today is not historical', () => {
  assert.strictEqual(isHistoricalSowWorkDate(today, today), false);
});

check('future work date is not historical', () => {
  assert.strictEqual(isHistoricalSowWorkDate(future, today), false);
});

check('TBD / empty work date is not historical', () => {
  assert.strictEqual(isHistoricalSowWorkDate(null, today), false);
  assert.strictEqual(isHistoricalSowWorkDate(undefined, today), false);
  assert.strictEqual(isHistoricalSowWorkDate('', today), false);
});

check('historical checked state matches the work date', () => {
  assert.strictEqual(materialCheckMatchDate(past, today), past);
});

check('today and future/TBD still match device today', () => {
  assert.strictEqual(materialCheckMatchDate(today, today), today);
  assert.strictEqual(materialCheckMatchDate(future, today), today);
  assert.strictEqual(materialCheckMatchDate(null, today), today);
});

check('TasksTab wires the lock on the checkbox and toggleCheck', () => {
  assert.ok(tabSrc.includes('isHistoricalSowWorkDate(currentDay?.date, today)'));
  assert.ok(tabSrc.includes('disabled={isHistoricalDay}'));
  assert.ok(tabSrc.includes('materialCheckMatchDate(currentDay.date, today)'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
