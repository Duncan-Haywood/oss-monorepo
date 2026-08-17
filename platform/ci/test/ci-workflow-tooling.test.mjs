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
 *
 * 2026-08-04 — this file named `.gitea/workflows/ci-cd.yml` as a constant, which
 * `docs/CONTROL-AUDIT-2026-08-04.md` finding 2 counted among four controls whose
 * entire input was one hardcoded directory. The assertions here are genuinely
 * about the workflow that *runs the suite* rather than about workflows in
 * general — a venture's build workflow does not run `scripts/test-ci.sh` and has
 * no business installing pytest or actionlint. So the fix is not a wider
 * assertion, it is a discovered subject: every tracked workflow is read, and the
 * ones that invoke the suite are the ones held to the tooling contract. That is
 * a property of a workflow's content, not of the directory it sits in, so
 * nothing is exempt by location; a venture workflow that started running the
 * suite tomorrow would be checked the same way. The empty-selection case fails
 * rather than passing over nothing.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TEST_CI = path.join(REPO_ROOT, 'scripts/test-ci.sh');

/**
 * The two places this repository keeps workflows: the monorepo's own Gitea CI,
 * and the per-venture GitHub workflows that ship inside each venture directory.
 */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures'];

/** Every tracked workflow file, read from the git index rather than a directory. */
function trackedWorkflows() {
  return execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  })
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.startsWith('.gitea/workflows/') || entry.includes('.github/workflows/'))
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort()
    .map((relative) => ({ relative, source: fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8') }));
}

const ALL_WORKFLOWS = trackedWorkflows();

/**
 * The workflows that execute `scripts/test-ci.sh`. These, and only these, owe
 * the suite its tooling — which is why the selection is by what the file runs.
 */
const SUITE_WORKFLOWS = ALL_WORKFLOWS.filter(({ source }) => /scripts\/test-ci\.sh/.test(source));

const testCiSource = fs.readFileSync(TEST_CI, 'utf8');

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
  {
    tool: 'swift',
    why: 'the Swift verifier in pipeline.mjs, which fails closed without the CLI',
    provides: /uses: swift-actions\/setup-swift@[a-f0-9]{40}/,
  },
];

test('CI Workflow Tooling - the suite is run by at least one workflow, and this test found it', () => {
  // The selection is the whole point of the widening: reading every tracked
  // workflow and keeping the ones that invoke the suite means a suite runner
  // added anywhere — including inside a venture — is held to the contract
  // below. An empty selection is a failure, not zero findings: it is what a
  // renamed entrypoint or a narrowed pathspec looks like from in here.
  assert.ok(
    ALL_WORKFLOWS.length >= 5,
    `expected the repository's tracked workflows to be found, got ${ALL_WORKFLOWS.length}`
  );
  assert.ok(
    ALL_WORKFLOWS.some(({ relative }) => relative.startsWith('ventures/')),
    'no venture workflow was enumerated — the pathspec narrowed back to .gitea/workflows'
  );
  assert.ok(
    SUITE_WORKFLOWS.length > 0,
    'no tracked workflow runs scripts/test-ci.sh. Either the repository-wide gate suite ' +
      'is not executed by CI at all, or the entrypoint was renamed and this contract now ' +
      'checks nothing.'
  );
});

test('CI Workflow Tooling - the pipeline installs what every gate needs', () => {
  const missing = [];
  for (const { relative, source } of SUITE_WORKFLOWS) {
    for (const entry of REQUIRED_TOOLING) {
      if (!entry.provides.test(source)) missing.push(`${relative}: ${entry.tool} (${entry.why})`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `a workflow runs scripts/test-ci.sh but does not install:\n  ${missing.join('\n  ')}\n` +
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
  // Scoped to the workflows that run the suite, and the scope is earned rather
  // than assumed: the binary in question is the actionlint release this file's
  // own REQUIRED_TOOLING map declares, fetched by version into the job that
  // then lints these workflows. Naming a fixed variable and a fixed release URL
  // is only meaningful against that download.
  //
  // What this deliberately does NOT claim is that no other workflow executes
  // unverified remote code. Three do — the `curl … | bash` vendor installers in
  // ventures/local-site-studio's cursor and grok scheduled workflows — and they
  // are a different assertion with a different remedy (those installers publish
  // no checksum and no version), recorded in docs/CONTROL-AUDIT-2026-08-04.md
  // rather than silently covered by a rule shaped for actionlint.
  for (const { relative, source } of SUITE_WORKFLOWS) {
    assert.match(
      source,
      /ACTIONLINT_SHA256_LINUX_AMD64: [a-f0-9]{64}/,
      `${relative}: the actionlint download must pin a sha256`
    );
    assert.match(
      source,
      /sha256sum -c -/,
      `${relative}: the pinned actionlint sha256 must actually be verified, not merely recorded`
    );
  }
});

/**
 * The package names a component's own files import, restricted to the ones it
 * declares as dependencies.
 *
 * This is the evidence half of `componentNeedsInstall` below. A component can
 * declare dependencies and never load one — `scripts/ci/coverage_ratchet.py`
 * documents that exact case and refuses to diagnose on the declaration alone —
 * so the declaration is necessary and not sufficient. What makes it sufficient
 * is a file under the component that actually imports one of them, which is a
 * property this test can read rather than assume.
 */
function importedDeclaredDependencies(componentPath, commandBlock = '') {
  const manifestPath = path.join(REPO_ROOT, componentPath, 'package.json');
  if (!fs.existsSync(manifestPath)) return [];

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return []; // An unreadable manifest is the component's problem to report.
  }
  const declared = new Set([
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ]);
  if (declared.size === 0) return [];

  const files = execFileSync('git', ['ls-files', '-z', '--', componentPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  })
    .split('\0')
    .filter(Boolean)
    .filter((entry) => /\.(m|c)?tsx?$|\.(m|c)?jsx?$/.test(entry));

  // `from 'x'`, `require('x')` and `import('x')`, in both quote styles. A
  // specifier is a bare one when it starts with neither `.` nor `/`; `node:`
  // builtins are bare but resolve without an install, and are excluded by the
  // intersection with `declared` anyway.
  const specifier = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;
  const used = new Set();

  // A dependency can also be loaded without ever being imported by a file: the
  // coverage command itself names it, as `--import tsx` and `npx vitest` do.
  // Keeping this makes the rule a strict superset of the flag list it replaced,
  // so nothing the old form caught can slip through the new one.
  for (const word of commandBlock.matchAll(/^\s*-\s*(\S+)\s*$/gm)) {
    if (declared.has(word[1])) used.add(word[1]);
  }
  for (const relative of files) {
    let source;
    try {
      source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(specifier)) {
      const raw = match[1];
      if (raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('node:')) continue;
      // `vitest/config` and `@scope/pkg/sub` are the package plus a subpath.
      const parts = raw.split('/');
      const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (declared.has(name)) used.add(name);
    }
  }
  return [...used].sort();
}

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
  //
  // 2026-08-05 — the rule below used to be a list of flags: a component was
  // held to need an install when its coverage command carried `--import`,
  // `--loader` or `--require`, or when its first word was `npx`. That is a
  // guess at the cause dressed as a test of it, and it was wrong for two of the
  // five components enrolled here. `ai-first-markets` runs
  // `node --experimental-strip-types` and `photo-editing-docs-site` runs a bare
  // `node --test`; neither matches a flag, and both die on a clean runner —
  // one on `jose`, the other on `parse5`. Measured, not argued: deleting *both*
  // of their `npm ci` steps from ci-cd.yml left this file 7/7 green, while
  // `scripts/ci/coverage_ratchet.py` reported `component-dependencies-missing`
  // for all five.
  //
  // The replacement asks the question the gate actually cares about — does this
  // component load a package that has to be installed first — and it asks it
  // the same way `coverage_ratchet.py` does, so there is one definition of
  // "needs an install" in the repository rather than two that disagree. The
  // declaration alone is deliberately not enough: that script's
  // `declares_uninstalled_dependencies` docstring records a component that
  // declares dependencies and tests entirely on the standard library, so the
  // second half is a file under the component importing one of them. Both
  // halves are read, neither is assumed.
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
    if (!componentPath) continue;
    const imported = importedDeclaredDependencies(componentPath, block);
    if (imported.length > 0) {
      needsInstall.push({ id, componentPath, imported });
    }
  }

  // The enumeration must not be able to go quiet. An empty selection here is
  // indistinguishable from "nothing needs installing" at the assertion below,
  // and it is what a broken manifest read, a narrowed `git ls-files` walk or a
  // specifier regex that stopped matching all look like from in here.
  assert.ok(
    needsInstall.length > 0,
    'no coverage component was found loading a declared dependency. Either the baseline is ' +
      'empty or the detection above stopped working; both make this test vacuous.'
  );

  // Scoped to the suite runners, and again earned per assertion: the coverage
  // ratchet is a gate inside scripts/test-ci.sh, so only a workflow that runs
  // that script has to install what the ratchet's coverage commands load. The
  // component paths below are monorepo-relative, which is what a suite runner
  // checks out; a venture workflow checks out only its own directory and could
  // not satisfy this pattern even in principle.
  const missing = needsInstall.filter(({ componentPath }) => {
    // An install step is a `working-directory: <path>` paired with an npm ci.
    const stepPattern = new RegExp(
      `working-directory:\\s*${componentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*run:\\s*npm ci`
    );
    return !SUITE_WORKFLOWS.some(({ source }) => stepPattern.test(source));
  });

  assert.deepEqual(
    missing.map((entry) => `${entry.id} (${entry.componentPath}) loads ${entry.imported.join(', ')}`),
    [],
    'these coverage components load packages out of node_modules, but no workflow that runs ' +
      'scripts/test-ci.sh installs their dependencies. The ratchet gate will fail with ' +
      'component-dependencies-missing on a clean runner.'
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
  //
  // `env` was added here on 2026-08-17 and removed again: no gate uses it as its
  // command word, and admitting it means a future `run_ci_test "x" env FOO=1
  // sometool` records `env` as the invoked tool while `sometool` becomes
  // invisible to this check. The guarantee list is what the runner provides, not
  // a place to park wrappers.
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
