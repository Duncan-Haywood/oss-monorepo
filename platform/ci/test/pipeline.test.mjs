import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  VENTURE_CATALOG,
  getChangedFiles,
  resolveAffectedComponents,
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
          /^test_.*\.py$/.test(entry.name)
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

  // Test unaffected changes
  const nonVenture = resolveAffectedComponents(['docs/guide.md'], mockCatalog);
  assert.deepEqual(nonVenture, []);
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
