import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { runDaggerContainerizedPipeline } from '../src/pipeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT = path.resolve(HERE, '..');
const PIPELINE = path.join(COMPONENT, 'src', 'pipeline.mjs');

/**
 * The containerized path used to cost the repository a dependency tree.
 *
 * `@dagger.io/dagger` pulls in `adm-zip` below the 0.6.0 that fixes
 * GHSA-xcpc-8h2w-3j85, and pins it that way as far up as its newest release,
 * so the six high-severity advisories it carried could not be upgraded away.
 * They were also invisible: `platform/ci/package-lock.json` was untracked, so
 * `dependency-audit-coverage.test.mjs` never saw a lockfile to demand an audit
 * of. Committing it is what surfaced them.
 *
 * The SDK is now resolved at call time instead. These tests hold that shape,
 * because the cheap regression is someone adding the import back to the
 * manifest — which reintroduces the advisories without changing a line of
 * behaviour, and would look like a tidy-up in review.
 */

test('platform/ci declares no third-party dependencies', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(COMPONENT, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(manifest.dependencies ?? {}),
    [],
    'platform/ci runs the whole repository\'s gates. A dependency here is a dependency of every gate.',
  );
  assert.deepEqual(Object.keys(manifest.devDependencies ?? {}), []);
});

test('the Dagger SDK is reached only through a dynamic import inside the try', () => {
  const source = fs.readFileSync(PIPELINE, 'utf8');
  const staticImport = /^\s*import\s[^\n]*['"]@dagger\.io\/dagger['"]/m.exec(source);
  assert.equal(
    staticImport,
    null,
    'A static import makes the SDK load at module load, so every gate in the repository needs it installed.',
  );
  assert.match(source, /await import\('@dagger\.io\/dagger'\)/);
});

function captureLog(fn) {
  const { log } = console;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  return Promise.resolve()
    .then(fn)
    .then(
      (value) => ((console.log = log), { value, output: lines.join('\n') }),
      (error) => ((console.log = log), Promise.reject(error)),
    );
}

test('an absent SDK falls back rather than throwing, with the daemon reported reachable', async () => {
  // The daemon is forced reachable so execution passes the preflight and
  // actually reaches the import. Without that this test would pass on the
  // preflight alone, on every host in this fleet, and would keep passing with
  // the try/catch deleted.
  assert.equal(
    fs.existsSync(path.join(COMPONENT, 'node_modules', '@dagger.io', 'dagger')),
    false,
    'This test describes the uninstalled case; install the SDK and it no longer measures anything.',
  );

  const { value, output } = await captureLog(() =>
    runDaggerContainerizedPipeline(['quick-pick-survey'], undefined, undefined, () => true),
  );

  assert.equal(value, null, 'null is the signal runPipeline reads as "fall back to host execution"');
  assert.doesNotMatch(
    output,
    /Docker CLI or daemon not ready/,
    'Falling back at the preflight means the SDK branch was never reached.',
  );
  assert.match(output, /falling back to isolated host verification/i);
});

test('an unreachable daemon still falls back before the SDK is reached', async () => {
  const { value, output } = await captureLog(() =>
    runDaggerContainerizedPipeline(['quick-pick-survey'], undefined, undefined, () => false),
  );

  assert.equal(value, null);
  assert.match(output, /Docker CLI or daemon not ready/);
});

test('the default preflight is the real docker check, not a stub', () => {
  const source = fs.readFileSync(PIPELINE, 'utf8');
  assert.match(
    source,
    /export function daemonIsReachable\(\)\s*\{\s*return spawnSync\('docker', \['info'\][^}]*\}/,
    'The injected default must be the real probe, or production takes the test double.',
  );
  assert.match(source, /daemonReachable = daemonIsReachable/);
});
