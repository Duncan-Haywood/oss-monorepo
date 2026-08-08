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

/**
 * Gates a runner registers more than once, in either direction.
 *
 * Two branches each added the entry a gate was missing and the 2026-08-04c
 * merge kept both, so `scripts/test-ci.sh` announced 24 gates over 22 distinct
 * commands. Neither shape is caught by anything else here: the command runs, it
 * can fail, and something invokes it — the checks above are all satisfied. What
 * is wrong is the arithmetic. A repeated command reads as breadth in the PASSED
 * list while only costing runner time, and a repeated *label* is worse: two
 * different commands reporting under one name means a failure is attributed to
 * whichever the reader assumes, and the second registration can be deleted as a
 * duplicate while taking a real gate with it.
 *
 * Deliberately literal, like the detectors above: it reads `run_ci_test` lines
 * as text rather than pretending to parse bash. Commands are compared with
 * runs of whitespace collapsed, so reformatting one entry does not hide it.
 */
export function duplicateGateRegistrations(script) {
  const byCommand = new Map();
  const byLabel = new Map();

  script.split('\n').forEach((text, index) => {
    const match = /^\s*run_ci_test\s+"([^"]+)"\s+(\S.*?)\s*$/.exec(text);
    if (!match) return;
    const [, label, rawCommand] = match;
    const command = rawCommand.replace(/\s+/g, ' ');
    const entry = { line: index + 1, label, command };
    if (!byCommand.has(command)) byCommand.set(command, []);
    byCommand.get(command).push(entry);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(entry);
  });

  const findings = [];
  for (const [command, entries] of byCommand) {
    if (entries.length < 2) continue;
    findings.push({
      kind: 'command',
      key: command,
      lines: entries.map((entry) => entry.line),
      labels: entries.map((entry) => entry.label),
    });
  }
  for (const [label, entries] of byLabel) {
    if (entries.length < 2) continue;
    // Already reported as a repeated command; one finding per pair, not two.
    if (new Set(entries.map((entry) => entry.command)).size === 1) continue;
    findings.push({
      kind: 'label',
      key: label,
      lines: entries.map((entry) => entry.line),
      labels: entries.map((entry) => entry.command),
    });
  }
  return findings.sort((a, b) => a.lines[0] - b.lines[0]);
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

/**
 * A scanner whose *unit tests* run is not a scanner that has looked at this
 * repository, and the two are easy to mistake for each other in a PASSED list.
 *
 * `scripts/security/scan-repository.sh` refuses tracked secrets, private-key
 * material, literal Terraform credentials and unresolved merge markers. Until
 * 2026-08-08 the only entry naming it in `scripts/test-ci.sh` was
 * `test-scan-repository.sh` — its logic tests, run against `mktemp` fixture
 * repositories. The scanner itself was invoked only by
 * `.gitea/workflows/security.yml` (after a push) and the Dagger security suite,
 * so on the path a local merge takes, nothing asked it about the tree.
 *
 * On 2026-08-08 commit 30f9ab40 merged `agent/gate-wiring-and-sec-ids` with the
 * conflict unresolved, leaving `<<<<<<< HEAD` / `>>>>>>>` in
 * `platform/ci/test/security-audit-log-integrity.test.mjs`. That file stopped
 * parsing, so nine security-audit-log checks silently executed none of
 * themselves; the markers survived six commits. The scanner detects this exact
 * shape and would have said so in one line.
 *
 * The orphan check above cannot see this, because it only considers files named
 * `test-*.sh`. This is the same question asked of the control rather than of its
 * test.
 */
test('Gate wiring - the repository policy scan is run against this repository', () => {
  const runner = fs.readFileSync(path.join(REPO_ROOT, 'scripts/test-ci.sh'), 'utf8');

  const registrations = runner
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => /^\s*run_ci_test\s+"[^"]+"/.test(line))
    .filter((line) => line.includes('scripts/security/scan-repository.sh'));

  assert.equal(
    registrations.length,
    1,
    '`scripts/test-ci.sh` must register `scripts/security/scan-repository.sh` as exactly one ' +
      'named gate. Running only `test-scan-repository.sh` exercises the scanner against ' +
      'temporary fixtures and leaves this repository unscanned on the path a merge takes — ' +
      'which is how unresolved conflict markers reached `main` at 30f9ab40 and stayed for six ' +
      `commits. Found ${registrations.length} registration(s).`
  );

  // The default report argument is `security-scan-report.md`, which is tracked.
  // A gate that rewrites a tracked file as a side effect of measuring is how
  // `pytest` came to mutate SECURITY_ROADMAP.md, and it makes the working tree
  // dirty for whoever runs the suite next.
  assert.ok(
    !/run_ci_test\s+"[^"]+"\s+bash\s+"\$\{REPO_ROOT\}\/scripts\/security\/scan-repository\.sh"\s*$/.test(
      registrations[0]
    ),
    'the repository policy scan must be given an explicit report path outside the tree; with no ' +
      'argument it writes the tracked `security-scan-report.md` every time the suite runs'
  );
});

/**
 * The third half: a runner that registers the same gate twice is counting its
 * own coverage wrong. Found on the 2026-08-04c merge, where `test-ci.sh` ran
 * the scanner contract twice under one name and the component-verification
 * contract twice under two.
 */
test('Gate wiring - no runner registers the same gate twice', () => {
  const duplicates = [];
  for (const relative of shellScripts()) {
    const script = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    for (const finding of duplicateGateRegistrations(script)) {
      duplicates.push(
        finding.kind === 'command'
          ? `${relative}:${finding.lines.join(',')} — '${finding.key}' is registered ` +
              `${finding.lines.length} times, as ${finding.labels.map((l) => `"${l}"`).join(' and ')}`
          : `${relative}:${finding.lines.join(',')} — the name "${finding.key}" is used for ` +
              `${finding.lines.length} different commands, so a failure names the wrong gate`
      );
    }
  }

  assert.deepEqual(
    duplicates,
    [],
    'gates registered more than once:\n' + duplicates.map((line) => `  - ${line}`).join('\n')
  );
});

test('Gate wiring - the duplicate detector still detects', () => {
  const sameCommandTwice = [
    'run_ci_test "Scanner Contract" bash "${REPO_ROOT}/scripts/security/test-security-scan.sh"',
    'run_ci_test "Scanner Contract" bash "${REPO_ROOT}/scripts/security/test-security-scan.sh"',
  ].join('\n');
  assert.equal(duplicateGateRegistrations(sameCommandTwice).length, 1);
  assert.equal(duplicateGateRegistrations(sameCommandTwice)[0].kind, 'command');

  // The shape the merge actually produced: one command, two names. A reader
  // scanning the PASSED list sees two controls.
  const sameCommandTwoNames = [
    'run_ci_test "Component Verification Contract" bash "${REPO_ROOT}/scripts/ci/test-verify-component.sh"',
    'run_ci_test "Component Verification Contract Tests" bash "${REPO_ROOT}/scripts/ci/test-verify-component.sh"',
  ].join('\n');
  assert.equal(duplicateGateRegistrations(sameCommandTwoNames).length, 1);
  assert.equal(duplicateGateRegistrations(sameCommandTwoNames)[0].kind, 'command');

  // Reformatting must not hide it.
  const respaced = [
    'run_ci_test "A" bash "${REPO_ROOT}/x.sh"',
    'run_ci_test "B" bash    "${REPO_ROOT}/x.sh"',
  ].join('\n');
  assert.equal(duplicateGateRegistrations(respaced).length, 1);

  // One name over two different commands: a failure names the wrong gate.
  const sameLabelTwoCommands = [
    'run_ci_test "Contract" bash "${REPO_ROOT}/a.sh"',
    'run_ci_test "Contract" bash "${REPO_ROOT}/b.sh"',
  ].join('\n');
  assert.equal(duplicateGateRegistrations(sameLabelTwoCommands).length, 1);
  assert.equal(duplicateGateRegistrations(sameLabelTwoCommands)[0].kind, 'label');

  // Distinct gates, and a commented-out line, are not findings.
  const clean = [
    'run_ci_test "A" bash "${REPO_ROOT}/a.sh"',
    'run_ci_test "B" bash "${REPO_ROOT}/b.sh"',
    '# run_ci_test "A" bash "${REPO_ROOT}/a.sh"',
    'run_ci_test "C" python3 "${REPO_ROOT}/c.py"',
  ].join('\n');
  assert.deepEqual(duplicateGateRegistrations(clean), []);

  // A file with no registrations at all must not report a finding — the
  // detector reading nothing looks identical to a clean runner otherwise.
  assert.deepEqual(duplicateGateRegistrations('echo hello\n'), []);
});
