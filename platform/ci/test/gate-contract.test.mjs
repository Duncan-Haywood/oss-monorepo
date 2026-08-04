import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';
import {
  CI_ONLY_GATES,
  REPO_ROOT,
  VERIFY_COMPONENT_SCRIPT,
  catalogGates,
  findGateDrift,
  formatFindings,
  parseVerifyComponentScript,
  resolveArmComponent,
} from '../src/gate-contract.mjs';

/**
 * Build a throwaway repo root containing only a verify-component.sh, so the
 * detector's own behaviour can be tested against known-bad inputs rather than
 * only against the repository as it happens to be today.
 */
function withScript(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-contract-'));
  fs.mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
  fs.writeFileSync(path.join(dir, VERIFY_COMPONENT_SCRIPT), body);
  return dir;
}

test('Gate contract - the monorepo gate and the per-venture CI gate agree', () => {
  const findings = findGateDrift(VENTURE_CATALOG);

  assert.deepEqual(
    findings,
    [],
    'The Dagger catalog and the per-venture Gitea gate script declare different ' +
      'quality gates. Whichever pipeline runs will report green while the missing ' +
      `gate goes unrun:\n\n${formatFindings(findings)}\n`,
  );
});

test('Gate contract - the script parser recovers every arm and its gates', () => {
  const arms = parseVerifyComponentScript();

  assert.ok(
    arms.length >= 5,
    `Expected to parse at least 5 component arms from ${VERIFY_COMPONENT_SCRIPT}, ` +
      `got ${arms.length}. A parser that silently recovers nothing reports no drift.`,
  );

  for (const arm of arms) {
    assert.ok(
      arm.gates.length > 0,
      `The '${arm.label}' arm parsed to zero gates, which cannot be right — an arm ` +
        'that runs nothing would be a no-op CI job.',
    );
    const { component, dirs } = resolveArmComponent(arm, VENTURE_CATALOG);
    assert.equal(dirs.length, 1, `The '${arm.label}' arm spans directories: ${dirs.join(', ')}`);
    assert.ok(component, `The '${arm.label}' arm has no owning catalog entry`);
  }

  // The usage fallback is not a component and must not be parsed as one.
  assert.equal(
    arms.some((arm) => arm.label === '*'),
    false,
    'The `*)` usage fallback was parsed as a component arm',
  );
});

test('Gate contract - a gate dropped from the CI script is caught', () => {
  const dir = withScript(`#!/usr/bin/env bash
case "$component" in
  demo)
    run_npm ventures/demo npm run lint
    run_npm ventures/demo npm test
    ;;
esac
`);
  const catalog = [
    { id: 'demo', dir: 'ventures/demo', type: 'node', scripts: ['typecheck', 'lint', 'test'] },
  ];

  const findings = findGateDrift(catalog, dir, {});
  const codes = findings.map((f) => f.code);

  assert.deepEqual(codes, ['gate-missing-from-ci-workflow']);
  assert.match(findings[0].message, /typecheck/);
});

test('Gate contract - an undeclared extra gate in the CI script is caught', () => {
  const dir = withScript(`#!/usr/bin/env bash
case "$component" in
  demo)
    run_npm ventures/demo npm test
    run_npm ventures/demo npm run deploy
    ;;
esac
`);
  const catalog = [{ id: 'demo', dir: 'ventures/demo', type: 'node', scripts: ['test'] }];

  const findings = findGateDrift(catalog, dir, {});

  assert.deepEqual(findings.map((f) => f.code), ['undeclared-ci-only-gate']);
  assert.match(findings[0].message, /deploy/);
});

test('Gate contract - a missing prisma generate is caught', () => {
  const dir = withScript(`#!/usr/bin/env bash
case "$component" in
  demo)
    run_npm ventures/demo npm run typecheck
    ;;
esac
`);
  const catalog = [
    { id: 'demo', dir: 'ventures/demo', type: 'node', hasPrisma: true, scripts: ['typecheck'] },
  ];

  assert.deepEqual(
    findGateDrift(catalog, dir, {}).map((f) => f.code),
    ['missing-prisma-generate'],
  );
});

test('Gate contract - an arm verifying an unregistered directory is caught', () => {
  const dir = withScript(`#!/usr/bin/env bash
case "$component" in
  ghost)
    run_npm ventures/ghost npm test
    ;;
esac
`);

  assert.deepEqual(
    findGateDrift([], dir, {}).map((f) => f.code),
    ['arm-without-catalog-entry'],
  );
});

test('Gate contract - a script the parser cannot read fails closed', () => {
  const dir = withScript('#!/usr/bin/env bash\nexit 0\n');

  assert.deepEqual(
    findGateDrift([{ id: 'demo', dir: 'ventures/demo', type: 'node', scripts: ['test'] }], dir, {}).map(
      (f) => f.code,
    ),
    ['no-arms-parsed'],
    'A parser that recovers nothing must report that, not report "no drift"',
  );
});

/**
 * The exception list is the one part of this contract a human maintains by
 * hand, so it is the part most likely to rot into a blanket suppression.
 */
test('Gate contract - every CI-only exception names a real component and gate', () => {
  const catalogIds = new Set(VENTURE_CATALOG.map((c) => c.id));

  for (const [id, gates] of Object.entries(CI_ONLY_GATES)) {
    assert.ok(catalogIds.has(id), `CI_ONLY_GATES names '${id}', which is not in VENTURE_CATALOG`);
    assert.ok(Array.isArray(gates) && gates.length > 0, `CI_ONLY_GATES['${id}'] is empty`);

    const component = VENTURE_CATALOG.find((c) => c.id === id);
    const declared = catalogGates(component);
    for (const gate of gates) {
      assert.equal(
        declared.includes(gate),
        false,
        `CI_ONLY_GATES excuses '${gate}' for ${id}, but the catalog already runs it`,
      );
    }

    const packageJsonPath = path.join(
      REPO_ROOT,
      component.packageDir || component.dir,
      'package.json',
    );
    if (!fs.existsSync(packageJsonPath)) continue;
    const scripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts || {};
    for (const gate of gates) {
      assert.ok(
        scripts[gate],
        `CI_ONLY_GATES excuses '${gate}' for ${id}, but that package defines no such ` +
          'script, so the gate it excuses does not exist',
      );
    }
  }
});
