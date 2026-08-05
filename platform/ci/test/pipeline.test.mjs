import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  VENTURE_CATALOG,
  getChangedFiles,
  resolveAffectedComponents,
  runDaggerContainerizedPipeline,
  runSecuritySuite,
  verifyNodeHost,
  verifyPnpmHost,
  verifyPythonHost,
  verifySwiftHost,
  verifyTerraformHost,
  // `main` is deliberately not imported: it ends in process.exit, so it is
  // exercised as a spawned process below, where the exit code — the part CI
  // reads — is observable. It was imported here and never used, which read as
  // coverage of an entrypoint that had none.
} from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

test('CI Pipeline Catalog - Directory Integrity', () => {
  assert.ok(Array.isArray(VENTURE_CATALOG), 'Venture catalog should be an array');
  assert.ok(VENTURE_CATALOG.length >= 5, 'Venture catalog should contain at least 5 registered ventures');

  for (const component of VENTURE_CATALOG) {
    assert.ok(component.id, `Component missing ID: ${JSON.stringify(component)}`);
    assert.ok(component.dir, `Component ${component.id} missing dir`);
    assert.ok(component.type, `Component ${component.id} missing type`);

    const fullPath = path.join(REPO_ROOT, component.dir);
    assert.ok(
      fs.existsSync(fullPath),
      `Registered component directory does not exist on filesystem: ${component.dir}`
    );
  }

  assert.equal(
    new Set(VENTURE_CATALOG.map((component) => component.id)).size,
    VENTURE_CATALOG.length,
    'Component IDs must be unique',
  );
  assert.equal(
    new Set(VENTURE_CATALOG.map((component) => component.dir)).size,
    VENTURE_CATALOG.length,
    'Component directories must be unique',
  );
});

/**
 * A venture whose tests exist but which is absent from the catalog is never
 * marked affected by resolveAffectedComponents, so its tests never run. That is
 * indistinguishable from a green build, which is why it is asserted here.
 */
test('CI Pipeline Catalog - every venture with tests is registered and runs them', () => {
  const venturesRoot = path.join(REPO_ROOT, 'ventures');
  const registeredDirs = new Set(VENTURE_CATALOG.map((c) => c.dir));

  const hasTests = (dir) => {
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (['node_modules', '.next', 'dist', 'build', '__pycache__', '.git'].includes(entry.name)) {
            continue;
          }
          stack.push(path.join(current, entry.name));
        } else if (
          /\.test\.(ts|tsx|js|mjs)$/.test(entry.name) ||
          /^test_.*\.py$/.test(entry.name) ||
          (entry.name.endsWith('.swift') && current.includes(`${path.sep}Tests`))
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const unregistered = fs
    .readdirSync(venturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: `ventures/${entry.name}` }))
    .filter((venture) => !registeredDirs.has(venture.dir))
    .filter((venture) => hasTests(path.join(REPO_ROOT, venture.dir)))
    .map((venture) => venture.name);

  assert.deepEqual(
    unregistered,
    [],
    `Ventures ship tests but are absent from VENTURE_CATALOG, so their tests never run in CI: ${unregistered.join(', ')}`
  );

  // A Node component must actually run its tests, not merely be registered.
  for (const component of VENTURE_CATALOG) {
    if (component.type !== 'node' || !component.dir.startsWith('ventures/')) continue;

    const packageJsonPath = path.join(REPO_ROOT, component.packageDir || component.dir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) continue;

    const scripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts || {};

    // Fail-closed contract: the catalog may not claim a script the package lacks.
    for (const script of component.scripts || []) {
      assert.ok(
        scripts[script],
        `${component.id}: catalog claims "${script}" but package.json does not define it, so it is skipped`
      );
    }

    if (scripts.test) {
      assert.ok(
        (component.scripts || []).includes('test'),
        `${component.id}: defines a test script but the catalog does not run it`
      );
    }
  }
});

test('CI Pipeline Affected Path Resolver - Swift venture changes select Range Coach', () => {
  assert.deepEqual(
    resolveAffectedComponents(['ventures/range-coach/Sources/RangeCoachCore/SwingAnalysis.swift']),
    ['range-coach'],
  );
});

/**
 * Venture-level registration is not enough. A venture registered as a Python
 * component can contain a Node package (photo-editing/docs-site did) whose test
 * script nothing ever invokes, which again looks exactly like a green build.
 * Every package that defines tests must be covered by an entry that runs them.
 */
test('CI Pipeline Catalog - every Node package defining tests is run by some entry', () => {
  // Only git-tracked manifests count. Build output such as `.open-next/` and
  // vendored `node_modules` contain package.json files that are not ours to
  // verify, and enumerating via git keeps that exclusion self-maintaining.
  const packageDirs = execFileSync('git', ['ls-files', '--', 'ventures'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  })
    .split('\n')
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.join(REPO_ROOT, path.dirname(file)));

  // An entry covers a package when it points at that exact package directory.
  const coveredDirs = new Map();
  for (const component of VENTURE_CATALOG) {
    const dir = path.join(REPO_ROOT, component.packageDir || component.dir);
    coveredDirs.set(dir, component);
  }

  const uncovered = [];
  for (const dir of packageDirs) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const testScript = (manifest.scripts || {}).test;
    if (!testScript) continue;

    const component = coveredDirs.get(dir);
    const relative = path.relative(REPO_ROOT, dir);

    if (!component) {
      // A workspace member is covered by its root running a recursive script.
      const coveredByWorkspaceRoot = [...coveredDirs.entries()].some(
        ([coveredDir, entry]) => dir.startsWith(coveredDir + path.sep) && entry.type === 'pnpm',
      );
      if (!coveredByWorkspaceRoot) uncovered.push(relative);
      continue;
    }

    if (component.type === 'node' && !(component.scripts || []).includes('test')) {
      uncovered.push(relative);
    }
  }

  assert.deepEqual(
    uncovered,
    [],
    `Node packages define a "test" script that no catalog entry runs: ${uncovered.join(', ')}`,
  );
});

test('CI Pipeline Affected Path Resolver - Venture Path Matching', () => {
  const mockCatalog = [
    { id: 'app1', dir: 'ventures/app1', type: 'node' },
    { id: 'app2', dir: 'ventures/app2', type: 'python' },
  ];

  // Test single app change
  const singleApp = resolveAffectedComponents(['ventures/app1/src/index.ts'], mockCatalog);
  assert.deepEqual(singleApp, ['app1']);

  // Test multi-app changes
  const multiApp = resolveAffectedComponents(
    ['ventures/app1/package.json', 'ventures/app2/main.py'],
    mockCatalog
  );
  assert.deepEqual(multiApp.sort(), ['app1', 'app2'].sort());

  // Test unmapped changes fall back to all components (fail closed)
  const nonVenture = resolveAffectedComponents(['docs/guide.md'], mockCatalog);
  assert.deepEqual(nonVenture, ['app1', 'app2']);

  // Test .nvmrc change forces full run
  const nvmrcChange = resolveAffectedComponents(['.nvmrc'], mockCatalog);
  assert.deepEqual(nvmrcChange, ['app1', 'app2']);
});

/**
 * The single-file assertions above cannot tell the two rules apart.
 *
 * `['.nvmrc']` alone selects everything under either rule: as a declared global
 * path, or as a changeset that matched no component and hit the fail-closed
 * fallback. Deleting `.nvmrc` and `platform/` from the global list leaves every
 * single-file case green — verified by mutation, both were removed and the
 * suite stayed at 26/26.
 *
 * A mixed changeset is what separates them. One venture plus a repo-wide file
 * *does* match a component, so the fallback never fires, and a global path that
 * is not on the list narrows the run to that one venture — leaving the
 * repo-wide change unverified everywhere else. `.nvmrc` is the sharpest case:
 * the node-version contract calls it the single source of truth for the version
 * every Node component builds on.
 */
test('CI Pipeline Affected Path Resolver - repo-wide paths stay global alongside a venture change', () => {
  const mockCatalog = [
    { id: 'app1', dir: 'ventures/app1', type: 'node' },
    { id: 'app2', dir: 'ventures/app2', type: 'python' },
  ];
  const oneVenture = 'ventures/app1/src/index.ts';

  const repoWide = [
    '.nvmrc',
    'platform/k8s/marisstella-homepage/deployment.yaml',
    'platform/coverage-baseline.yaml',
    'platform/exception-register.yaml',
    'platform/image-tag-exceptions.yaml',
    'platform/route-posture-registry.yaml',
    'tests/test_coverage_ratchet.py',
    'pytest.ini',
    'requirements-ci.txt',
    'package.json',
    'scripts/ci/verify-component.sh',
    '.github/workflows/ci.yml',
    '.gitea/workflows/ci-cd.yml',
  ];

  for (const file of repoWide) {
    assert.deepEqual(
      resolveAffectedComponents([oneVenture, file], mockCatalog).sort(),
      ['app1', 'app2'],
      `${file} changed alongside a venture must still select every component, not just the venture`,
    );
  }
});

test('CI Pipeline Affected Path Resolver - Monorepo Infrastructure Global Trigger', () => {
  const mockCatalog = [
    { id: 'app1', dir: 'ventures/app1', type: 'node' },
    { id: 'app2', dir: 'ventures/app2', type: 'python' },
  ];

  // Global script changes force full run
  const scriptChange = resolveAffectedComponents(['scripts/verify-all.sh'], mockCatalog);
  assert.deepEqual(scriptChange, ['app1', 'app2']);

  // GitHub workflows force full run
  const workflowChange = resolveAffectedComponents(['.github/workflows/ci-cd.yml'], mockCatalog);
  assert.deepEqual(workflowChange, ['app1', 'app2']);

  // CI platform changes force full run
  const ciChange = resolveAffectedComponents(['platform/ci/src/pipeline.mjs'], mockCatalog);
  assert.deepEqual(ciChange, ['app1', 'app2']);
});

test('CI Pipeline Git Changed Files Function', () => {
  const files = getChangedFiles();
  // Should either return an array of strings or null (if no git diff base)
  if (files !== null) {
    assert.ok(Array.isArray(files));
  }
});

test('CI Pipeline Host Verification - Python Host Verifier', () => {
  const missingComponent = { id: 'invalid-python', name: 'Invalid Python', dir: 'ventures/non-existent' };
  assert.equal(verifyPythonHost(missingComponent, REPO_ROOT), false);

  const missingTestDirComponent = { id: 'missing-test-dir', name: 'Missing Test Dir', dir: 'platform/ci', testDir: 'non-existent-tests' };
  assert.equal(verifyPythonHost(missingTestDirComponent, REPO_ROOT), false);
});

test('CI Pipeline Host Verification - Node Host Verifier', () => {
  const missingComponent = { id: 'invalid-node', name: 'Invalid Node', dir: 'ventures/non-existent' };
  assert.equal(verifyNodeHost(missingComponent, REPO_ROOT), false);

  const badScriptComponent = {
    id: 'bad-script-node',
    name: 'Bad Script Node',
    dir: 'portfolio/marisstella-homepage',
    scripts: ['non-existent-script'],
  };
  assert.equal(verifyNodeHost(badScriptComponent, REPO_ROOT), false);
});

test('CI Pipeline Host Verification - Security Suite', () => {
  const origEnv = process.env.SECURITY_SCAN_ALLOW_OFFLINE;
  process.env.SECURITY_SCAN_ALLOW_OFFLINE = '1';
  try {
    const res = runSecuritySuite(REPO_ROOT);
    assert.equal(typeof res, 'boolean');
  } finally {
    if (origEnv === undefined) {
      delete process.env.SECURITY_SCAN_ALLOW_OFFLINE;
    } else {
      process.env.SECURITY_SCAN_ALLOW_OFFLINE = origEnv;
    }
  }
});

test('CI Pipeline Host Verification - Pnpm Host Verifier', () => {
  const missingComponent = { id: 'invalid-pnpm', name: 'Invalid Pnpm', dir: 'ventures/non-existent' };
  assert.equal(verifyPnpmHost(missingComponent, REPO_ROOT), false);
});

test('CI Pipeline Host Verification - Terraform Host Verifier', () => {
  const missingComponent = { id: 'tf-test', name: 'Terraform Test', dir: 'platform/terraform' };
  const result = verifyTerraformHost(missingComponent, REPO_ROOT);
  assert.equal(typeof result, 'boolean');
});

test('CI Pipeline Git Changed Files - GITHUB_BASE_REF and Git Diff Error Catch', () => {
  const origRef = process.env.GITHUB_BASE_REF;
  process.env.GITHUB_BASE_REF = 'main';
  try {
    const files = getChangedFiles();
    assert.ok(files === null || Array.isArray(files));
  } finally {
    if (origRef === undefined) {
      delete process.env.GITHUB_BASE_REF;
    } else {
      process.env.GITHUB_BASE_REF = origRef;
    }
  }

  // Test git diff failure catch returning null
  const invalidFiles = getChangedFiles('NON_EXISTENT_GIT_REF_123456');
  assert.equal(invalidFiles, null);
});

test('CI Pipeline Affected Path Resolver - Handles empty, null, .gitea, package.json, README.md', () => {
  const mockCatalog = [{ id: 'app1', dir: 'ventures/app1' }];

  assert.deepEqual(resolveAffectedComponents(null, mockCatalog), ['app1']);
  assert.deepEqual(resolveAffectedComponents([], mockCatalog), ['app1']);
  assert.deepEqual(resolveAffectedComponents(['.gitea/workflows/ci.yml'], mockCatalog), ['app1']);
  assert.deepEqual(resolveAffectedComponents(['package.json'], mockCatalog), ['app1']);
  assert.deepEqual(resolveAffectedComponents(['README.md'], mockCatalog), ['app1']);
});

/**
 * Selecting nothing must not be reported as verifying everything.
 *
 * resolveAffectedComponents fails closed to the whole catalog, so detection can
 * no longer produce an empty selection — but main() accepts one directly.
 * `--venture <typo>` reached the host loop, whose `if (!component) continue`
 * skipped the unknown id, so the run installed nothing, ran no suite, counted
 * no failure and exited 0 printing ALL CI VERIFICATION CHECKS PASSED. Observed
 * before the fix, on this repository, with `--venture nonexistent-venture`.
 *
 * Spawned rather than called: main() ends in process.exit, and the exit code is
 * the part CI reads.
 */
test('CI Pipeline main() - a selection that verifies nothing is not a pass', () => {
  const pipeline = path.join(__dirname, '../src/pipeline.mjs');

  let status = 0;
  let output = '';
  try {
    output = execFileSync(
      process.execPath,
      [pipeline, '--venture', 'nonexistent-venture', '--skip-security'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    status = err.status;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }

  assert.equal(status, 1, 'an unknown component id must exit non-zero');
  assert.ok(
    !output.includes('ALL CI VERIFICATION CHECKS PASSED'),
    'a run that verified no component must not report every check as passed',
  );
  assert.match(
    output,
    /nonexistent-venture/,
    'the failure must name the id nothing verified',
  );
});

/**
 * The guard above must reject an unverifiable selection, not every selection.
 * marisstella-homepage is the cheapest real component in the catalog: its
 * `test` script is a node --test suite that runs in well under a second.
 */
test('CI Pipeline main() - a real component still verifies and passes', () => {
  const pipeline = path.join(__dirname, '../src/pipeline.mjs');

  const output = execFileSync(
    process.execPath,
    [pipeline, '--venture', 'marisstella-homepage', '--skip-security'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  assert.ok(
    output.includes('ALL CI VERIFICATION CHECKS PASSED'),
    'a component that verifies cleanly must still pass',
  );
  assert.ok(
    !output.includes('Not registered in VENTURE_CATALOG'),
    'a registered component must not trip the unknown-id guard',
  );
});

test('CI Pipeline Dagger Containerized Fallback', async () => {
  const mockCatalog = [{ id: 'mat-470-real-analysis', name: 'MAT-470', dir: 'ventures/mat-470-real-analysis', type: 'python' }];
  const res = await runDaggerContainerizedPipeline(['mat-470-real-analysis'], mockCatalog, REPO_ROOT);
  // Returns null when container daemon unavailable or fallback triggered
  assert.ok(res === null || res === true || res === false);
});




