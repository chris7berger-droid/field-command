#!/usr/bin/env node
/**
 * GET DIRECTIONS: open Maps from the known job dest without Field GPS.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/screens/JobSiteScreen.js');
const src = fs.readFileSync(srcPath, 'utf8');

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

function loadHelpers(os) {
  const start = src.indexOf('function formatAddress');
  const end = src.indexOf('async function openDirections');
  assert.ok(start >= 0 && end > start, 'maps helpers must exist');
  const fnSrc = src.slice(start, end);
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Platform: { OS: os },
  };
  vm.runInNewContext(
    `${fnSrc}\nmodule.exports = { formatAddress, mapsDest, destParam, directionsUrl };`,
    sandbox
  );
  return sandbox.module.exports;
}

const job = {
  jobsite_address: '123 Main St',
  jobsite_city: 'Reno',
  jobsite_state: 'NV',
  jobsite_zip: '89501',
  jobsite_latitude: 39.5296,
  jobsite_longitude: -119.8138,
};
const ios = loadHelpers('ios');
const android = loadHelpers('android');
const addr = ios.formatAddress(job);
const coordDest = ios.mapsDest(job, addr);
const queryDest = ios.mapsDest(
  { ...job, jobsite_latitude: 0, jobsite_longitude: 0 },
  addr
);

check('GET DIRECTIONS does not import or await Field GPS', () => {
  assert.ok(!src.includes('getCurrentPosition'));
  assert.ok(!src.includes('../lib/location'));
  assert.ok(!src.includes('GETTING LOCATION'));
  const open = src.slice(
    src.indexOf('async function openDirections'),
    src.indexOf('export default function JobSiteScreen')
  );
  assert.ok(open.includes('Linking.openURL(directionsUrl(dest))'));
  assert.ok(!open.includes('origin'));
  assert.ok(!open.includes('await getCurrentPosition'));
});

check('stored coordinates beat formatted address; 0,0 falls back to address', () => {
  assert.strictEqual(coordDest.kind, 'coords');
  assert.strictEqual(coordDest.lat, 39.5296);
  assert.strictEqual(coordDest.lng, -119.8138);
  assert.strictEqual(queryDest.kind, 'query');
  assert.strictEqual(queryDest.q, '123 Main St, Reno, NV, 89501');
  assert.strictEqual(ios.mapsDest({}, null), null);
});

check('iOS URL uses Current Location origin, dest, and driving', () => {
  const coordsUrl = ios.directionsUrl(coordDest);
  const queryUrl = ios.directionsUrl(queryDest);
  assert.strictEqual(
    coordsUrl,
    'http://maps.apple.com/?saddr=Current+Location&daddr=39.5296,-119.8138&dirflg=d'
  );
  assert.strictEqual(
    queryUrl,
    `http://maps.apple.com/?saddr=Current+Location&daddr=${encodeURIComponent(queryDest.q)}&dirflg=d`
  );
  assert.ok(!coordsUrl.includes('saddr=39.') && !queryUrl.includes('saddr=39.'));
});

check('Android URL is dest-only driving directions', () => {
  assert.strictEqual(
    android.directionsUrl(coordDest),
    'https://www.google.com/maps/dir/?api=1&destination=39.5296,-119.8138&travelmode=driving'
  );
  assert.strictEqual(
    android.directionsUrl(queryDest),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(queryDest.q)}&travelmode=driving`
  );
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
