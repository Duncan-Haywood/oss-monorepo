import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, runCheck } from './check.mjs';

// mkdtempSync(os.tmpdir()) is unusable in some sandboxes that block writes
// outside the repository -- fixtures live under this venture's own
// directory instead, and every test removes its fixture in a `finally`.
const FIXTURE_PARENT = join(dirname(fileURLToPath(import.meta.url)), '.test-fixtures');
mkdirSync(FIXTURE_PARENT, { recursive: true });

function makeFixture(files) {
  const root = mkdtempSync(join(FIXTURE_PARENT, 'fixture-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const MANIFEST_WITH_LOCATION = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
</manifest>
`;

test('collectFiles finds AndroidManifest.xml and build.gradle(.kts), skipping build/.gradle dirs', () => {
  const root = makeFixture({
    'app/src/main/AndroidManifest.xml': MANIFEST_WITH_LOCATION,
    'app/build.gradle': "implementation 'com.google.firebase:firebase-analytics:21.0.0'",
    'app/build.gradle.kts': 'dependencies {}',
    'app/build/generated/AndroidManifest.xml': MANIFEST_WITH_LOCATION,
    '.gradle/caches/build.gradle': 'noise',
    'app/src/main/notes.txt': 'not scannable',
  });
  try {
    const { scannablePaths } = collectFiles(root);
    assert.equal(scannablePaths.length, 3);
    assert.ok(!scannablePaths.some((p) => p.includes(join('app', 'build', 'generated'))));
    assert.ok(!scannablePaths.some((p) => p.includes(`${join('.gradle', 'caches')}`)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: detected category in the declared file reports ok', () => {
  const root = makeFixture({
    'app/src/main/AndroidManifest.xml': MANIFEST_WITH_LOCATION,
    'declared.txt': 'location\n',
  });
  try {
    const result = runCheck({ root, declaredOverride: join(root, 'declared.txt') });
    assert.equal(result.scannedFileCount, 1);
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: detected category with no declared file at all fails and says so', () => {
  const root = makeFixture({ 'app/src/main/AndroidManifest.xml': MANIFEST_WITH_LOCATION });
  try {
    const result = runCheck({ root, declaredOverride: null });
    assert.equal(result.declaredSourcePath, null);
    assert.equal(result.report.declaredProvided, false);
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: category used but not in the declared list is undeclared', () => {
  const root = makeFixture({
    'app/src/main/AndroidManifest.xml': MANIFEST_WITH_LOCATION,
    'declared.txt': 'contacts\n', // declares the wrong category
  });
  try {
    const result = runCheck({ root, declaredOverride: join(root, 'declared.txt') });
    const loc = result.report.categories.find((c) => c.id === 'location');
    assert.equal(loc.status, 'undeclared');
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck reports an unrecognised line in the declared file rather than silently dropping it', () => {
  const root = makeFixture({
    'app/src/main/AndroidManifest.xml': MANIFEST_WITH_LOCATION,
    'declared.txt': 'location\nnonsense-category\n',
  });
  try {
    const result = runCheck({ root, declaredOverride: join(root, 'declared.txt') });
    assert.deepEqual(result.unknownDeclaredLines, ['nonsense-category']);
    assert.equal(result.report.ok, true); // location was still recognised
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck scans a Gradle-declared SDK alongside manifest permissions', () => {
  const root = makeFixture({
    'app/src/main/AndroidManifest.xml': '<manifest xmlns:android="http://schemas.android.com/apk/res/android"></manifest>',
    'app/build.gradle': "dependencies { implementation 'com.google.firebase:firebase-crashlytics:18.0.0' }",
    'declared.txt': 'app-info-performance\n',
  });
  try {
    const result = runCheck({ root, declaredOverride: join(root, 'declared.txt') });
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
