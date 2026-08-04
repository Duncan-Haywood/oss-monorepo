import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG, verifyNodeHost } from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PIPELINE_SOURCE = path.join(REPO_ROOT, 'platform/ci/src/pipeline.mjs');

/**
 * A component the engine cannot install is a component the engine cannot test.
 *
 * `verifyPnpmHost` has always installed the pnpm workspace when `node_modules`
 * was absent. `verifyNodeHost` did not, and that asymmetry is the whole defect:
 * `.gitea/workflows/ci-cd.yml` installs dependencies for `quick-pick-survey` and
 * `print-atelier` only — those two are needed by gates in `scripts/test-ci.sh`
 * that run before this engine — so every other Node component in
 * `VENTURE_CATALOG` reached `npm run <script>` on a clean runner with no
 * `node_modules` and died on `ERR_MODULE_NOT_FOUND`.
 *
 * That is a dependency failure wearing a test failure's clothes, and
 * affected-path detection meant it fired exactly when a venture changed. The
 * practical consequence was that `local-site-studio` (125 files, 1214 passing
 * tests), `ai-first-markets`, `photo-editing/docs-site`,
 * `ai-engineering-academy/site` and `real-estate-agent-photo-app` had no CI run
 * that ever executed their suites, while the pipeline reported the reason as a
 * broken component.
 *
 * This is the venture-level twin of `ci-workflow-tooling.test.mjs`: that one
 * holds the workflow to the tools `scripts/test-ci.sh` invokes, this one holds
 * the engine to being able to install what it claims to verify. Adding a Node
 * component to the catalog must not require remembering to add an install step
 * to a workflow, because nobody does.
 */

/** Run `fn`, returning everything it wrote through console.log/console.error. */
function capture(fn) {
  const lines = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const result = fn();
    return { result, output: lines.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/**
 * A throwaway repo root holding one Node package, so these tests exercise the
 * real `verifyNodeHost` without touching this repository.
 */
function fixture({ manifest, lockfile = null, withNodeModules = false }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-dep-install-'));
  const dir = path.join(root, 'pkg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  if (lockfile) {
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lockfile, null, 2));
  }
  if (withNodeModules) {
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  }
  return { root, dir, component: { id: 'fixture', name: 'Fixture', dir: 'pkg', type: 'node', scripts: ['test'] } };
}

/** A lockfile that lists none of the manifest's dependencies. */
const EMPTY_LOCKFILE = {
  name: 'fixture',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'left-pad': '^1.3.0' },
    },
    'node_modules/left-pad': {
      version: '1.3.0',
      resolved: 'file:./does-not-exist-left-pad.tgz',
    },
  },
};

test('a Node component with dependencies and no node_modules is installed', () => {
  // The lockfile resolves the dependency to a tarball that does not exist, so
  // `npm ci` fails offline and fast. The point of the test is that an install was
  // attempted at all — reaching `npm ci` is what never used to happen.
  const { root, component } = fixture({
    manifest: {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'left-pad': '^1.3.0' },
      scripts: { test: 'node -e 0' },
    },
    lockfile: EMPTY_LOCKFILE,
  });

  const { result, output } = capture(() => verifyNodeHost(component, root));

  assert.match(
    output,
    /Installing component dependencies: npm ci\b/,
    'a component with a lockfile must be installed with npm ci, the reproducible form'
  );
  assert.equal(
    result,
    false,
    'a failed dependency install must fail the component rather than fall through to its scripts'
  );
  assert.doesNotMatch(
    output,
    /has no package-lock\.json/,
    'a component with a lockfile must be installed with npm ci, not downgraded'
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('an install uses npm ci when a lockfile exists and says so when one does not', () => {
  const unpinned = fixture({
    manifest: {
      name: 'fixture',
      version: '1.0.0',
      // A `file:` dependency pointing nowhere fails immediately and without a
      // network, so this asserts the install path rather than the registry.
      dependencies: { 'missing-local-package': 'file:./does-not-exist' },
      scripts: { test: 'node -e 0' },
    },
  });

  const { result, output } = capture(() => verifyNodeHost(unpinned.component, unpinned.root));

  assert.match(
    output,
    /declares dependencies but has no package-lock\.json/,
    'an unpinned install must be reported, not performed silently'
  );
  assert.match(
    output,
    /Installing component dependencies: npm install\b/,
    'a missing lockfile must downgrade the install to npm install, not skip it'
  );
  assert.equal(result, true, 'the component scripts must still run after an unpinned install');

  fs.rmSync(unpinned.root, { recursive: true, force: true });
});

test('a Node component that declares no dependencies is not installed', () => {
  // portfolio/marisstella-homepage is this case: no dependencies, no lockfile,
  // and a build script that needs neither. Running `npm ci` there would fail for
  // want of a lockfile it has no reason to have.
  const { root, component } = fixture({
    manifest: { name: 'fixture', version: '1.0.0', scripts: { test: 'node -e 0' } },
  });

  const { result, output } = capture(() => verifyNodeHost(component, root));

  assert.equal(result, true, 'a dependency-free component must verify without an install');
  assert.doesNotMatch(
    output,
    /Installing component dependencies/,
    'a component with no dependencies must not be installed'
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('an existing node_modules is left alone', () => {
  const { root, component } = fixture({
    manifest: {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'left-pad': '^1.3.0' },
      scripts: { test: 'node -e 0' },
    },
    lockfile: EMPTY_LOCKFILE,
    withNodeModules: true,
  });

  const { result, output } = capture(() => verifyNodeHost(component, root));

  assert.doesNotMatch(
    output,
    /Installing component dependencies/,
    'an already-installed component must not be reinstalled on every run'
  );
  assert.equal(result, true, 'the component scripts must run when dependencies are present');

  fs.rmSync(root, { recursive: true, force: true });
});

test('dependencies are installed before the Prisma client is generated', () => {
  // `npx prisma generate` used to run first. The generator is a dependency, so on
  // a clean runner that either failed or silently fetched a different version of
  // Prisma than the lockfile pins.
  const source = fs.readFileSync(PIPELINE_SOURCE, 'utf8');
  const nodeRunner = source.slice(source.indexOf('export function verifyNodeHost'));
  const installAt = nodeRunner.indexOf('Installing component dependencies');
  const prismaAt = nodeRunner.indexOf('prisma generate');

  assert.ok(installAt !== -1, 'verifyNodeHost no longer installs component dependencies');
  assert.ok(prismaAt !== -1, 'verifyNodeHost no longer generates the Prisma client');
  assert.ok(
    installAt < prismaAt,
    'verifyNodeHost must install dependencies before running the Prisma generator'
  );
});

test('every Node component that needs an install can be installed reproducibly', () => {
  // `npm ci` needs a lockfile, and it needs one that exists on a clean checkout.
  // A lockfile present only on a developer's disk installs here and nowhere else.
  const tracked = new Set(
    execFileSync('git', ['ls-files', '--', '*package-lock.json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    })
      .split('\n')
      .filter(Boolean)
  );

  const offenders = [];
  for (const component of VENTURE_CATALOG) {
    if (component.type !== 'node') continue;
    const packageDir = component.packageDir || component.dir;
    const manifestPath = path.join(REPO_ROOT, packageDir, 'package.json');
    assert.ok(
      fs.existsSync(manifestPath),
      `${component.id}: catalog claims a Node package at ${packageDir}, which has no package.json`
    );

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const declaresDependencies =
      Object.keys(manifest.dependencies || {}).length > 0 ||
      Object.keys(manifest.devDependencies || {}).length > 0;
    if (!declaresDependencies) continue;

    if (!tracked.has(`${packageDir}/package-lock.json`)) {
      offenders.push(`${component.id} (${packageDir})`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Node components declaring dependencies with no committed package-lock.json, ' +
      `so CI cannot install them reproducibly: ${offenders.join(', ')}`
  );
});
