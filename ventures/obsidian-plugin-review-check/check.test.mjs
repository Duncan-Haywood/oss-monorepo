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
      id: 'word-goals', name: 'Word Goals', isDesktopOnly: false, version: '1.0.0', minAppVersion: '0.15.0',
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
      id: 'sample-plugin', name: 'Sample Plugin', isDesktopOnly: false, version: '1.0.0', minAppVersion: '0.15.0',
      description: 'This is a sample plugin.', author: 'Obsidian',
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
      id: 'word-goals', name: 'Word Goals', isDesktopOnly: false, version: '2.0.0', minAppVersion: '0.15.0',
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
      id: 'word-goals', name: 'Word Goals', isDesktopOnly: false, version: '1.0.0', minAppVersion: '0.15.0',
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

// ---- CLI (red-team 2026-11-20: 8 of 10 mutants in check.mjs's argument
// parsing and text report escaped, because no test ran the CLI) ----

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./check.mjs', import.meta.url));
const CLEAN_MANIFEST = JSON.stringify({
  id: 'word-goals', name: 'Word Goals', isDesktopOnly: false, version: '1.0.0', minAppVersion: '0.15.0',
  description: 'Does a thing.', author: 'Jane Dev',
});

function cli(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: a positional path sets the root, and --json prints the runCheck result', () => {
  const root = makeFixture({ 'manifest.json': CLEAN_MANIFEST, 'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }), 'main.js': '1;' });
  try {
    const r = cli([root, '--json']);
    assert.equal(r.code, 0, r.err);
    const json = JSON.parse(r.out);
    assert.equal(json.report.ok, true);
    assert.equal(json.manifestPath, 'manifest.json');
    assert.equal(json.scannedFileCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: --manifest reads the named file instead of the one in the tree', () => {
  const root = makeFixture({
    'manifest.json': JSON.stringify({ id: 'sample-plugin' }),
    'good/manifest.json': CLEAN_MANIFEST,
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
  });
  try {
    const r = cli([root, '--manifest', join(root, 'good/manifest.json'), '--json']);
    assert.equal(r.code, 0, r.out);
    assert.equal(JSON.parse(r.out).manifestPath, 'good/manifest.json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: --manifest or --versions with no value is a usage error, not silently ignored', () => {
  const root = makeFixture({ 'manifest.json': CLEAN_MANIFEST, 'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }) });
  try {
    for (const flag of ['--manifest', '--versions']) {
      const r = cli([root, flag]);
      assert.equal(r.code, 2, `${flag}: ${r.out}`);
      assert.match(r.err, new RegExp(`${flag} needs a file path`));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: a --manifest path that does not exist is exit 2, not a "no manifest" report', () => {
  const root = makeFixture({ 'manifest.json': CLEAN_MANIFEST });
  try {
    const r = cli([root, '--manifest', join(root, 'nope.json')]);
    assert.equal(r.code, 2);
    assert.match(r.err, /File not found: .*nope\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: a missing root is exit 2', () => {
  const r = cli([join(tmpdir(), 'obsidian-plugin-review-check-does-not-exist')]);
  assert.equal(r.code, 2);
  assert.match(r.err, /Path not found/);
});

test('runCheck: a manifest outside the root is shown by its full path, not a mangled prefix-stripped one', () => {
  const parent = mkdtempSync(join(tmpdir(), 'obsidian-plugin-review-check-'));
  const root = join(parent, 'a');
  const sibling = join(parent, 'ab');
  mkdirSync(root);
  mkdirSync(sibling);
  writeFileSync(join(sibling, 'manifest.json'), CLEAN_MANIFEST);
  try {
    const { manifestPath } = runCheck({ root, manifestOverride: join(sibling, 'manifest.json'), versionsOverride: null });
    assert.equal(manifestPath, join(sibling, 'manifest.json'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('CLI text: additional manifests are named, and listener/console lists cut at 10 with a count', () => {
  const listeners = Array.from({ length: 11 }, (_, i) => `window.addEventListener('k${i}', f);`).join('\n');
  const logs = Array.from({ length: 11 }, (_, i) => `console.log(${i});`).join('\n');
  const root = makeFixture({
    'manifest.json': CLEAN_MANIFEST,
    'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }),
    'other/manifest.json': '{}',
    'listen.js': listeners,
    'log.js': logs,
  });
  try {
    const r = cli([root]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Note: 1 additional manifest\.json file\(s\) found and not read: other\/manifest\.json/);
    const listenLines = r.out.split('\n').filter((l) => /^ {4}listen\.js:\d+/.test(l));
    assert.deepEqual(listenLines.map((l) => Number(l.match(/:(\d+)/)[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.match(r.out, /11 line\(s\) call document\/window\.addEventListener[\s\S]*\.\.\. and 1 more/);
    assert.match(r.out, /11 console\.log\(\) call\(s\) found[\s\S]*\.\.\. and 1 more/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI text: exactly 10 console.log calls print no "... and 0 more", and none prints no console section', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `console.log(${i});`).join('\n');
  const root = makeFixture({ 'manifest.json': CLEAN_MANIFEST, 'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }), 'log.js': ten });
  const none = makeFixture({ 'manifest.json': CLEAN_MANIFEST, 'versions.json': JSON.stringify({ '1.0.0': '0.15.0' }), 'main.js': '1;' });
  try {
    const r = cli([root]);
    assert.match(r.out, /10 console\.log\(\) call\(s\)/);
    assert.doesNotMatch(r.out, /and 0 more/);
    assert.doesNotMatch(cli([none]).out, /console\.log/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(none, { recursive: true, force: true });
  }
});
