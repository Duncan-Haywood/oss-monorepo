// A declared gate that cannot fail is worse than a missing one, because the
// pipeline prints PASSED for it and the roadmap counts it as covered.
//
// portfolio/marisstella-homepage was the instance that prompted this: a
// production UI deployed to the Kubernetes cluster, registered in
// VENTURE_CATALOG, whose three gates were
//
//   build: node -e 'console.log("Marisstella homepage build verified")'
//   lint:  node -e 'console.log("Marisstella homepage lint verified")'
//   test:  node -e 'console.log("Marisstella homepage test verified")'
//
// The engine ran `build`, it exited 0, and the component was reported verified
// for as long as it had existed. Nothing in the repository could tell that
// apart from a passing suite — every control we have asks whether a gate is
// *declared* and whether it is *reachable*, and this one was both.
//
// Two shapes are caught here. A gate whose every segment always succeeds does
// nothing at all. A gate that ends a segment in `|| true` (or `|| echo ...`,
// or `|| exit 0`) does real work and then discards the result, which is the
// swallowed-failure form the engineering roadmap requires be removed.
//
// The detector is unit-tested below against known-real and known-inert
// commands, because a matcher that silently matches nothing would pass this
// file forever while enforcing nothing — the same defect one level up.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Gate script names; a `prebuild` that echoes a banner is not a gate. */
const GATE_SCRIPTS = ['test', 'build', 'lint', 'typecheck', 'verify', 'ci', 'coverage'];

/** Commands that succeed no matter what the repository contains. */
const ALWAYS_SUCCEEDS = [/^true$/, /^:$/, /^exit\s+0$/, /^echo\b/, /^printf\b/];

/** An inline node program can only fail if something in it can throw or exit. */
function inlineProgramCanFail(body) {
  return /\b(require|import|assert|throw|process\.exit|exitCode)\b/.test(body);
}

export function isInertSegment(segment) {
  const command = segment.trim().replace(/\s*[12]?>\s*\/dev\/null\s*$/, '').trim();
  if (!command) return true;
  if (ALWAYS_SUCCEEDS.some((pattern) => pattern.test(command))) return true;

  const inline = command.match(/^node\s+(?:-e|--eval)\s+(['"])([\s\S]*)\1$/);
  if (inline) return !inlineProgramCanFail(inline[2]);

  return false;
}

/** Split on the operators npm scripts chain with, keeping `||` identifiable. */
function segments(command) {
  return command
    .split(/&&|\|\||;/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The gate runs, but nothing it runs can report a failure. */
export function isInertGate(command) {
  const parts = segments(command);
  return parts.length > 0 && parts.every(isInertSegment);
}

/** The gate does real work and then throws the result away. */
export function swallowsFailure(command) {
  return command
    .split('||')
    .slice(1)
    .some((fallback) => isInertSegment(fallback.split(/&&|;/)[0]));
}

test('Gate Substance - the detector recognises inert and real gates', () => {
  const inert = [
    "node -e 'console.log(\"verified\")'",
    'node --eval "console.log(1)"',
    'true',
    'exit 0',
    'echo "tests pass"',
    ':',
    "echo building && node -e 'console.log(\"done\")'",
  ];
  for (const command of inert) {
    assert.equal(isInertGate(command), true, `should be inert: ${command}`);
  }

  const real = [
    "node --test 'test/*.test.mjs'",
    'vitest run',
    'tsc --noEmit',
    'next build',
    'eslint .',
    'pnpm -r run test',
    'prisma generate && next build --webpack',
    "node -e 'require(\"assert\").ok(process.env.CI)'",
    'echo "linting" && eslint .',
    'pytest tests',
  ];
  for (const command of real) {
    assert.equal(isInertGate(command), false, `should be real: ${command}`);
  }

  const swallowed = [
    'vitest run || true',
    'eslint . || echo "lint skipped"',
    'tsc --noEmit || exit 0',
    'pytest tests 2>/dev/null || true',
  ];
  for (const command of swallowed) {
    assert.equal(swallowsFailure(command), true, `should swallow failure: ${command}`);
  }

  for (const command of ['vitest run', 'eslint . || eslint --fix .', 'next build']) {
    assert.equal(swallowsFailure(command), false, `should not swallow failure: ${command}`);
  }
});

/** Every package.json a catalog component runs npm scripts out of. */
function catalogPackages() {
  const packages = [];
  for (const component of VENTURE_CATALOG) {
    if (component.type !== 'node' && component.type !== 'pnpm') continue;
    const dir = component.packageDir || component.dir;
    const file = path.join(REPO_ROOT, dir, 'package.json');
    if (!fs.existsSync(file)) continue;

    const declared =
      component.type === 'pnpm'
        ? [component.ciScript || 'ci']
        : component.scripts || [];

    packages.push({
      id: component.id,
      dir,
      declared,
      scripts: JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {},
    });
  }
  return packages;
}

test('Gate Substance - the catalog inspects components that declare npm gates', () => {
  // Guards this file: if VENTURE_CATALOG is refactored so the checks below
  // iterate nothing, they would pass while enforcing nothing.
  const packages = catalogPackages();
  assert.ok(packages.length >= 5, `expected several npm components, found ${packages.length}`);
  assert.ok(
    packages.some((pkg) => pkg.declared.length > 0),
    'no catalog component declares any script to run'
  );
});

test('Gate Substance - every gate the CI engine runs is capable of failing', () => {
  const findings = [];

  for (const pkg of catalogPackages()) {
    for (const name of pkg.declared) {
      const command = pkg.scripts[name];
      if (command === undefined) {
        findings.push(
          `${pkg.id}: VENTURE_CATALOG runs \`${name}\`, which ${pkg.dir}/package.json does not define`
        );
        continue;
      }
      if (isInertGate(command)) {
        findings.push(`${pkg.id}: \`${name}\` cannot fail — ${command}`);
      }
      if (swallowsFailure(command)) {
        findings.push(`${pkg.id}: \`${name}\` discards its own failure — ${command}`);
      }
    }
  }

  assert.deepEqual(findings, [], `gates that report PASSED without checking anything:\n${findings.join('\n')}`);
});

test('Gate Substance - no package in the repository declares an inert gate', () => {
  // Wider than the catalog on purpose: a per-venture workflow, a pre-push hook,
  // or a developer following VENTURE.yaml can run a script the engine does not,
  // and an inert one there tells the same lie to whoever trusts it.
  const findings = [];

  for (const root of ['ventures', 'portfolio', 'platform']) {
    for (const file of packageJsonFiles(path.join(REPO_ROOT, root))) {
      const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {};
      for (const [name, command] of Object.entries(scripts)) {
        if (!GATE_SCRIPTS.includes(name)) continue;
        const where = `${path.relative(REPO_ROOT, file)} \`${name}\``;
        if (isInertGate(command)) findings.push(`${where} cannot fail — ${command}`);
        if (swallowsFailure(command)) findings.push(`${where} discards its own failure — ${command}`);
      }
    }
  }

  assert.ok(findings.length === 0, `inert or failure-swallowing gates:\n${findings.join('\n')}`);
});

function packageJsonFiles(dir, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) packageJsonFiles(full, found);
    else if (entry.name === 'package.json') found.push(full);
  }
  return found;
}
