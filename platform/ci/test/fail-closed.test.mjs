import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  runSecuritySuite,
  verifyNodeHost,
  verifyPnpmHost,
  verifyPythonHost,
} from '../src/pipeline.mjs';

/**
 * Every verifier in the pipeline had the same hole: when the thing it was asked
 * to verify was not there, it printed a skip notice and returned true. A
 * catalog entry pointing at a moved directory, a renamed scanner script, a test
 * folder that never got created — each produced a green run that checked
 * nothing, and none of them were distinguishable from a real pass in the log.
 *
 * The file already stated the correct rule for one case: "Silently skipping a
 * catalog-claimed script turns a stale registry entry into a green run that
 * verified nothing." These tests hold the other cases to it.
 *
 * Fixtures are empty temp directories, so nothing here shells out to npm,
 * pytest or a scanner — the assertion is only about what happens before any
 * command would run.
 */

function fixtureRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `pipeline-fail-closed-${name}-`));
  test.after?.(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** These verifiers narrate to stdout; the assertions are the return values. */
function quietly(fn) {
  const { log, warn, error } = console;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

test('Fail Closed - a Node entry with no package.json fails rather than skips', () => {
  const root = fixtureRoot('node');
  const component = { id: 'ghost-node', name: 'Ghost Node', dir: 'ventures/ghost', scripts: ['test'] };

  assert.equal(quietly(() => verifyNodeHost(component, root)), false);

  // Present directory, still no package.json — the catalog is what is wrong.
  fs.mkdirSync(path.join(root, 'ventures/ghost'), { recursive: true });
  assert.equal(quietly(() => verifyNodeHost(component, root)), false);
});

test('Fail Closed - a pnpm entry with no package.json fails rather than skips', () => {
  const root = fixtureRoot('pnpm');
  const component = { id: 'ghost-pnpm', name: 'Ghost Pnpm', dir: 'ventures/ghost', type: 'pnpm' };

  assert.equal(quietly(() => verifyPnpmHost(component, root)), false);
});

test('Fail Closed - a Python entry with no component directory fails', () => {
  const root = fixtureRoot('python-dir');
  const component = { id: 'ghost-py', name: 'Ghost Python', dir: 'ventures/ghost', testDir: 'tests' };

  assert.equal(quietly(() => verifyPythonHost(component, root)), false);
});

test('Fail Closed - a Python entry whose test directory is gone fails, not passes', () => {
  const root = fixtureRoot('python-tests');
  // The component exists; only its declared suite is missing. This is the case
  // that used to print PASSED without executing a single test.
  fs.mkdirSync(path.join(root, 'ventures/ghost'), { recursive: true });
  const component = { id: 'ghost-py', name: 'Ghost Python', dir: 'ventures/ghost', testDir: 'tests' };

  assert.equal(quietly(() => verifyPythonHost(component, root)), false);
});

test('Fail Closed - a security suite with no scanner scripts fails', () => {
  const root = fixtureRoot('security');

  // Renaming or deleting either scanner used to leave this returning true
  // having scanned nothing. Both are tracked repository fixtures; absence is a
  // broken checkout, not an optional tool.
  assert.equal(quietly(() => runSecuritySuite(root)), false);
});
