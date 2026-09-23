import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTargetSdk, buildTargetSdkReport, FORM_FACTORS, formFactorById } from './target-sdk-scan.mjs';

test('detects targetSdkVersion from Groovy Gradle (space form)', () => {
  const { declarations } = detectTargetSdk([
    { path: 'app/build.gradle', content: 'android {\n    targetSdkVersion 34\n}\n' },
  ]);
  assert.deepEqual(declarations, [{ path: 'app/build.gradle', line: 2, value: 34 }]);
});

test('detects targetSdk from Kotlin DSL (= form)', () => {
  const { declarations } = detectTargetSdk([
    { path: 'app/build.gradle.kts', content: 'android {\n    defaultConfig {\n        targetSdk = 35\n    }\n}\n' },
  ]);
  assert.deepEqual(declarations, [{ path: 'app/build.gradle.kts', line: 3, value: 35 }]);
});

test('detects android:targetSdkVersion from a manifest uses-sdk tag', () => {
  const { declarations } = detectTargetSdk([
    { path: 'app/src/main/AndroidManifest.xml', content: '<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="33" />' },
  ]);
  assert.deepEqual(declarations, [{ path: 'app/src/main/AndroidManifest.xml', line: 1, value: 33 }]);
});

test('a variable or version-catalog reference is reported as unresolved, not guessed', () => {
  const { declarations, unresolvedRefs } = detectTargetSdk([
    { path: 'app/build.gradle', content: 'targetSdkVersion rootProject.ext.targetSdkVersion\n' },
  ]);
  assert.equal(declarations.length, 0);
  assert.equal(unresolvedRefs.length, 1);
  assert.equal(unresolvedRefs[0].reference, 'rootProject.ext.targetSdkVersion');
});

test('a numeric match on a line suppresses reporting that same line as unresolved', () => {
  const { declarations, unresolvedRefs } = detectTargetSdk([
    { path: 'app/build.gradle.kts', content: 'targetSdk = 36 // pinned, not from libs.versions\n' },
  ]);
  assert.equal(declarations.length, 1);
  assert.equal(unresolvedRefs.length, 0);
});

test('the highest declared value across multiple modules is what gets compared', () => {
  const detected = detectTargetSdk([
    { path: 'app/build.gradle', content: 'targetSdkVersion 33\n' },
    { path: 'wear/build.gradle', content: 'targetSdkVersion 35\n' },
  ]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.equal(report.highest, 35);
});

test('formFactorById falls back to phone-tablet for an unknown id', () => {
  assert.equal(formFactorById('made-up').id, 'phone-tablet');
  assert.equal(FORM_FACTORS.find((f) => f.id === 'phone-tablet').requiredExisting, 35);
});

test('meetsExisting/meetsNew reflect the phone/tablet floor', () => {
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: 'targetSdkVersion 34\n' }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.equal(report.meetsExisting, false, '34 is below the 35 existing-app floor');
  assert.equal(report.meetsNew, false);
});

test('a value meeting the new-app floor also meets the lower existing-app floor', () => {
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: 'targetSdkVersion 36\n' }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.equal(report.meetsExisting, true);
  assert.equal(report.meetsNew, true);
});

test('no declaration found reports highest as null and both floors unmet', () => {
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: 'compileSdk = 36\n' }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.equal(report.highest, null);
  assert.equal(report.meetsExisting, false);
  assert.equal(report.meetsNew, false);
});

test('day counts are negative once the reference date is past the deadline', () => {
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: 'targetSdkVersion 35\n' }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.ok(report.daysUntilPrimaryDeadline < 0, 'the primary 2026-08-31 deadline has already passed on 2026-09-23');
  assert.ok(report.daysUntilExtensionDeadline > 0, 'the 2026-11-01 extension deadline is still ahead on 2026-09-23');
});

test('day counts are positive well ahead of both deadlines', () => {
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: 'targetSdkVersion 35\n' }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-01-01T00:00:00Z'));
  assert.ok(report.daysUntilPrimaryDeadline > 0);
  assert.ok(report.daysUntilExtensionDeadline > report.daysUntilPrimaryDeadline);
});
