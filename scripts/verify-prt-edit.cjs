#!/usr/bin/env node
/**
 * Submitted-PRT edit: today-scoped tasks + no-write CANCEL.
 * Edit must never produce a blank PRT body.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const libPath = path.join(__dirname, '../src/lib/prtEdit.js');
const libSrc = fs.readFileSync(libPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${libSrc}\nmodule.exports = { asPrtTaskList, editSowTasks, seedTaskEntries, visiblePrtEditEntries, showSubmittedPrtReadback, cancelSubmittedPrtEdit };`,
  sandbox
);
const {
  asPrtTaskList,
  editSowTasks,
  seedTaskEntries,
  visiblePrtEditEntries,
  showSubmittedPrtReadback,
  cancelSubmittedPrtEdit,
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

check('Edit with empty todaySowTasks still shows submitted Task 1 (blank-body regression)', () => {
  const entries = visiblePrtEditEntries([], [submittedTask1]);
  assert.ok(entries.length > 0, 'Edit seeded zero tasks');
  assert.strictEqual(entries[0].description, 'Task 1');
  assert.strictEqual(entries[0].pct_today, 80);
  assert.strictEqual(entries[0].notes, 'Taped the first run');
  assert.ok(!entries.some((t) => t.description === 'Prep'));
});

check('Edit accepts submitted tasks as a JSON string (PowerSync text)', () => {
  const raw = JSON.stringify([submittedTask1]);
  assert.ok(!Array.isArray(raw));
  const entries = visiblePrtEditEntries([], raw);
  assert.ok(entries.length > 0, 'JSON string submitted PRT produced zero Edit tasks');
  assert.strictEqual(entries[0].description, 'Task 1');
  assert.strictEqual(entries[0].pct_today, 80);
});

check('Edit accepts already-parsed submitted task arrays', () => {
  const entries = visiblePrtEditEntries([], [submittedTask1]);
  assert.strictEqual(asPrtTaskList([submittedTask1]).length, 1);
  assert.ok(entries.length > 0);
});

check('readback stays up if Edit would otherwise have zero cards', () => {
  assert.strictEqual(showSubmittedPrtReadback(true, false, [submittedTask1]), true);
  assert.strictEqual(showSubmittedPrtReadback(true, true, [submittedTask1]), false);
  assert.strictEqual(showSubmittedPrtReadback(true, true, []), true);
  assert.strictEqual(showSubmittedPrtReadback(false, false, []), false);
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');

check('ReportTab Edit uses today + submitted, not flattened allSowTasks', () => {
  assert.ok(!tabSrc.includes('allSowTasks'));
  assert.ok(tabSrc.includes('editSowTasks(todaySowTasks, submittedPrtTasks)'));
  assert.ok(tabSrc.includes('visiblePrtEditEntries(todaySowTasks, existingReport?.tasks)'));
  assert.ok(tabSrc.includes('const sowSource = editing ? editSowSource : todaySowTasks'));
});

check('ReportTab never opens a blank Edit body', () => {
  assert.ok(tabSrc.includes('showSubmittedPrtReadback(prtSubmitted, editing, taskEntries)'));
  assert.ok(tabSrc.includes('{showPrtReadback ? ('));
  assert.ok(tabSrc.includes('if (entries.length === 0) return'));
  assert.ok(tabSrc.includes('visiblePrtEditEntries(todaySowTasks, existingReport?.tasks)'));
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
