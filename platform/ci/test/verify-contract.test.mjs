import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');

/**
 * A venture's quality gates are declared in more than one place, and only some
 * of them execute. `VENTURE_CATALOG` below is what the Dagger pipeline actually
 * runs; `verify:` in a venture's VENTURE.yaml is what a developer is told to run
 * locally and what the engineering roadmap calls "the local and CI contract".
 *
 * Nothing used to compare them, so they drifted silently and in the direction
 * that flatters: five ventures documented a *weaker* command than CI ran.
 * quick-pick-survey documented `npm test` while CI ran typecheck, lint and test,
 * so the documented command passed locally and then failed in CI on the very
 * gates that were restored for it. Documentation that is weaker than the gate is
 * worse than no documentation, because it is trusted.
 *
 * These tests make VENTURE.yaml a checked mirror of the executed catalog rather
 * than prose that happens to sit next to it.
 */

function ventureRootOf(dir) {
  const parts = dir.split('/');
  return parts[0] === 'ventures' && parts[1] ? `ventures/${parts[1]}` : null;
}

/** The gate sequence one catalog entry executes, as shell a developer can run. */
function segmentsFor(component, ventureRoot) {
  const packageDir = component.packageDir || component.dir;
  const relative = path.relative(ventureRoot, packageDir);
  const prefix = relative && relative !== '.' ? `--prefix ${relative} ` : '';

  if (component.type === 'python') {
    const testDir = path.join(component.dir, component.testDir || 'tests');
    return [`pytest ${path.relative(ventureRoot, testDir)}`];
  }
  if (component.type === 'pnpm') {
    return [`pnpm run ${component.ciScript || 'ci'}`];
  }
  if (component.type === 'node') {
    // `npm test` is the idiomatic spelling of the `test` script; every other
    // script is only reachable through `npm run`.
    return (component.scripts || []).map((script) =>
      script === 'test' ? `npm ${prefix}test` : `npm ${prefix}run ${script}`
    );
  }
  return [];
}

/** Catalog entries grouped by venture; a venture may register several. */
function catalogByVenture() {
  const grouped = new Map();
  for (const component of VENTURE_CATALOG) {
    const ventureRoot = ventureRootOf(component.dir);
    if (!ventureRoot) continue;
    if (!grouped.has(ventureRoot)) grouped.set(ventureRoot, []);
    grouped.get(ventureRoot).push(component);
  }
  return grouped;
}

function canonicalVerifyFor(ventureRoot, components) {
  const ordered = [...components].sort((a, b) =>
    (a.packageDir || a.dir).localeCompare(b.packageDir || b.dir)
  );
  return ordered.flatMap((component) => segmentsFor(component, ventureRoot)).join(' && ');
}

function declaredVerifyFor(ventureRoot) {
  const yamlPath = path.join(REPO_ROOT, ventureRoot, 'VENTURE.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  const match = fs.readFileSync(yamlPath, 'utf8').match(/^verify:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

test('Verify Contract - VENTURE.yaml verify matches the gates CI executes', () => {
  const drift = [];

  for (const [ventureRoot, components] of [...catalogByVenture()].sort()) {
    const canonical = canonicalVerifyFor(ventureRoot, components);
    if (!canonical) continue;

    const declared = declaredVerifyFor(ventureRoot);
    assert.ok(
      declared,
      `${ventureRoot}/VENTURE.yaml has no \`verify:\` command, but CI runs: ${canonical}`
    );

    if (declared !== canonical) {
      drift.push(`  ${ventureRoot}\n    declared: ${declared}\n    CI runs : ${canonical}`);
    }
  }

  assert.equal(
    drift.length,
    0,
    'VENTURE.yaml `verify:` drifted from the gates the CI catalog executes.\n' +
      'Update VENTURE.yaml to the CI command, or change the catalog if the gate itself is wrong.\n' +
      drift.join('\n')
  );
});

test('Verify Contract - every venture with a contract is registered in the catalog', () => {
  const registered = new Set(catalogByVenture().keys());
  const unregistered = fs
    .readdirSync(VENTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `ventures/${entry.name}`)
    .filter((ventureRoot) => fs.existsSync(path.join(REPO_ROOT, ventureRoot, 'VENTURE.yaml')))
    .filter((ventureRoot) => !registered.has(ventureRoot));

  assert.deepEqual(
    unregistered,
    [],
    'These ventures declare a VENTURE.yaml contract but no catalog entry executes it, ' +
      'so their gates never run and the build is green regardless:\n  ' +
      unregistered.join('\n  ')
  );
});
