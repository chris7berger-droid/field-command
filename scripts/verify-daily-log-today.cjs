#!/usr/bin/env node
/**
 * Daily Log "completed today" must match Home: localYmd(created_at),
 * not an ISO-midnight SQL string compare that drops PowerSync timestamps.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/lib/utils.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(`${src}\nmodule.exports = { localYmd, createdOnLocalYmd };`, sandbox);
const { localYmd, createdOnLocalYmd } = sandbox.module.exports;

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

const SOD_CREATED = '2026-09-17 21:44:43.961+00';
const TODAY = '2026-09-17';
const ISO_MIDNIGHT = new Date(`${TODAY}T00:00:00`).toISOString();

check('ISO midnight cutoff drops PowerSync space-timestamp SOD', () => {
  assert.strictEqual(SOD_CREATED >= ISO_MIDNIGHT, false);
});

check('local YYYY-MM-DD bound keeps the same SOD', () => {
  assert.strictEqual(SOD_CREATED >= TODAY, true);
});

check('createdOnLocalYmd matches Home Thursday SOD', () => {
  assert.strictEqual(createdOnLocalYmd(SOD_CREATED, TODAY), true);
  assert.strictEqual(createdOnLocalYmd(SOD_CREATED, '2026-09-16'), false);
});

check('createdOnLocalYmd rejects missing timestamps', () => {
  assert.strictEqual(createdOnLocalYmd(null, TODAY), false);
  assert.strictEqual(createdOnLocalYmd(SOD_CREATED, ''), false);
});

const tabPath = path.join(__dirname, '../src/screens/tabs/ReportTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');

check('Daily Log query is not an ISO midnight toISOString bound', () => {
  assert.ok(!tabSrc.includes("new Date(today + 'T00:00:00').toISOString()"));
  assert.ok(tabSrc.includes('dailyLogEntriesOnDate(logEntries, today)'));
  assert.ok(tabSrc.includes('todaysLogEntries.map((e) => e.entry_type)'));
});

check('Daily Log pills and history use today-filtered entries', () => {
  assert.ok(tabSrc.includes('todaysLogEntries'));
  assert.ok(tabSrc.includes('todaysLogEntries.map((e) => e.entry_type)'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
