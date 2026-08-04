import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const NVMRC = path.join(REPO_ROOT, '.nvmrc');

/**
 * The suite is verified on the Node major CI pins, and nothing said so.
 *
 * Measured 2026-08-02: running the suite with `/usr/local/bin` ahead on PATH —
 * the usual way to reach this host's python3.11 — silently selects the
 * **node v18.16.0** sitting in that same directory, ahead of the real Node. It
 * turned three gates red in ways that each read as a genuine repository
 * failure: the Pairwise vitest run died with `SyntaxError: ... 'node:util' does
 * not provide an export named 'styleText'`, and the coverage ratchet reported
 * `coverage-command-failed` for `print-atelier` (`node: bad option: --import`)
 * and `platform-ci` (`--experimental-test-coverage cannot be used with
 * --test`). Nothing was broken. The same commit is green on the pinned Node 22.
 *
 * Note what the failures do *not* say: none of them names the interpreter, so
 * the obvious reading is a broken venture, and the diagnosis is paid for again
 * by whoever runs the suite next.
 *
 * `.nvmrc` is the single source of truth. These tests exist so it cannot become
 * decorative: a version recorded in a file nothing reads would drift away from
 * the six workflow pins within a release or two, and then it would be worse
 * than absent, because it would read as authoritative while being wrong.
 */

const readNvmrc = () => fs.readFileSync(NVMRC, 'utf8').trim();

const workflowFiles = () =>
  fs
    .readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(WORKFLOW_DIR, name));

// `node-version: 22`, `node-version: "22"`, `node-version: '22.x'`
const NODE_VERSION_PIN = /^\s*node-version:\s*['"]?([^'"\s#]+)['"]?/gm;

const majorOf = (version) => String(version).trim().replace(/^v/, '').split('.')[0];

test('the repository pins a Node major for local runs', () => {
  assert.ok(fs.existsSync(NVMRC), '.nvmrc must exist so `nvm use` selects the version CI runs');

  const pinned = readNvmrc();
  assert.match(
    pinned,
    /^\d+(\.\d+)*$/,
    `.nvmrc must hold a plain version, got ${JSON.stringify(pinned)}`,
  );
});

test('every workflow Node pin matches .nvmrc', () => {
  const expected = majorOf(readNvmrc());
  const mismatches = [];
  let pinCount = 0;

  for (const file of workflowFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(NODE_VERSION_PIN)) {
      pinCount += 1;
      const found = majorOf(match[1]);
      if (found !== expected) {
        mismatches.push(`${path.relative(REPO_ROOT, file)}: node-version ${match[1]}`);
      }
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `these workflows pin a different Node major than .nvmrc (${expected}):\n  ${mismatches.join('\n  ')}`,
  );

  // A regex that stopped matching would make the check above vacuously true.
  assert.ok(
    pinCount > 0,
    'no node-version pin was found in any workflow — the pin syntax changed and this contract stopped reading it',
  );
});

test('the verification entrypoint refuses to run on the wrong Node major', () => {
  const testCi = fs.readFileSync(path.join(REPO_ROOT, 'scripts/test-ci.sh'), 'utf8');

  // Deliberately the path expression, not the bare string: the guard's own
  // error text names `.nvmrc` in prose, so matching that would pass even after
  // the code was repointed at a different file. Confirmed by mutation —
  // swapping the read to `${REPO_ROOT}/.node-pin` survived the looser check.
  assert.match(
    testCi,
    /\$\{REPO_ROOT\}\/\.nvmrc/,
    'scripts/test-ci.sh must read ${REPO_ROOT}/.nvmrc rather than hard-coding the expected version',
  );
  assert.match(
    testCi,
    /ALLOW_NODE_VERSION_MISMATCH/,
    'the version guard must offer a named opt-out, so deliberately testing another major stays possible',
  );
});
