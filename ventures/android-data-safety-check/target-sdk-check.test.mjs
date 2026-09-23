import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runTargetSdkCheck } from './target-sdk-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function withTempProject(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'target-sdk-check-'));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const full = join(dir, relPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('runTargetSdkCheck finds a Gradle-declared targetSdkVersion below the floor', () => {
  withTempProject({ 'app/build.gradle': 'android { targetSdkVersion 33 }\n' }, (dir) => {
    const result = runTargetSdkCheck({ root: dir, formFactorId: 'phone-tablet', today: new Date('2026-09-23T00:00:00Z') });
    assert.equal(result.report.highest, 33);
    assert.equal(result.report.meetsExisting, false);
  });
});

test('runTargetSdkCheck reports meetsExisting true at exactly the floor', () => {
  withTempProject({ 'app/build.gradle.kts': 'targetSdk = 35\n' }, (dir) => {
    const result = runTargetSdkCheck({ root: dir, formFactorId: 'phone-tablet', today: new Date('2026-09-23T00:00:00Z') });
    assert.equal(result.report.meetsExisting, true);
    assert.equal(result.report.meetsNew, false, '35 meets the existing-app floor but not the new-app floor of 36');
  });
});

test('a project with no scannable files reports highest as null', () => {
  withTempProject({ 'README.md': 'no android files here\n' }, (dir) => {
    const result = runTargetSdkCheck({ root: dir, formFactorId: 'phone-tablet', today: new Date('2026-09-23T00:00:00Z') });
    assert.equal(result.scannedFileCount, 0);
    assert.equal(result.report.highest, null);
  });
});

test('CLI exit code is 0 when the existing-app floor is met', () => {
  withTempProject({ 'app/build.gradle': 'targetSdkVersion 36\n' }, (dir) => {
    execFileSync('node', [join(HERE, 'target-sdk-check.mjs'), dir], { encoding: 'utf8' });
  });
});

test('CLI exit code is 1 when the existing-app floor is not met', () => {
  withTempProject({ 'app/build.gradle': 'targetSdkVersion 30\n' }, (dir) => {
    assert.throws(() => execFileSync('node', [join(HERE, 'target-sdk-check.mjs'), dir], { encoding: 'utf8' }));
  });
});

test('CLI --list-form-factors exits 0 and lists phone-tablet', () => {
  const out = execFileSync('node', [join(HERE, 'target-sdk-check.mjs'), '--list-form-factors'], { encoding: 'utf8' });
  assert.match(out, /phone-tablet/);
});

test('CLI --json output is valid JSON containing the report', () => {
  withTempProject({ 'app/build.gradle': 'targetSdkVersion 36\n' }, (dir) => {
    const out = execFileSync('node', [join(HERE, 'target-sdk-check.mjs'), dir, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.report.highest, 36);
  });
});

test('CLI on a missing path exits 2', () => {
  assert.throws(() => execFileSync('node', [join(HERE, 'target-sdk-check.mjs'), '/does/not/exist'], { encoding: 'utf8' }));
});
