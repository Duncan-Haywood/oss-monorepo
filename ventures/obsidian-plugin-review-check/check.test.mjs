import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFiles, runCheck } from './check.mjs';

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'obsidian-plugin-review-check-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('collectFiles: finds manifest.json, versions.json, and source, skipping node_modules/.git/.obsidian', () => {
  const root = makeFixture({
    'manifest.json': '{}',
    'versions.json': '{}',
    'main.js': 'export default 1;',
    'src/settings.ts': 'export const x = 1;',
    'types.d.ts': 'declare const x: number;',
    'node_modules/dep/index.js': 'module.exports = 1;',
    '.git/HEAD': 'ref: refs/heads/main',
    '.obsidian/workspace.json': '{}',
  });
  try {
    const { sourceFiles, manifestPaths, versionsPaths } = collectFiles(root);
    assert.equal(manifestPaths.length, 1);
    assert.equal(versionsPaths.length, 1);
    // main.js and src/settings.ts, but not the .d.ts, node_modules, or .obsidian.
    assert.equal(sourceFiles.length, 2);
    assert.ok(sourceFiles.every((p) => !p.includes('node_modules')));
    assert.ok(sourceFiles.every((p) => !p.endsWith('.d.ts')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: a clean plugin reports ok', () => {
  const root = makeFixture({
    'manifest.json': JSON.stringify({
      id: 'my-plugin', name: 'My Plugin', version: '1.0.0', minAppVersion: '0.15.0',
      description: 'Does a thing.', author: 'Jane Dev',
    }),
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
    'main.js': "this.registerDomEvent(document, 'keydown', fn);",
  });
  try {
    const { report, scannedFileCount } = runCheck({ root, manifestOverride: null, versionsOverride: null });
    assert.equal(report.ok, true);
    assert.equal(scannedFileCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: an unmodified sample plugin is not ok', () => {
  const root = makeFixture({
    'manifest.json': JSON.stringify({
      id: 'sample-plugin', name: 'Sample Plugin', version: '1.0.0', minAppVersion: '0.15.0',
      description: 'This is a sample plugin.', author: 'Your Name',
    }),
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
    'main.js': 'export default class {}',
  });
  try {
    const { report } = runCheck({ root, manifestOverride: null, versionsOverride: null });
    assert.equal(report.ok, false);
    assert.equal(report.samplePluginDefaults.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: a missing versions.json entry is not ok', () => {
  const root = makeFixture({
    'manifest.json': JSON.stringify({
      id: 'my-plugin', name: 'My Plugin', version: '2.0.0', minAppVersion: '0.15.0',
      description: 'x', author: 'Jane',
    }),
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
    'main.js': 'export default class {}',
  });
  try {
    const { report } = runCheck({ root, manifestOverride: null, versionsOverride: null });
    assert.equal(report.ok, false);
    assert.equal(report.versionsEntry.status, 'missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: an innerHTML assignment in source is not ok', () => {
  const root = makeFixture({
    'manifest.json': JSON.stringify({
      id: 'my-plugin', name: 'My Plugin', version: '1.0.0', minAppVersion: '0.15.0',
      description: 'x', author: 'Jane',
    }),
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
    'main.js': 'el.innerHTML = untrustedValue;',
  });
  try {
    const { report } = runCheck({ root, manifestOverride: null, versionsOverride: null });
    assert.equal(report.ok, false);
    assert.equal(report.unsafeDom.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: no manifest.json at all is reported and not ok', () => {
  const root = makeFixture({ 'main.js': 'export default 1;' });
  try {
    const { report, manifestPath } = runCheck({ root, manifestOverride: null, versionsOverride: null });
    assert.equal(manifestPath, null);
    assert.equal(report.manifestFound, false);
    assert.equal(report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
