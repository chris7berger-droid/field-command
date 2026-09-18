#!/usr/bin/env node
/**
 * Submitted-PRT edit: today-scoped tasks + no-write CANCEL.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const libPath = path.join(__dirname, '../src/lib/prtEdit.js');
const libSrc = fs.readFileSync(libPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${libSrc}\nmodule.exports = { editSowTasks, seedTaskEntries, cancelSubmittedPrtEdit };`,
  sandbox
);
const { editSowTasks, seedTaskEntries, cancelSubmittedPrtEdit } = sandbox.module.exports;

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

const todaySow = [
  { id: 't1', description: 'Task 1', target_pct: 80 },
];
const otherDayPrep = { id: 'prep', description: 'Prep', target_pct: 100 };
const submittedTask1 = {
  description: 'Task 1',
  target_pct: 80,
  pct_today: 80,
  notes: 'Taped the first run',
};
const submittedLegacy = {
  description: 'Joint Fill',
  target_pct: 25,
  pct_today: 25,
  notes: 'Ahead of schedule',
};

check('Edit does not pull other-day SOW tasks such as Prep', () => {
  const source = editSowTasks(todaySow, [submittedTask1]);
  assert.strictEqual(JSON.stringify(source.map((t) => t.description)), JSON.stringify(['Task 1']));
  assert.ok(!source.some((t) => t.description === 'Prep'));
  assert.ok(!JSON.stringify(source).includes('Prep'));
  assert.strictEqual(otherDayPrep.description, 'Prep');
});

check('Edit keeps already-submitted descriptions even if they left today SOW', () => {
  const source = editSowTasks(todaySow, [submittedTask1, submittedLegacy]);
  assert.strictEqual(
    JSON.stringify(source.map((t) => t.description)),
    JSON.stringify(['Task 1', 'Joint Fill'])
  );
});

check('Edit prefills submitted pct and notes; unworked today tasks stay 0', () => {
  const today = [
    { id: 't1', description: 'Task 1', target_pct: 80 },
    { id: 't2', description: 'Task 2', target_pct: 40 },
  ];
  const source = editSowTasks(today, [submittedTask1]);
  const entries = seedTaskEntries(source, [submittedTask1], []);
  assert.strictEqual(entries[0].pct_today, 80);
  assert.strictEqual(entries[0].notes, 'Taped the first run');
  assert.strictEqual(entries[1].description, 'Task 2');
  assert.strictEqual(entries[1].pct_today, 0);
  assert.strictEqual(entries[1].notes, '');
});

check('CANCEL exits edit with zero writes', () => {
  const next = cancelSubmittedPrtEdit();
  assert.strictEqual(next.editing, false);
  assert.strictEqual(JSON.stringify(next.writes), '[]');
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');

check('ReportTab Edit uses today + submitted, not flattened allSowTasks', () => {
  assert.ok(!tabSrc.includes('allSowTasks'));
  assert.ok(tabSrc.includes('editSowTasks(todaySowTasks, submittedPrtTasks)'));
  assert.ok(tabSrc.includes('const sowSource = editing ? editSowSource : todaySowTasks'));
  assert.ok(tabSrc.includes('seedTaskEntries(editSowSource, submittedPrtTasks, [])'));
});

check('ReportTab CANCEL is visible on edit and does not write', () => {
  assert.ok(tabSrc.includes('{editing ? ('));
  assert.ok(tabSrc.includes('>CANCEL</Text>'));
  assert.ok(tabSrc.includes('onPress={cancelEdit}'));
  const cancelFn = tabSrc.slice(tabSrc.indexOf('const cancelEdit'), tabSrc.indexOf('}, []);', tabSrc.indexOf('const cancelEdit')) + 6);
  assert.ok(cancelFn.includes('cancelSubmittedPrtEdit()'));
  assert.ok(cancelFn.includes('setEditing(next.editing)'));
  assert.ok(!cancelFn.includes('db.execute'));
  assert.ok(!cancelFn.includes('savePRTDraft'));
  assert.ok(!cancelFn.includes('submitPRT'));
});

check('first submit and worked-only persist', () => {
  assert.ok(tabSrc.includes('const sowSource = editing ? editSowSource : todaySowTasks'));
  assert.ok(tabSrc.includes('const worked = taskEntries.filter(t => Number(t.pct_today) > 0)'));
  assert.ok(tabSrc.includes('JSON.stringify(worked)'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nprt-edit verification passed');
