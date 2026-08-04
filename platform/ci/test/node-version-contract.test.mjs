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
 *
 * 2026-08-04 — "the six workflow pins" was the whole population this file could
 * see, because it listed `.gitea/workflows` and nothing else.
 * `docs/CONTROL-AUDIT-2026-08-04.md` finding 2 measured the rest: 15 tracked
 * workflow files under `ventures/*/.github/workflows/`, four of which pinned
 * Node 20 while the repository pinned 22 — print-atelier's CI among them, which
 * therefore built that venture on a major nothing else in the repository runs.
 *
 * The collection is now every tracked workflow. The *comparison* is scoped, and
 * this is the part that is not a directory exemption: a venture that ships its
 * own `.nvmrc` is its own source of truth, so its workflows are compared against
 * that file rather than against the monorepo's. A venture with no `.nvmrc` of
 * its own inherits the repository pin, because it is built by the monorepo
 * pipeline on exactly that interpreter.
 */

const readNvmrc = () => fs.readFileSync(NVMRC, 'utf8').trim();

/**
 * The two places this repository keeps workflows: the monorepo's own Gitea CI,
 * and the per-venture GitHub workflows that ship inside each venture directory.
 * Enumerated from git so a new venture's workflows are covered on commit rather
 * than when somebody remembers to extend a list here.
 */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures/*/.github/workflows'];

const workflowFiles = () =>
  execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
  })
    .split('\0')
    .filter(Boolean)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((relative) => path.join(REPO_ROOT, relative));

/**
 * The `.nvmrc` a workflow is answerable to: the venture's own if it ships one,
 * otherwise the repository's. Returned as a path so a failure can name the file
 * the reader has to go and change.
 */
function nvmrcFor(absoluteWorkflowPath) {
  const relative = path.relative(REPO_ROOT, absoluteWorkflowPath).split(path.sep);
  if (relative[0] === 'ventures' && relative[1]) {
    const ventureNvmrc = path.join(REPO_ROOT, 'ventures', relative[1], '.nvmrc');
    if (fs.existsSync(ventureNvmrc)) return ventureNvmrc;
  }
  return NVMRC;
}

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
  const mismatches = [];
  let pinCount = 0;
  const files = workflowFiles();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const nvmrc = nvmrcFor(file);
    const expected = majorOf(fs.readFileSync(nvmrc, 'utf8').trim());
    for (const match of source.matchAll(NODE_VERSION_PIN)) {
      pinCount += 1;
      const found = majorOf(match[1]);
      if (found !== expected) {
        mismatches.push(
          `${path.relative(REPO_ROOT, file)}: node-version ${match[1]}, but ` +
            `${path.relative(REPO_ROOT, nvmrc)} pins ${expected}`,
        );
      }
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `these workflows pin a different Node major than the .nvmrc that governs them:\n  ${mismatches.join('\n  ')}`,
  );

  // A regex that stopped matching would make the check above vacuously true.
  assert.ok(
    pinCount > 0,
    'no node-version pin was found in any workflow — the pin syntax changed and this contract stopped reading it',
  );

  // The collection has to keep containing both halves of its subject. Until
  // 2026-08-04 this test read `.gitea/workflows` only and was green with four
  // venture workflows pinning a Node major the repository does not run.
  for (const root of ['.gitea/workflows/', 'ventures/']) {
    assert.ok(
      files.some((file) => path.relative(REPO_ROOT, file).startsWith(root)),
      `no workflow under '${root}' reached this contract — the collection narrowed`,
    );
  }
});

test('a workflow that defers to node-version-file names a file that exists', () => {
  // `node-version-file:` is the other way to select an interpreter, and it is
  // the escape hatch from the pin check above: a workflow using it declares no
  // `node-version:` at all, so it contributes nothing to that comparison. The
  // file it names has to resolve, and has to resolve to the same major, or the
  // workflow silently selects whatever the runner defaults to.
  const problems = [];

  for (const file of workflowFiles()) {
    const relativeWorkflow = path.relative(REPO_ROOT, file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^\s*node-version-file:\s*['"]?([^'"\s#]+)['"]?/gm)) {
      // The action resolves the path against the checkout root, which for a
      // venture's own GitHub repository is that venture's directory here.
      const parts = relativeWorkflow.split(path.sep);
      const checkoutRoot =
        parts[0] === 'ventures' && parts[1] ? path.join(REPO_ROOT, 'ventures', parts[1]) : REPO_ROOT;
      const referenced = path.join(checkoutRoot, match[1]);
      if (!fs.existsSync(referenced)) {
        problems.push(`${relativeWorkflow}: node-version-file ${match[1]} does not exist at ${path.relative(REPO_ROOT, referenced)}`);
        continue;
      }
      const found = majorOf(fs.readFileSync(referenced, 'utf8').trim());
      const expected = majorOf(fs.readFileSync(nvmrcFor(file), 'utf8').trim());
      if (found !== expected) {
        problems.push(
          `${relativeWorkflow}: node-version-file ${match[1]} pins ${found}, ` +
            `but ${path.relative(REPO_ROOT, nvmrcFor(file))} pins ${expected}`,
        );
      }
    }
  }

  assert.deepEqual(problems, [], `node-version-file references that do not hold:\n  ${problems.join('\n  ')}`);
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
