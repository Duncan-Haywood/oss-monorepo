import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCodeownersPath, parseArgs } from './check.mjs';

test('parseArgs takes the first bare argument as the CODEOWNERS path', () => {
  assert.deepEqual(parseArgs(['some/CODEOWNERS']), { codeownersPath: 'some/CODEOWNERS', pathsFile: null });
});

test('parseArgs reads --paths as the alternative file list', () => {
  assert.deepEqual(parseArgs(['--paths', 'files.txt']), { codeownersPath: null, pathsFile: 'files.txt' });
});

test('parseArgs with no arguments auto-detects', () => {
  assert.deepEqual(parseArgs([]), { codeownersPath: null, pathsFile: null });
});

test('findCodeownersPath returns an explicit path when it exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeowners-test-'));
  const file = join(dir, 'MY_CODEOWNERS');
  writeFileSync(file, '*.js @team');
  try {
    assert.equal(findCodeownersPath(file), file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findCodeownersPath throws a clear error for a missing explicit path', () => {
  assert.throws(() => findCodeownersPath('/no/such/file/CODEOWNERS'), /no such file/);
});

test('findCodeownersPath auto-detects the first standard location present in the cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeowners-test-'));
  const original = process.cwd();
  writeFileSync(join(dir, 'CODEOWNERS'), '*.js @team');
  process.chdir(dir);
  try {
    assert.equal(findCodeownersPath(null), 'CODEOWNERS');
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findCodeownersPath throws naming the three checked locations when none exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeowners-test-'));
  const original = process.cwd();
  process.chdir(dir);
  try {
    assert.throws(() => findCodeownersPath(null), /CODEOWNERS.*\.github\/CODEOWNERS.*docs\/CODEOWNERS/);
  } finally {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});
