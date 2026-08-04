import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Every other control in this directory asks whether a gate is declared, or
 * reachable, or capable of failing. This one asks the question underneath all
 * three: does anything actually run it.
 *
 * Two live defects prompted it.
 *
 * `scripts/verify-all.sh` — the top-level entrypoint, and what `dev-verify.sh`
 * and the `ci-cd.yml` verify job both exec into — guarded its first step with
 *
 *     if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then
 *       bash "${REPO_ROOT}/scripts/test-ci.sh"
 *     fi
 *
 * with no `else`. Rename or delete `test-ci.sh` and all fourteen repository-wide
 * gates it registers — including every `platform/ci/test/*.test.mjs` in this
 * directory — silently do not run, and the script proceeds to the engine and
 * exits 0. The `pipeline.mjs` block immediately below it has the correct
 * `else … exit 1`, so the two halves of the same entrypoint disagreed about
 * whether a missing runner is a failure. This is exactly the shape
 * `fail-closed.test.mjs` exists to kill, sitting in the script that invokes it.
 *
 * `scripts/ci/test-verify-component.sh` — the contract test for the shared
 * fail-closed gate every venture workflow shells into, asserting that an unknown
 * component exits non-zero and that no `|| true` sits on an install or quality
 * gate — was referenced by nothing. Not `test-ci.sh`, not `verify-all.sh`, not
 * any workflow. It had been written, committed, reviewed and never executed.
 *
 * Both are the same failure: a file that reads as coverage from the outside and
 * runs nothing. The detectors below are deliberately literal — they read text,
 * not bash semantics — and each is mutation-checked against snippets known to be
 * safe and known to be holes, so a detector that stops detecting fails here too.
 */

const RUNNERS = ['bash', 'sh', 'node', 'python3', 'python'];

/**
 * Find `if [ -f "<path>" ]; then … fi` blocks that invoke <path> as a runner and
 * do not exit non-zero when the file is absent.
 *
 * Nesting is tracked by counting `if`/`fi` at statement position, which is
 * enough for the scripts in this repository and does not pretend to parse bash.
 * A guard whose else-branch exits non-zero is fine; so is a guard around
 * something that is not executed.
 */
export function skippableRunnerGuards(script) {
  const lines = script.split('\n');
  const holes = [];

  for (let i = 0; i < lines.length; i += 1) {
    const guard = /^\s*if\s+\[\s+-f\s+"([^"]+)"\s+\]\s*;\s*then\s*$/.exec(lines[i]);
    if (!guard) continue;
    const guardedPath = guard[1];

    let depth = 1;
    let elseAt = -1;
    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (/^\s*if\s+/.test(line)) depth += 1;
      else if (/^\s*fi\s*$/.test(line)) {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      } else if (depth === 1 && /^\s*else\s*$/.test(line)) {
        elseAt = j;
      }
    }
    if (end === -1) continue;

    const thenBody = lines.slice(i + 1, elseAt === -1 ? end : elseAt).join('\n');
    const elseBody = elseAt === -1 ? '' : lines.slice(elseAt + 1, end).join('\n');

    // Only guards around something the script actually executes matter. A guard
    // around an optional config file is not a gate.
    const invoked = RUNNERS.some((runner) =>
      new RegExp(`(^|\\s)${runner}\\s[^\\n]*${escapeForRegExp(guardedPath)}`).test(thenBody)
    );
    if (!invoked) continue;

    // `exit 0` in the else branch is the same hole spelled differently.
    const failsClosed = /\bexit\s+([1-9]\d*)\b/.test(elseBody);
    if (!failsClosed) {
      holes.push({ line: i + 1, path: guardedPath });
    }
  }

  return holes;
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellScripts() {
  const roots = ['scripts', 'scripts/ci', 'scripts/security'];
  const found = [];
  for (const dir of roots) {
    const absolute = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(absolute)) continue;
    for (const entry of fs.readdirSync(absolute)) {
      if (entry.endsWith('.sh')) found.push(path.posix.join(dir, entry));
    }
  }
  return found.sort();
}

test('Gate wiring - a missing runner is a failure, not a skipped step', () => {
  const holes = [];
  for (const relative of shellScripts()) {
    const script = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    for (const { line, path: guarded } of skippableRunnerGuards(script)) {
      holes.push(
        `${relative}:${line} — runs '${guarded}' when present and continues silently when absent; ` +
          'add an else branch that exits non-zero'
      );
    }
  }

  assert.deepEqual(
    holes,
    [],
    'entrypoints that skip a gate instead of failing when its runner is gone:\n' +
      holes.map((line) => `  - ${line}`).join('\n')
  );
});

test('Gate wiring - the guard detector still detects', () => {
  const hole = [
    'if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then',
    '  bash "${REPO_ROOT}/scripts/test-ci.sh"',
    'fi',
  ].join('\n');
  assert.equal(skippableRunnerGuards(hole).length, 1, 'a bare guard around a runner is a hole');

  const exitZeroElse = [
    'if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then',
    '  bash "${REPO_ROOT}/scripts/test-ci.sh"',
    'else',
    '  echo "not found"',
    '  exit 0',
    'fi',
  ].join('\n');
  assert.equal(
    skippableRunnerGuards(exitZeroElse).length,
    1,
    'an else branch that exits 0 is the same hole spelled differently'
  );

  const failsClosed = [
    'if [ -f "${REPO_ROOT}/platform/ci/src/pipeline.mjs" ]; then',
    '  node "${REPO_ROOT}/platform/ci/src/pipeline.mjs" "$@"',
    'else',
    '  echo "engine missing"',
    '  exit 1',
    'fi',
  ].join('\n');
  assert.deepEqual(skippableRunnerGuards(failsClosed), [], 'an else that exits non-zero is correct');

  const notExecuted = [
    'if [ -f "${REPO_ROOT}/.env.local" ]; then',
    '  echo "using local overrides"',
    'fi',
  ].join('\n');
  assert.deepEqual(
    skippableRunnerGuards(notExecuted),
    [],
    'a guard around a file the script never runs is not a gate'
  );

  const nested = [
    'if [ -f "${REPO_ROOT}/scripts/test-ci.sh" ]; then',
    '  if [ -n "${CI:-}" ]; then',
    '    echo ci',
    '  else',
    '    echo local',
    '  fi',
    '  bash "${REPO_ROOT}/scripts/test-ci.sh"',
    'fi',
  ].join('\n');
  assert.equal(
    skippableRunnerGuards(nested).length,
    1,
    "a nested if/else must not be mistaken for the guard's own else branch"
  );
});

/**
 * The second half: a `test-*.sh` that no runner names is a suite that never
 * runs. `scripts/ci/test-verify-component.sh` was one for its whole life.
 */
test('Gate wiring - every test script under scripts/ is wired to a runner', () => {
  const runnerText = [
    'scripts/test-ci.sh',
    'scripts/verify-all.sh',
    ...fs
      .readdirSync(path.join(REPO_ROOT, '.gitea/workflows'))
      .filter((entry) => entry.endsWith('.yml'))
      .map((entry) => path.posix.join('.gitea/workflows', entry)),
  ]
    .filter((relative) => fs.existsSync(path.join(REPO_ROOT, relative)))
    .map((relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'))
    .join('\n');

  const orphans = shellScripts()
    .filter((relative) => path.basename(relative).startsWith('test-'))
    // test-ci.sh is the runner itself; verify-all.sh and ci-cd.yml invoke it.
    .filter((relative) => relative !== 'scripts/test-ci.sh')
    .filter((relative) => !runnerText.includes(path.basename(relative)))
    .map((relative) => `${relative} — named by no runner or workflow, so it has never executed`);

  assert.deepEqual(
    orphans,
    [],
    'test suites that nothing runs:\n' + orphans.map((line) => `  - ${line}`).join('\n')
  );
});
