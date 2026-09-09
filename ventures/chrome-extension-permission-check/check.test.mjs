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

const MANIFEST_DECLARING_STORAGE = JSON.stringify({ manifest_version: 3, permissions: ['storage'] });

test('collectFiles finds JS/TS sources and the manifest, and skips vendored directories', () => {
  const root = makeFixture({
    'src/background.js': 'chrome.storage.local.get();',
    'manifest.json': MANIFEST_DECLARING_STORAGE,
    'node_modules/pkg/index.js': 'chrome.tabs.query({});',
    'dist/bundle.js': 'chrome.tabs.query({});',
    'src/types.ts': 'export type X = number;',
    'src/notes.txt': 'not a source file',
  });
  try {
    const { sourceFiles, manifestPaths } = collectFiles(root);
    assert.equal(sourceFiles.length, 2); // background.js, types.ts -- not node_modules or dist
    assert.ok(sourceFiles.every((p) => !p.includes('node_modules') && !p.includes('dist')));
    assert.equal(manifestPaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: storage used and declared reports ok', () => {
  const root = makeFixture({
    'background.js': 'chrome.storage.local.set({a:1});',
    'manifest.json': MANIFEST_DECLARING_STORAGE,
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.scannedFileCount, 1);
    assert.equal(result.manifestPath, 'manifest.json');
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: no manifest anywhere fails and says so', () => {
  const root = makeFixture({ 'background.js': 'chrome.storage.local.get();' });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.manifestPath, null);
    assert.equal(result.report.manifestFound, false);
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: declared-unused and detected-undeclared both fail the check', () => {
  const root = makeFixture({
    'background.js': 'chrome.tabs.query({}, () => {});', // used, not declared
    'manifest.json': JSON.stringify({ permissions: ['notifications'] }), // declared, not used
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.report.ok, false);
    assert.equal(result.report.declaredUnusedCount, 1);
    assert.equal(result.report.detectedUndeclaredCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: --manifest override is used instead of an auto-discovered manifest.json', () => {
  const root = makeFixture({
    'background.js': 'chrome.storage.local.get();',
    'manifest.json': JSON.stringify({ permissions: [] }), // would fail if read
    'alt/manifest.json': MANIFEST_DECLARING_STORAGE,
  });
  try {
    const result = runCheck({ root, manifestOverride: join(root, 'alt/manifest.json') });
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: a second manifest.json in the tree is reported, not silently merged', () => {
  const root = makeFixture({
    'manifest.json': MANIFEST_DECLARING_STORAGE,
    'fixtures/manifest.json': '{}',
    'background.js': 'chrome.storage.local.get();',
  });
  try {
    const result = runCheck({ root, manifestOverride: null });
    assert.equal(result.additionalManifestPaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
