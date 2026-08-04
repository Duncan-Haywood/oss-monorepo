import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * `scripts/test-ci.sh` is the repository-wide gate suite and
 * `.gitea/workflows/ci-cd.yml` is the only workflow that runs it. They drifted
 * completely apart: the workflow installed Node and nothing else, while the
 * suite had grown twelve gates needing pytest, PyYAML, an installed
 * node_modules for the Pairwise venture, ShellCheck, actionlint and Terraform.
 *
 * The drift was invisible in both directions. Six gates failed on a clean
 * runner, two more reported nothing at all because a missing linter was a
 * notice rather than a failure, and the Terraform verifier returned true
 * without the CLI. Nothing compared the two files, so adding a gate and
 * forgetting its tooling produced no signal anywhere.
 *
 * This is the same class of defect as verify-contract.test.mjs covers between
 * the catalog and the venture declarations, one level up: a gate that cannot
 * execute where it is supposed to execute.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TEST_CI = path.join(REPO_ROOT, 'scripts/test-ci.sh');
const WORKFLOW = path.join(REPO_ROOT, '.gitea/workflows/ci-cd.yml');

const testCiSource = fs.readFileSync(TEST_CI, 'utf8');
const workflowSource = fs.readFileSync(WORKFLOW, 'utf8');

/**
 * Every external tool a gate in test-ci.sh shells out to, and the evidence that
 * ci-cd.yml provides it. `provides` is matched against the workflow source.
 *
 * Adding an entry here is deliberate work: it is the moment someone states how
 * CI will supply a new dependency. The reverse direction is covered by the
 * `no undeclared tool` test below, which fails when test-ci.sh starts invoking
 * something absent from this map.
 */
const REQUIRED_TOOLING = [
  {
    tool: 'node',
    why: 'Dagger CI engine unit tests (node --test platform/ci/test/*.test.mjs)',
    provides: /uses: actions\/setup-node@[a-f0-9]{40}/,
  },
  {
    tool: 'npm',
    why: 'Pairwise unit suite runs vitest from ventures/quick-pick-survey node_modules',
    provides: /npm ci\b/,
  },
  {
    tool: 'python3',
    why: 'portfolio router suite, allocation report, venture contract validator, exception register audit, kill-criteria stopping rule ratchet',
    provides: /uses: actions\/setup-python@[a-f0-9]{40}/,
  },
  {
    tool: 'pytest',
    why: 'repository-wide Python suite',
    provides: /pip install .*-r requirements-ci\.txt/,
  },
  {
    tool: 'shellcheck',
    why: 'shell script static analysis gate',
    provides: /apt-get install .*\bshellcheck\b/,
  },
  {
    tool: 'actionlint',
    why: 'workflow linting gate',
    provides: /releases\/download\/v\$\{ACTIONLINT_VERSION\}/,
  },
  {
    tool: 'terraform',
    why: 'the IaC verifier in pipeline.mjs, which returns true without the CLI',
    provides: /uses: hashicorp\/setup-terraform@[a-f0-9]{40}/,
  },
];

test('CI Workflow Tooling - the pipeline installs what every gate needs', () => {
  const missing = REQUIRED_TOOLING.filter((entry) => !entry.provides.test(workflowSource)).map(
    (entry) => `${entry.tool} (${entry.why})`
  );

  assert.deepEqual(
    missing,
    [],
    `.gitea/workflows/ci-cd.yml runs scripts/test-ci.sh but does not install:\n  ${missing.join('\n  ')}\n` +
      'A gate whose tool is absent either fails the run or, worse, reports a pass for a check that never executed.'
  );
});

test('CI Workflow Tooling - the Python gate dependencies are pinned in a file CI installs', () => {
  const requirements = path.join(REPO_ROOT, 'requirements-ci.txt');
  assert.ok(
    fs.existsSync(requirements),
    'requirements-ci.txt is referenced by .gitea/workflows/ci-cd.yml and must exist'
  );

  const declared = fs.readFileSync(requirements, 'utf8');
  // Four gates import yaml and one needs pytest. Both were absent from CI.
  assert.match(declared, /^pytest[><=~]/m, 'requirements-ci.txt must pin pytest');
  assert.match(declared, /^PyYAML[><=~]/mi, 'requirements-ci.txt must pin PyYAML');
});

test('CI Workflow Tooling - a missing linter fails CI instead of silently skipping', () => {
  // The original form was `if command -v shellcheck; then ... else echo skip; fi`
  // with FAILURES untouched on the else branch, so absence and success shared an
  // exit code. Both linters must now route through the CI-aware guard.
  assert.match(
    testCiSource,
    /have_linter\(\)/,
    'test-ci.sh must define the have_linter guard rather than bare `command -v` skips'
  );
  assert.match(
    testCiSource,
    /if \[ -n "\$\{CI:-\}" \]; then[\s\S]{0,400}?FAILURES=\$\(\(FAILURES \+ 1\)\)/,
    'have_linter must increment FAILURES when a linter is absent under CI'
  );

  for (const tool of ['shellcheck', 'actionlint']) {
    assert.match(
      testCiSource,
      new RegExp(`if have_linter ${tool}; then`),
      `${tool} must be gated by have_linter so its absence fails CI`
    );
  }
});

test('CI Workflow Tooling - network-fetched binaries are checksum verified', () => {
  // actionlint is downloaded into the job that then lints these workflows.
  assert.match(
    workflowSource,
    /ACTIONLINT_SHA256_LINUX_AMD64: [a-f0-9]{64}/,
    'the actionlint download must pin a sha256'
  );
  assert.match(
    workflowSource,
    /sha256sum -c -/,
    'the pinned actionlint sha256 must actually be verified, not merely recorded'
  );
});

test('CI Workflow Tooling - coverage components needing node_modules get them installed', () => {
  // The Coverage Baseline Ratchet gate runs each component's own coverage
  // command. A command that loads a runtime hook — `node --import tsx` — needs
  // that package resolved from the component's node_modules, which is
  // gitignored everywhere in this repository. The gate reports
  // `coverage-tool-missing` and fails, but only on a clean runner, so the gap
  // is invisible locally where node_modules already exist.
  //
  // Parsed with a regex rather than a YAML library on purpose: platform/ci has
  // no dependencies, and adding one to a package whose own tests gate the
  // pipeline is a worse trade than parsing a file this simple.
  const baselinePath = path.join(REPO_ROOT, 'platform/coverage-baseline.yaml');
  if (!fs.existsSync(baselinePath)) {
    return; // The ratchet gate is not yet present; nothing to hold.
  }

  const baseline = fs.readFileSync(baselinePath, 'utf8');
  const blocks = baseline.split(/^ {2}- id:/m).slice(1);
  assert.ok(blocks.length > 0, 'expected to parse at least one component from coverage-baseline.yaml');

  const needsInstall = [];
  for (const block of blocks) {
    const id = block.split('\n', 1)[0].trim();
    const componentPath = block.match(/^\s*path:\s*(\S+)/m)?.[1];
    const usesLoader = /^\s*-\s*--(import|loader|require)\s*$/m.test(block);
    if (componentPath && usesLoader) {
      needsInstall.push({ id, componentPath });
    }
  }

  const missing = needsInstall.filter(({ componentPath }) => {
    // An install step is a `working-directory: <path>` paired with an npm ci.
    const stepPattern = new RegExp(
      `working-directory:\\s*${componentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*run:\\s*npm ci`
    );
    return !stepPattern.test(workflowSource);
  });

  assert.deepEqual(
    missing.map((entry) => `${entry.id} (${entry.componentPath})`),
    [],
    'these coverage components load a runtime hook from node_modules, but ci-cd.yml never installs their dependencies. ' +
      'The ratchet gate will fail with coverage-tool-missing on a clean runner.'
  );
});

test('CI Workflow Tooling - no gate invokes a tool the workflow was never told about', () => {
  // Parse the command word of each `run_ci_test "<name>" <cmd> ...` line. This
  // is what catches the drift going forward: a new gate shelling out to a tool
  // nobody added to REQUIRED_TOOLING fails here rather than on a red runner.
  const invoked = new Set();
  let gateCount = 0;
  for (const match of testCiSource.matchAll(/^\s*run_ci_test\s+"[^"]*"\s+(\S+)/gm)) {
    invoked.add(path.basename(match[1]));
    gateCount += 1;
  }

  // `bash` is guaranteed by the runner; the suite is a bash script.
  const guaranteed = new Set(['bash']);
  const declared = new Set(REQUIRED_TOOLING.map((entry) => entry.tool));

  const undeclared = [...invoked].filter((tool) => !guaranteed.has(tool) && !declared.has(tool));

  assert.deepEqual(
    undeclared,
    [],
    `scripts/test-ci.sh invokes ${undeclared.join(', ')}, which no entry in REQUIRED_TOOLING covers. ` +
      'Add the tool here and install it in .gitea/workflows/ci-cd.yml, or the gate will not run in CI.'
  );

  // Sanity: the parser must actually be finding gates. If the `run_ci_test`
  // call shape ever changes, `invoked` goes empty and the assertion above
  // passes vacuously — the exact failure mode this whole file exists to catch.
  assert.ok(
    gateCount >= 10,
    `expected to parse at least 10 gates from test-ci.sh, found ${gateCount}. ` +
      'If run_ci_test changed shape, update the parser above — an empty parse makes this test vacuous.'
  );
});
