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

const GOOD_README = '=== X ===\nStable tag: 1.0.0\nLicense: GPLv2\nLicense URI: https://x\n';
const GOOD_HEADER = '<?php\n/**\n * Plugin Name: X\n * Version: 1.0.0\n */\n';

test('collectFiles finds PHP sources and readme.txt, and skips vendored directories', () => {
  const root = makeFixture({
    'example.php': GOOD_HEADER,
    'readme.txt': GOOD_README,
    'vendor/pkg/index.php': '<?php echo $_GET["x"];',
    'node_modules/pkg/index.php': '<?php echo $_GET["x"];',
    'includes/notes.txt': 'not the plugin readme',
  });
  try {
    const { sourceFiles, readmePaths } = collectFiles(root);
    assert.equal(sourceFiles.length, 1); // example.php only -- not vendor or node_modules
    assert.ok(sourceFiles.every((p) => !p.includes('vendor') && !p.includes('node_modules')));
    assert.equal(readmePaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: a clean plugin reports ok', () => {
  const root = makeFixture({ 'example.php': GOOD_HEADER, 'readme.txt': GOOD_README });
  try {
    const result = runCheck({ root, readmeOverride: null, pluginFileOverride: null });
    assert.equal(result.scannedFileCount, 1);
    assert.equal(result.readmePath, 'readme.txt');
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: no readme.txt anywhere fails and says so', () => {
  const root = makeFixture({ 'example.php': GOOD_HEADER });
  try {
    const result = runCheck({ root, readmeOverride: null, pluginFileOverride: null });
    assert.equal(result.readmePath, null);
    assert.equal(result.report.readmeFound, false);
    assert.equal(result.report.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: Stable tag mismatch, unescaped output, and missing nonce check are all reported together', () => {
  const root = makeFixture({
    'readme.txt': '=== X ===\nStable tag: 0.9.0\nLicense: GPLv2\nLicense URI: https://x\n',
    'example.php': [
      '<?php',
      '/**',
      ' * Plugin Name: X',
      ' * Version: 1.0.0',
      ' */',
      "echo 'Hi ' . $_GET['name'];",
      "if ( isset( $_POST['save'] ) ) { do_save(); }",
      '',
    ].join('\n'),
  });
  try {
    const result = runCheck({ root, readmeOverride: null, pluginFileOverride: null });
    assert.equal(result.report.ok, false);
    assert.equal(result.report.stableTagStatus, 'mismatch');
    assert.equal(result.report.unescapedOutput.length, 1);
    assert.equal(result.report.missingNonceChecks.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: --readme and --plugin-file overrides are used instead of auto-discovery', () => {
  const root = makeFixture({
    'readme.txt': '=== bad ===\n', // would fail required-field checks if read
    'alt/readme.txt': GOOD_README,
    'example.php': GOOD_HEADER,
  });
  try {
    const result = runCheck({
      root,
      readmeOverride: join(root, 'alt/readme.txt'),
      pluginFileOverride: join(root, 'example.php'),
    });
    assert.equal(result.report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runCheck: a second readme.txt in the tree is reported, not silently merged', () => {
  const root = makeFixture({
    'readme.txt': GOOD_README,
    'fixtures/readme.txt': '=== other ===\n',
    'example.php': GOOD_HEADER,
  });
  try {
    const result = runCheck({ root, readmeOverride: null, pluginFileOverride: null });
    assert.equal(result.additionalReadmePaths.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
