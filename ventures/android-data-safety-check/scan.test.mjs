import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_SAFETY_CATEGORIES,
  PERMISSION_DATA_TYPES,
  KNOWN_SDK_DATA_TYPES,
  detectDataTypes,
  buildReport,
  parseDeclaredList,
  suggestedAction,
} from './scan.mjs';

test('every category id is unique and every permission/SDK maps to a real category', () => {
  const ids = DATA_SAFETY_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const idSet = new Set(ids);
  for (const p of PERMISSION_DATA_TYPES) assert.ok(idSet.has(p.category), `${p.permission} maps to unknown category ${p.category}`);
  for (const s of KNOWN_SDK_DATA_TYPES) {
    for (const c of s.categories) assert.ok(idSet.has(c), `${s.name} maps to unknown category ${c}`);
  }
});

test('detectDataTypes finds a permission declared in AndroidManifest.xml', () => {
  const manifest = `<?xml version="1.0"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.CAMERA"/>
</manifest>
`;
  const detected = detectDataTypes([{ path: 'AndroidManifest.xml', content: manifest }]);
  assert.equal(detected.get('location').count, 1);
  assert.equal(detected.get('photos-videos').count, 1);
  assert.equal(detected.get('contacts').count, 0);
});

test('detectDataTypes finds a permission using single quotes', () => {
  const manifest = `<uses-permission android:name='android.permission.RECORD_AUDIO' />`;
  const detected = detectDataTypes([{ path: 'AndroidManifest.xml', content: manifest }]);
  assert.equal(detected.get('audio-files').count, 1);
});

test('detectDataTypes ignores an unrecognised permission without erroring', () => {
  const manifest = `<uses-permission android:name="android.permission.INTERNET" />`;
  const detected = detectDataTypes([{ path: 'AndroidManifest.xml', content: manifest }]);
  for (const [, bucket] of detected) assert.equal(bucket.count, 0);
});

test('detectDataTypes finds a known SDK from a Groovy Gradle dependency line', () => {
  const gradle = `dependencies {\n    implementation 'com.google.firebase:firebase-analytics:21.0.0'\n}\n`;
  const detected = detectDataTypes([{ path: 'app/build.gradle', content: gradle }]);
  assert.equal(detected.get('app-activity').count, 1);
  assert.equal(detected.get('device-ids').count, 1);
});

test('detectDataTypes finds a known SDK from a Kotlin DSL Gradle dependency line', () => {
  const gradle = `dependencies {\n    implementation("com.google.firebase:firebase-crashlytics-ktx:18.0.0")\n}\n`;
  const detected = detectDataTypes([{ path: 'app/build.gradle.kts', content: gradle }]);
  assert.equal(detected.get('app-info-performance').count, 1);
});

test('detectDataTypes ignores a dependency coordinate with no known SDK', () => {
  const gradle = `implementation 'androidx.core:core-ktx:1.12.0'`;
  const detected = detectDataTypes([{ path: 'app/build.gradle', content: gradle }]);
  for (const [, bucket] of detected) assert.equal(bucket.count, 0);
});

test('examples are capped and record path/line/hint', () => {
  const manifest = Array.from({ length: 20 }, () => '<uses-permission android:name="android.permission.CAMERA" />').join('\n');
  const detected = detectDataTypes([{ path: 'AndroidManifest.xml', content: manifest }]);
  const bucket = detected.get('photos-videos');
  assert.equal(bucket.count, 20);
  assert.ok(bucket.examples.length <= 8);
  assert.equal(bucket.examples[0].path, 'AndroidManifest.xml');
  assert.equal(bucket.examples[0].line, 1);
  assert.match(bucket.examples[0].hint, /CAMERA/);
});

test('buildReport: detected and declared is "declared"', () => {
  const detected = new Map([['location', { count: 1, examples: [] }]]);
  const report = buildReport(detected, new Set(['location']));
  const loc = report.categories.find((c) => c.id === 'location');
  assert.equal(loc.status, 'declared');
  assert.equal(report.ok, true);
});

test('buildReport: detected but not declared is "undeclared" and fails ok', () => {
  const detected = new Map([['location', { count: 1, examples: [] }]]);
  const report = buildReport(detected, new Set());
  const loc = report.categories.find((c) => c.id === 'location');
  assert.equal(loc.status, 'undeclared');
  assert.equal(report.undeclaredCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport: declared but not detected is informational, does not fail ok on its own', () => {
  const detected = new Map();
  const report = buildReport(detected, new Set(['health-fitness']));
  const hf = report.categories.find((c) => c.id === 'health-fitness');
  assert.equal(hf.status, 'declared-but-not-detected');
  assert.equal(report.undeclaredCount, 0);
  assert.equal(report.ok, true);
});

test('buildReport: neither detected nor declared is "not-detected"', () => {
  const report = buildReport(new Map(), new Set());
  assert.ok(report.categories.every((c) => c.status === 'not-detected'));
});

test('buildReport: null declaredCategories means declaredProvided is false and ok is always false', () => {
  const detected = new Map();
  const report = buildReport(detected, null);
  assert.equal(report.declaredProvided, false);
  assert.equal(report.ok, false);
});

test('parseDeclaredList reads one category id per line, skipping blanks and comments', () => {
  const { categories, unknownLines } = parseDeclaredList('location\n\n# a comment\ncontacts\n');
  assert.deepEqual([...categories].sort(), ['contacts', 'location']);
  assert.deepEqual(unknownLines, []);
});

test('parseDeclaredList reports a line that is not a known category id', () => {
  const { categories, unknownLines } = parseDeclaredList('location\nnot-a-real-category\n');
  assert.deepEqual([...categories], ['location']);
  assert.deepEqual(unknownLines, ['not-a-real-category']);
});

test('suggestedAction names the category label and points at Play Console', () => {
  const text = suggestedAction('contacts');
  assert.match(text, /Contacts/);
  assert.match(text, /Play Console/);
  assert.match(text, /Data safety/);
});

test('suggestedAction returns empty string for an unknown id rather than throwing', () => {
  assert.equal(suggestedAction('not-a-category'), '');
});
