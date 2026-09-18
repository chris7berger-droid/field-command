#!/usr/bin/env node
/**
 * Daily Log: do not auto-reopen SOD/MOD/EOD composer when that type is already in today.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tabPath = path.join(__dirname, '../src/screens/tabs/ReportTab.js');
const tabSrc = fs.readFileSync(tabPath, 'utf8');
const start = tabSrc.indexOf('export function composerLogTypeAfterLoad');
const end = tabSrc.indexOf('export default function ReportTab');
assert.ok(start >= 0 && end > start, 'composerLogTypeAfterLoad must exist');
const fnSrc = tabSrc.slice(start, end).replace(/^export /m, '');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${fnSrc}\nmodule.exports = { composerLogTypeAfterLoad };`, sandbox);
const { composerLogTypeAfterLoad } = sandbox.module.exports;

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

check('returning with SOD already submitted does not auto-open composer', () => {
  assert.strictEqual(composerLogTypeAfterLoad('SOD', new Set(['SOD'])), null);
  assert.strictEqual(composerLogTypeAfterLoad('MOD', new Set(['SOD', 'MOD'])), null);
  assert.strictEqual(composerLogTypeAfterLoad('EOD', new Set(['EOD'])), null);
});

check('first SOD/MOD/EOD still auto-opens when that type is not in today', () => {
  assert.strictEqual(composerLogTypeAfterLoad('SOD', new Set()), 'SOD');
  assert.strictEqual(composerLogTypeAfterLoad('MOD', new Set(['SOD'])), 'MOD');
  assert.strictEqual(composerLogTypeAfterLoad('EOD', new Set(['SOD', 'MOD'])), 'EOD');
});

check('OTHER and invalid initials are unchanged', () => {
  assert.strictEqual(composerLogTypeAfterLoad('OTHER', new Set(['SOD'])), 'OTHER');
  assert.strictEqual(composerLogTypeAfterLoad(undefined, new Set()), null);
  assert.strictEqual(composerLogTypeAfterLoad('PRT', new Set()), null);
});

check('ReportTab applies the helper after logs load, once', () => {
  assert.ok(tabSrc.includes('appliedInitialLogType'));
  assert.ok(tabSrc.includes('if (logLoading) return'));
  assert.ok(tabSrc.includes('composerLogTypeAfterLoad(initialLogType, submittedTypes)'));
  assert.ok(tabSrc.includes("onPress={() => setLogType(lt.key)}"));
  assert.ok(tabSrc.includes("submittedTypes.has(lt.key) ? 'Add another'"));
});

check('Home still passes logType for duty navigation', () => {
  const home = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.js'), 'utf8');
  assert.ok(home.includes('logType: isLog ? dutyKey : undefined'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
