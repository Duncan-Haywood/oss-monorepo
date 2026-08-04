// A gate that runs over no files passes. `gate-substance.test.mjs` asks whether
// a declared gate *can fail*; this file asks whether it has anything to run on.
//
// `node --test '<glob>'` exits **0** when the glob matches nothing — verified on
// Node 22.21.1 and Node 26.4.0. So renaming a test directory does not break a
// build: it silently disarms the suite and every meta-gate above it keeps
// printing PASSED over zero assertions.
//
// The instance that prompted this: `portfolio/marisstella-homepage`'s only gate
// is `node --test 'test/*.test.mjs'`, and that venture is the one with a public
// customer surface. Renaming its five test files leaves the whole tower green.
// `ai-first-markets`, `print-atelier`, `retail-pilot-intel`, `platform/ci` and
// `scripts/test-ci.sh` itself carry the same shape.
//
// The check is deliberately about what a gate *collects*, not what it asserts.
// Resolution is against `git ls-files`, not the filesystem, because an untracked
// file satisfies a local run and then does not exist in CI — a gate that passes
// on this laptop and collects nothing in the clone is the same defect wearing a
// green tick.

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Script names that are gates; a `prebuild` banner is not one. */
const GATE_SCRIPTS = ['test', 'build', 'lint', 'typecheck', 'verify', 'ci', 'coverage'];

/**
 * Flags whose *next* token is a value, not a file to run.
 *
 * `node --import tsx --test tests/*.test.ts` would otherwise offer `tsx` as a
 * path. Today none of these values are path-shaped, but `--import ./reg.mjs` is
 * the ordinary form and would be read as a missing test file.
 */
const VALUE_FLAGS = new Set([
  '--import',
  '--loader',
  '--experimental-loader',
  '--require',
  '-r',
  '--config',
  '-c',
  '--reporter',
  '--test-reporter',
  '--test-name-pattern',
  '--env-file',
]);

/** A token that names files to run: a glob, or a path with a source extension. */
function isFileArgument(token) {
  if (token.startsWith('-') || token.includes('=')) return false;
  if (token.includes('*') || token.includes('?')) return true;
  return /\.(m?[jt]sx?|cjs|cts|mts|py)$/.test(token);
}

/** Split a shell command into tokens, honouring single and double quotes. */
export function tokenize(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;

  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
  }
  if (started || current) tokens.push(current);
  return tokens;
}

/**
 * The file patterns a command hands its test runner.
 *
 * Only runners that take explicit paths are read. `vitest run` and `pytest`
 * with no path both *fail* when they collect nothing (vitest: "No test files
 * found"; pytest: exit 5), so they are not part of this defect class and a
 * pattern of theirs that resolves is still checked if they name one.
 */
export function fileArguments(command) {
  const found = [];
  for (const segment of command.split(/&&|\|\||;/)) {
    const tokens = tokenize(segment.trim());
    if (tokens.length === 0) continue;
    for (let i = 1; i < tokens.length; i++) {
      if (VALUE_FLAGS.has(tokens[i])) {
        i++;
        continue;
      }
      if (isFileArgument(tokens[i])) found.push(tokens[i]);
    }
  }
  return found;
}

/** Every file git tracks, once. */
let trackedCache = null;
function trackedFiles() {
  if (trackedCache) return trackedCache;
  const output = execFileSync('git', ['ls-files'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  trackedCache = output.split('\n').filter(Boolean);
  return trackedCache;
}

/** Shell/Node glob semantics: `*` and `?` stop at `/`, `**` does not. */
export function globToRegExp(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          source += '(?:[^/]+/)*';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * The tracked files a gate's pattern actually collects.
 *
 * `dir` is the directory the gate runs in, so patterns are repo-relative before
 * matching — the same resolution the runner performs.
 */
export function collectedFiles(dir, pattern) {
  const prefix = dir === '.' ? '' : `${dir.replace(/\/$/, '')}/`;
  const full = path.posix.normalize(`${prefix}${pattern}`);
  if (!full.includes('*') && !full.includes('?')) {
    return trackedFiles().includes(full) ? [full] : [];
  }
  const matcher = globToRegExp(full);
  return trackedFiles().filter((file) => matcher.test(file));
}

/** Every gate the repository declares, as {where, dir, name, command}. */
function declaredGates() {
  const gates = [];
  for (const root of ['ventures', 'portfolio', 'platform']) {
    for (const file of packageJsonFiles(path.join(REPO_ROOT, root))) {
      const dir = path.relative(REPO_ROOT, path.dirname(file));
      const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {};
      for (const [name, command] of Object.entries(scripts)) {
        if (!GATE_SCRIPTS.includes(name)) continue;
        gates.push({ where: `${path.relative(REPO_ROOT, file)} \`${name}\``, dir, name, command });
      }
    }
  }
  return gates;
}

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

test('Gate Collection - the tokenizer keeps quoted patterns whole', () => {
  assert.deepEqual(tokenize("node --test 'test/*.test.mjs'"), ['node', '--test', 'test/*.test.mjs']);
  assert.deepEqual(tokenize('node --import tsx --test tests/*.test.ts'), [
    'node',
    '--import',
    'tsx',
    '--test',
    'tests/*.test.ts',
  ]);
  assert.deepEqual(tokenize('  vitest   run  '), ['vitest', 'run']);
});

test('Gate Collection - the extractor finds file patterns and skips flag values', () => {
  assert.deepEqual(fileArguments("node --test 'test/*.test.mjs'"), ['test/*.test.mjs']);
  assert.deepEqual(fileArguments('node --import tsx --test tests/*.test.ts'), ['tests/*.test.ts']);
  assert.deepEqual(fileArguments('node --import ./register.mjs --test src/**/*.test.ts'), [
    'src/**/*.test.ts',
  ]);
  assert.deepEqual(fileArguments('node --test a.test.mjs b.test.mjs'), [
    'a.test.mjs',
    'b.test.mjs',
  ]);
  // Gates that name no files must not be read as naming a missing one.
  for (const command of ['vitest run', 'next build', 'eslint .', 'tsc --noEmit', 'pytest']) {
    assert.deepEqual(fileArguments(command), [], `should name no files: ${command}`);
  }
});

test('Gate Collection - the resolver distinguishes a live pattern from a dead one', () => {
  // Without this the whole file could pass by resolving everything to nothing
  // and everything to something — the vacuous-glob defect, one level up.
  assert.ok(
    collectedFiles('platform/ci', 'test/*.test.mjs').length >= 10,
    'the platform/ci suite should resolve to its own many test files'
  );
  assert.deepEqual(collectedFiles('platform/ci', 'test/no-such-suite-*.test.mjs'), []);
  assert.deepEqual(collectedFiles('.', 'platform/ci/test/gate-substance.test.mjs'), [
    'platform/ci/test/gate-substance.test.mjs',
  ]);
  assert.deepEqual(collectedFiles('.', 'platform/ci/test/never-written.test.mjs'), []);
  assert.ok(
    collectedFiles('.', 'platform/ci/**/*.test.mjs').length >= 10,
    '`**` should cross directory boundaries'
  );
  // `*` stops at a slash; `**` does not.
  assert.deepEqual(collectedFiles('.', 'platform/*/gate-substance.test.mjs'), []);
});

test('Gate Collection - the sweep inspects a meaningful number of gates', () => {
  const gates = declaredGates();
  assert.ok(gates.length >= 20, `expected many declared gates, found ${gates.length}`);
  const withPatterns = gates.filter((gate) => fileArguments(gate.command).length > 0);
  assert.ok(
    withPatterns.length >= 4,
    `expected several gates to name file patterns, found ${withPatterns.length}`
  );
});

test('Gate Collection - every gate pattern resolves to at least one tracked file', () => {
  const findings = [];

  for (const gate of declaredGates()) {
    for (const pattern of fileArguments(gate.command)) {
      if (collectedFiles(gate.dir, pattern).length === 0) {
        findings.push(
          `${gate.where}: \`${pattern}\` collects no tracked file — the gate runs over nothing and exits 0`
        );
      }
    }
  }

  assert.deepEqual(findings, [], `gates that would pass over zero files:\n${findings.join('\n')}`);
});

test('Gate Collection - the catalog runs no script its package.json omits a pattern for', () => {
  // The catalog is the engine's own view. A component whose declared script
  // resolves to nothing is reported verified by `pipeline.mjs` itself.
  const findings = [];

  for (const component of VENTURE_CATALOG) {
    if (component.type !== 'node' && component.type !== 'pnpm') continue;
    const dir = component.packageDir || component.dir;
    const file = path.join(REPO_ROOT, dir, 'package.json');
    if (!fs.existsSync(file)) continue;

    const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {};
    const declared = component.type === 'pnpm' ? [component.ciScript || 'ci'] : component.scripts || [];

    for (const name of declared) {
      const command = scripts[name];
      if (command === undefined) continue; // gate-substance.test.mjs owns this case
      for (const pattern of fileArguments(command)) {
        if (collectedFiles(dir, pattern).length === 0) {
          findings.push(`${component.id}: \`${name}\` collects nothing for \`${pattern}\``);
        }
      }
    }
  }

  assert.deepEqual(findings, [], `catalog components verified over zero files:\n${findings.join('\n')}`);
});

test('Gate Collection - every pattern the CI runner scripts name resolves', () => {
  // `scripts/test-ci.sh:71` runs `node --test "${REPO_ROOT}/platform/ci/test/"*.test.mjs`.
  // That is the same defect in the runner rather than in a package: rename the
  // directory and 26 meta-gate tests are replaced by an exit 0.
  const findings = [];
  const scripts = ['scripts/test-ci.sh', 'scripts/ci/verify-component.sh'];

  let inspected = 0;
  for (const script of scripts) {
    const file = path.join(REPO_ROOT, script);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (line.trim().startsWith('#')) return;
      if (!/node\s+(?:--\S+\s+)*--test\b/.test(line)) return;
      const resolved = line.replaceAll('${REPO_ROOT}', '.').replaceAll('$REPO_ROOT', '.');
      for (const pattern of fileArguments(resolved)) {
        inspected += 1;
        if (collectedFiles('.', pattern).length === 0) {
          findings.push(`${script}:${index + 1}: \`${pattern}\` collects no tracked file`);
        }
      }
    });
  }

  assert.ok(inspected > 0, 'no runner test invocation was inspected — the matcher found nothing to check');
  assert.deepEqual(findings, [], `runner invocations over zero files:\n${findings.join('\n')}`);
});
