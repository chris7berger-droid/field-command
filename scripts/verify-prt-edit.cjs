#!/usr/bin/env node
/**
 * Submitted-PRT edit: view-model transition + no-write CANCEL.
 * Edit must never produce a chrome-only PRT body.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const libPath = path.join(__dirname, '../src/lib/prtEdit.js');
const libSrc = fs.readFileSync(libPath, 'utf8').replace(/^export /gm, '');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(
  `${libSrc}\nmodule.exports = { asPrtTaskList, editSowTasks, seedTaskEntries, visiblePrtEditEntries, prtSectionView, showSubmittedPrtReadback, cancelSubmittedPrtEdit };`,
  sandbox
);
const {
  editSowTasks,
  seedTaskEntries,
  visiblePrtEditEntries,
  prtSectionView,
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
  target_pct: 0,
  pct_today: 89,
  notes: 'Needed more crew',
};

check('Edit does not pull other-day SOW tasks such as Prep', () => {
  const source = editSowTasks(todaySow, [submittedTask1]);
  assert.ok(!source.some((t) => t.description === 'Prep'));
  assert.strictEqual(otherDayPrep.description, 'Prep');
});

check('Edit prefills the 89% / target 0 / note row from the submitted card', () => {
  const entries = visiblePrtEditEntries([], [submittedTask1]);
  assert.ok(entries.length > 0, 'Edit seeded zero tasks');
  assert.strictEqual(entries[0].pct_today, 89);
  assert.strictEqual(entries[0].target_pct, 0);
  assert.strictEqual(entries[0].notes, 'Needed more crew');
});

check('CANCEL exits edit with zero writes', () => {
  const next = cancelSubmittedPrtEdit();
  assert.strictEqual(next.editing, false);
  assert.strictEqual(JSON.stringify(next.writes), '[]');
});

check('view: submitted + not editing → readback, no editor, no sticky', () => {
  const view = prtSectionView({
    submitted: true,
    editing: false,
    taskEntries: [],
    savedTasks: [submittedTask1],
  });
  assert.strictEqual(view.showReadback, true);
  assert.strictEqual(view.showEditor, false);
  assert.strictEqual(view.showSticky, false);
});

check('view: tap Edit with populated taskEntries → editor + sticky, not readback', () => {
  const entries = visiblePrtEditEntries([], [submittedTask1]);
  const view = prtSectionView({
    submitted: true,
    editing: true,
    taskEntries: entries,
    savedTasks: [submittedTask1],
  });
  assert.strictEqual(view.showEditor, true);
  assert.strictEqual(view.showReadback, false);
  assert.strictEqual(view.showSticky, true);
  assert.strictEqual(view.editor[0].pct_today, 89);
});

check('view: editing true + empty taskEntries cannot chrome-only blank', () => {
  const view = prtSectionView({
    submitted: true,
    editing: true,
    taskEntries: [],
    savedTasks: [submittedTask1],
  });
  assert.strictEqual(view.showEditor, false);
  assert.strictEqual(view.showReadback, true, 'must keep readback when editor has zero cards');
  assert.strictEqual(view.showSticky, false);
});

check('view: live query drops prtSubmitted after Edit cannot chrome-only blank', () => {
  const view = prtSectionView({
    submitted: false,
    editing: true,
    taskEntries: [],
    savedTasks: [submittedTask1],
  });
  assert.strictEqual(view.showReadback, true, 'saved 89% row must keep readback if query misses');
  assert.strictEqual(view.showEditor, false);
});

check('view: cancel returns to readback', () => {
  const after = cancelSubmittedPrtEdit();
  const view = prtSectionView({
    submitted: true,
    editing: after.editing,
    taskEntries: visiblePrtEditEntries([], [submittedTask1]),
    savedTasks: [submittedTask1],
  });
  assert.strictEqual(after.writes.length, 0);
  assert.strictEqual(view.showReadback, true);
  assert.strictEqual(view.showEditor, false);
});

check('view: first-submit empty SOW is empty editor, not a fake submitted card', () => {
  const view = prtSectionView({
    submitted: false,
    editing: false,
    taskEntries: [],
    savedTasks: [],
  });
  assert.strictEqual(view.showReadback, false);
  assert.strictEqual(view.showEditor, false);
  assert.strictEqual(view.hasSubmittedWork, false);
});

const tabSrc = fs.readFileSync(path.join(__dirname, '../src/screens/tabs/ReportTab.js'), 'utf8');

check('ReportTab render uses prtSectionView, not editing XOR readback', () => {
  assert.ok(tabSrc.includes('prtSectionView({'));
  assert.ok(tabSrc.includes('{prtView.showReadback ? ('));
  assert.ok(tabSrc.includes('prtView.showEditor ? prtView.editor : taskEntries'));
  assert.ok(tabSrc.includes('prtView.showSticky'));
  assert.ok(!tabSrc.includes('prtSubmitted && !editing'));
  assert.ok(!tabSrc.includes('allSowTasks'));
});

check('ReportTab Edit seeds from the card parse and does not reseed after Edit', () => {
  assert.ok(tabSrc.includes('parseJSONArray(existingReport?.tasks, [])'));
  assert.ok(tabSrc.includes('visiblePrtEditEntries(todaySowTasks, saved)'));
  assert.ok(tabSrc.includes('if (editing) return;'));
  assert.ok(tabSrc.includes('if (prtSubmitted) return;'));
  const effect = tabSrc.slice(tabSrc.indexOf('First-submit seed only'), tabSrc.indexOf('const updateTask'));
  assert.ok(effect.includes('if (editing) return;'));
  assert.ok(!effect.includes('visiblePrtEditEntries'));
});

check('ReportTab CANCEL is visible on edit and does not write', () => {
  assert.ok(tabSrc.includes('>CANCEL</Text>'));
  assert.ok(tabSrc.includes('onPress={cancelEdit}'));
  const cancelFn = tabSrc.slice(tabSrc.indexOf('const cancelEdit'), tabSrc.indexOf('}, []);', tabSrc.indexOf('const cancelEdit')) + 6);
  assert.ok(cancelFn.includes('cancelSubmittedPrtEdit()'));
  assert.ok(!cancelFn.includes('db.execute'));
  assert.ok(!cancelFn.includes('savePRTDraft'));
  assert.ok(!cancelFn.includes('submitPRT'));
});

check('PRT has no Save Draft path', () => {
  assert.ok(!tabSrc.includes('SAVE DRAFT'));
  assert.ok(!tabSrc.includes('savePRTDraft'));
  assert.ok(!tabSrc.includes("status: 'draft'"));
  assert.ok(!tabSrc.includes('PRT draft'));
  assert.ok(tabSrc.includes("'SUBMIT PRT'"));
  assert.ok(tabSrc.includes("'RESUBMIT PRT'"));
  assert.ok(tabSrc.includes("status: 'submitted'"));
});

check('first submit and worked-only persist', () => {
  assert.ok(tabSrc.includes('const worked = taskEntries.filter(t => Number(t.pct_today) > 0)'));
  assert.ok(tabSrc.includes('JSON.stringify(worked)'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nprt-edit verification passed');
