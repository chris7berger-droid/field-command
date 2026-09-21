#!/usr/bin/env node
/**
 * Daily Log library picker: iOS fast-path quality, camera/submit unchanged, no measure harness.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tabSrc = fs.readFileSync(path.join(root, 'src/screens/tabs/ReportTab.js'), 'utf8');
const photosSrc = fs.readFileSync(path.join(root, 'src/lib/photos.js'), 'utf8');
const pickerIos = path.join(root, 'node_modules/expo-image-picker/ios');

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

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
  return src.slice(start, end);
}

check('FROM LIBRARY uses quality 1 (iOS fast-path compatible)', () => {
  const pick = sliceBetween(tabSrc, 'const pickPhoto = useCallback', 'const takePhoto = useCallback');
  assert.ok(pick.includes('launchImageLibraryAsync({'));
  assert.ok(pick.includes('quality: 1'));
  assert.ok(!pick.includes('quality: 0.7'));
  assert.ok(pick.includes('allowsMultipleSelection: true'));
  assert.ok(pick.includes('selectionLimit: 0'));
  assert.ok(pick.includes('orderedSelection: true'));
  assert.ok(!pick.includes('preferredAssetRepresentationMode'));
});

check('TAKE PHOTO still compresses at quality 0.7', () => {
  const take = sliceBetween(tabSrc, 'const takePhoto = useCallback', 'const submitPRT = useCallback');
  assert.ok(take.includes('launchCameraAsync({ quality: 0.7 })'));
  assert.ok(!take.includes('quality: 1'));
});

check('Submit compression still 1800px JPEG 0.7 in photos.js', () => {
  assert.ok(photosSrc.includes('const MAX_WIDTH = 1800'));
  assert.ok(photosSrc.includes('const JPEG_QUALITY = 0.7'));
  assert.ok(photosSrc.includes('export async function uploadPhotos'));
  assert.ok(tabSrc.includes('uploadPhotos(photosToUpload, jobId)'));
});

check('measurement harness files and TEMP MEASURE code are gone', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/lib/photoPickerMeasure.js')));
  assert.ok(!fs.existsSync(path.join(root, 'scripts/verify-photo-picker-measure.cjs')));
  assert.ok(!tabSrc.includes('photoPickerMeasure'));
  assert.ok(!tabSrc.includes('TEMP MEASURE'));
  assert.ok(!tabSrc.includes('measureQuality'));
  assert.ok(!tabSrc.includes('FC_PHOTO_MEASURE'));
  assert.ok(!tabSrc.includes('fcNativeAddMs'));
  assert.ok(!tabSrc.includes('beginPhotoMeasure'));
});

check('installed expo-image-picker has no FC measurement stamp', () => {
  const response = fs.readFileSync(path.join(pickerIos, 'ImagePickerResponse.swift'), 'utf8');
  const moduleSrc = fs.readFileSync(path.join(pickerIos, 'ImagePickerModule.swift'), 'utf8');
  assert.ok(!response.includes('fcNativeAddMs'));
  assert.ok(!response.includes('FC_PHOTO_MEASURE'));
  assert.ok(!moduleSrc.includes('fcNativeAddMs'));
  assert.ok(!moduleSrc.includes('FC_PHOTO_MEASURE'));
  assert.ok(moduleSrc.includes('promise.resolve(ImagePickerResponse(assets: assets, canceled: false))'));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall ok');
