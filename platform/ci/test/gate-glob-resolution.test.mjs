// The second half of `gate-collection.test.mjs`.
//
// That file closed the substantiated finding: `node --test '<glob>'` exits **0**
// when the glob matches nothing, so renaming a test directory replaces a suite
// with a green tick. Reproduced here on Node 22.22.3 before writing either
// control:
//
//     $ cd portfolio/marisstella-homepage
//     $ for f in test/*.test.mjs; do mv "$f" "${f%.test.mjs}.spec.mjs"; done
//     $ node --test 'test/*.test.mjs'; echo $?
//     TAP version 13
//     1..0
//     # tests 0
//     # pass 0
//     # fail 0
//     0
//
// `gate-collection.test.mjs` sweeps the `scripts` map of every package.json it
// finds by walking `ventures/`, `portfolio/` and `platform/`, filtered to seven
// gate script names, plus two runner scripts it names literally:
//
//     const scripts = ['scripts/test-ci.sh', 'scripts/ci/verify-component.sh'];
//
// That list is the shape the 2026-08-04 control audit is about. Its opening
// paragraph: "The assertion is almost always right about the input it is given.
// The input is the defect." A control that resolves globs correctly, over a
// hand-written list of the files it expects to find them in, is one rename away
// from being right about nothing — which is the defect it was written to catch,
// one level up.
//
// So this file does not re-check what that one checks. It reads the gate
// declarations that one never opens, and it enumerates them from `git ls-files`
// rather than naming them:
//
//   1. `platform/coverage-baseline.yaml` — every `command:` list. These are a
//      second, independent declaration of how a component is tested, executed by
//      `scripts/ci/coverage_ratchet.py`, and a vacuous pattern there yields an
//      empty lcov report rather than a failure.
//   2. every tracked `*.sh` / `*.bash`, line by line — the whole set, not two of
//      them. `scripts/test-ci.sh:71` is the instance that matters (it runs this
//      entire directory through a glob), and it is found because it is tracked,
//      not because it is listed.
//   3. every tracked workflow YAML — any `*.yml`/`*.yaml` under a `workflows/`
//      directory, which includes `ventures/*/.github/workflows/`, the tree
//      audit finding 2 shows four other controls cannot see.
//   4. every tracked `package.json` script whose name is *not* one of the seven
//      `gate-collection.test.mjs` filters to. `test:integration` and `test:e2e`
//      are disarmed by exactly the same rename, and are named by workflows.
//
// Resolution is `fs.globSync` — the same glob implementation `node --test` uses
// for its own positional arguments, so the answer here is the answer the runner
// would give — intersected with `git ls-files`. Tracked, not merely present:
// this repository runs many concurrent agents, and a pattern kept alive by
// another session's uncommitted file does not exist in the clone CI checks out.
// A pattern that matches only untracked files is reported separately and just as
// loudly, because it is the same hole with a longer fuse.
//
// WHAT IS EXCLUDED, AND WHY. Both exclusions are emitted as TAP diagnostics on
// every run, so the boundary is visible in the output and not only here.
//
//   - Runners other than `node --test`. `vitest run` prints "No test files
//     found" and exits 1; `pytest` exits 5 on zero collected; `jest`, `mocha`
//     and `playwright` all fail closed the same way. `node --test` is the one
//     that does not, and it is the only one this asserts over. Every command
//     seen using one of the others is counted in the diagnostic, so if one is
//     ever swapped for a fail-open runner the number moves in front of whoever
//     reads the log.
//   - Arguments that are not path-shaped: no `/`, no glob metacharacter, no
//     source extension — `tsx` in `node --import tsx --test`. Flags that consume
//     the following token are listed in VALUE_FLAGS; an unknown one would leave
//     its value looking like a positional, which produces a *false finding*
//     rather than a missed one. That is the correct direction to be wrong in,
//     and the fix is to add the flag rather than to loosen the assertion.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The script names `gate-collection.test.mjs` already sweeps. Skipped here so
 * the two files do not both own the same assertion — a duplicated control is
 * one that can be deleted as a duplicate while taking a real gate with it.
 */
const OWNED_BY_GATE_COLLECTION = new Set([
  'test',
  'build',
  'lint',
  'typecheck',
  'verify',
  'ci',
  'coverage',
]);

/** Flags whose next token is a value, not a file to run. */
const VALUE_FLAGS = new Set([
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--conditions',
  '-C',
  '--env-file',
  '--input-type',
  '--config',
  '-c',
  '--reporter',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-name-pattern',
  '--test-skip-pattern',
  '--test-concurrency',
  '--test-shard',
  '--test-timeout',
  '--test-isolation',
  '--watch-path',
  '--title',
  '--max-old-space-size',
  '-e',
  '--eval',
  '-p',
  '--print',
]);

/** Runners that already exit non-zero when they collect nothing. */
const FAIL_CLOSED_RUNNERS = /\b(vitest|jest|pytest|mocha|ava|playwright)\b/;

const GLOB_CHARS = /[*?[\]{}]/;

// ---------------------------------------------------------------------------
// Command parsing. Deliberately literal, and unit-checked below against inputs
// known to carry a pattern and inputs known not to, because a matcher that
// silently stops matching would pass this file forever while enforcing nothing.
// ---------------------------------------------------------------------------

/** Split a shell command on the operators that chain it, quote-aware. */
export function segments(command) {
  const out = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      out.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === '|') {
      if (command[i + 1] === '|') i += 1;
      out.push(current);
      current = '';
      continue;
    }
    if (ch === ';') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

/** Split a segment into argv, dropping the quote characters themselves. */
export function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quoted = false;
  let quote = null;

  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      quoted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || quoted) tokens.push(current);
      current = '';
      quoted = false;
      continue;
    }
    current += ch;
  }
  if (current || quoted) tokens.push(current);
  return tokens;
}

/** A token that names a file or a set of them, rather than a flag value. */
export function isPathShaped(token) {
  if (token.startsWith('-') || token.includes('=')) return false;
  return token.includes('/') || GLOB_CHARS.test(token) || /\.(m?[jt]sx?|cjs|cts|mts)$/.test(token);
}

/**
 * The test path patterns a `node --test` invocation hands the runner, or null
 * when the segment is not one.
 *
 * `node` is looked for anywhere in the segment rather than at argv[0], because
 * the site that matters is wrapped:
 *
 *     run_ci_test "Dagger CI Engine Unit Tests" node --test "${REPO_ROOT}/..."
 *
 * Anchoring on argv[0] would have skipped `scripts/test-ci.sh:71` entirely —
 * the runner for this whole directory — and the sweep would have reported a
 * clean pass having never looked at it.
 *
 * Returns `{ patterns, skipped }`, so arguments declined as non-paths are
 * available to log rather than silently dropped.
 */
export function nodeTestArguments(segment) {
  const tokens = tokenize(segment);
  const start = tokens.findIndex((token) => /^(?:.*\/)?node$/.test(token));
  if (start === -1) return null;

  const rest = tokens.slice(start + 1);
  if (!rest.some((token) => token === '--test' || token.startsWith('--test='))) return null;

  const patterns = [];
  const skipped = [];
  let positionalsOnly = false;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!positionalsOnly && token === '--') {
      positionalsOnly = true;
      continue;
    }
    if (!positionalsOnly && VALUE_FLAGS.has(token)) {
      i += 1;
      continue;
    }
    if (!positionalsOnly && token.startsWith('-')) continue;
    if (isPathShaped(token)) patterns.push(token);
    else skipped.push(token);
  }

  return { patterns, skipped };
}

// ---------------------------------------------------------------------------
// Enumeration. Every source below comes out of `git ls-files`; nothing here is
// a list of paths someone expected to be interesting.
// ---------------------------------------------------------------------------

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return output.split('\0').filter(Boolean);
}

/** `${REPO_ROOT}/x` and `$GITHUB_WORKSPACE/x` are the repo-relative `x`. */
export function stripRootVariables(pattern) {
  return pattern
    .replace(/\$\{?(REPO_ROOT|GITHUB_WORKSPACE|CI_PROJECT_DIR|PWD)\}?\/?/g, '')
    .replace(/^\.\//, '');
}

/**
 * The `command:` lists in platform/coverage-baseline.yaml, with the component
 * directory each runs in.
 *
 * A four-line reader rather than a YAML dependency: platform/ci has no
 * dependencies at all, and adding one to read eight lines of a register would
 * be a larger change than the control. It is asserted below to have found the
 * components that are there, so a format change fails rather than empties it.
 */
export function coverageBaselineCommands(text) {
  const components = [];
  let current = null;
  let inCommand = false;

  for (const line of text.split('\n')) {
    const start = /^\s{2}-\s+id:\s*(\S+)\s*$/.exec(line);
    if (start) {
      if (current) components.push(current);
      current = { id: start[1], path: '', command: [] };
      inCommand = false;
      continue;
    }
    if (!current) continue;

    const item = /^\s{6,}-\s+(.*?)\s*$/.exec(line);
    if (inCommand && item) {
      current.command.push(item[1].replace(/^(["'])(.*)\1$/, '$2'));
      continue;
    }
    inCommand = false;

    const dir = /^\s{4}path:\s*(\S+)\s*$/.exec(line);
    if (dir) {
      current.path = dir[1];
      continue;
    }
    if (/^\s{4}command:\s*$/.test(line)) inCommand = true;
  }
  if (current) components.push(current);
  return components.filter((component) => component.command.length > 0);
}

/**
 * Every gate command declared outside what gate-collection.test.mjs sweeps.
 *
 * `bases` is the list of directories a relative pattern could resolve against.
 * A package.json script and a coverage-baseline component each have exactly
 * one. A shell line or a workflow step does not — a `run:` block may set
 * `working-directory` and a script may `cd` — so those offer the repo root and
 * the declaring file's own directory, and a pattern counts as resolved if
 * either resolves it. Lenient about *where*; not lenient at all about
 * *whether*, which is the assertion.
 */
export function declaredCommands(tracked) {
  const sites = [];
  const read = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

  for (const relative of tracked) {
    const parts = relative.split('/');
    if (parts.includes('node_modules')) continue;

    if (relative === 'platform/coverage-baseline.yaml') {
      for (const component of coverageBaselineCommands(read(relative))) {
        sites.push({
          source: relative,
          label: `component ${component.id} \`command:\``,
          command: component.command
            .map((token) => (/\s/.test(token) ? `'${token}'` : token))
            .join(' '),
          bases: [component.path],
        });
      }
      continue;
    }

    if (path.basename(relative) === 'package.json') {
      let scripts;
      try {
        scripts = JSON.parse(read(relative)).scripts || {};
      } catch {
        continue;
      }
      const dir = parts.length === 1 ? '' : parts.slice(0, -1).join('/');
      for (const [name, command] of Object.entries(scripts)) {
        if (typeof command !== 'string') continue;
        if (OWNED_BY_GATE_COLLECTION.has(name)) continue;
        sites.push({ source: relative, label: `\`${name}\``, command, bases: [dir] });
      }
      continue;
    }

    const isShell = relative.endsWith('.sh') || relative.endsWith('.bash');
    const isWorkflow =
      parts.includes('workflows') && (relative.endsWith('.yml') || relative.endsWith('.yaml'));
    if (!isShell && !isWorkflow) continue;

    const dir = parts.slice(0, -1).join('/');
    read(relative)
      .split('\n')
      .forEach((line, index) => {
        const text = line.replace(/^\s*(?:-\s*)?(?:run|cmd|entrypoint):\s*/, '').trim();
        if (!text || text.startsWith('#')) return;
        sites.push({ source: relative, label: `line ${index + 1}`, command: text, bases: ['', dir] });
      });
  }

  return sites;
}

/**
 * Match a pattern the way `node --test` matches its own positionals, then keep
 * only what git tracks.
 */
export function resolvePattern(pattern, base, trackedSet) {
  const cleaned = stripRootVariables(pattern);
  let matches = [];
  try {
    matches = fs.globSync(cleaned, { cwd: path.join(REPO_ROOT, base || '') });
  } catch {
    matches = [];
  }
  const relative = matches.map((match) =>
    path.posix.normalize(path.posix.join(base || '', match.split(path.sep).join('/')))
  );
  return { all: relative, tracked: relative.filter((file) => trackedSet.has(file)) };
}

// ---------------------------------------------------------------------------
// Self-checks.
// ---------------------------------------------------------------------------

test('Gate Glob Resolution - the extractor reads every spelling this repository uses', () => {
  const cases = [
    ["node --test 'test/*.test.mjs'", ['test/*.test.mjs']],
    ['node --test test/*.test.mjs', ['test/*.test.mjs']],
    ["node --experimental-strip-types --test 'src/**/*.test.ts'", ['src/**/*.test.ts']],
    ['node --import tsx --test tests/*.test.ts', ['tests/*.test.ts']],
    ['node --import ./register.mjs --test src/**/*.test.ts', ['src/**/*.test.ts']],
    ['node --test a.test.mjs b.test.mjs', ['a.test.mjs', 'b.test.mjs']],
    [
      'node --test --experimental-test-coverage --test-coverage-include=src/** ' +
        '--test-reporter=lcov --test-reporter-destination=$D test/*.test.mjs',
      ['test/*.test.mjs'],
    ],
    // The wrapped form. Anchoring on argv[0] skips scripts/test-ci.sh:71.
    [
      'run_ci_test "Dagger CI Engine Unit Tests" node --test "${REPO_ROOT}/platform/ci/test/"*.test.mjs',
      ['${REPO_ROOT}/platform/ci/test/*.test.mjs'],
    ],
  ];
  for (const [command, expected] of cases) {
    const parsed = nodeTestArguments(command);
    assert.notEqual(parsed, null, `should be recognised as node --test: ${command}`);
    assert.deepEqual(parsed.patterns, expected, command);
  }

  // `--import tsx` must not read as a test path, or every tsx suite is a false
  // finding and the control gets loosened to silence it.
  assert.deepEqual(nodeTestArguments('node --import tsx --test tests/*.test.ts').skipped, []);

  for (const command of [
    'vitest run',
    'pytest tests',
    'node src/pipeline.mjs',
    'eslint .',
    'next build',
    'node --experimental-test-coverage src/main.mjs',
  ]) {
    assert.equal(nodeTestArguments(command), null, `should not be node --test: ${command}`);
  }

  const chained = segments('echo running && node --test "test/*.test.mjs" || true');
  assert.equal(chained.length, 3);
  assert.deepEqual(nodeTestArguments(chained[1]).patterns, ['test/*.test.mjs']);
});

test('Gate Glob Resolution - the resolver tells a live pattern from a dead one', () => {
  const trackedSet = new Set(trackedFiles());
  assert.ok(trackedSet.size > 100, `git ls-files returned ${trackedSet.size} files`);

  const live = resolvePattern('test/*.test.mjs', 'platform/ci', trackedSet);
  assert.ok(live.tracked.length >= 10, 'this directory should resolve to its own many suites');

  // Both ways a pattern goes vacuous: the files renamed, and the directory gone.
  assert.deepEqual(resolvePattern('test/*.spec.mjs', 'platform/ci', trackedSet).tracked, []);
  assert.deepEqual(resolvePattern('test/*.test.mjs', 'platform/nowhere', trackedSet).tracked, []);

  // `*` stops at a slash; `**` crosses. If these ever agree, every pattern
  // resolves and the sweep below reports a clean pass over anything.
  assert.deepEqual(resolvePattern('platform/*/gate-glob-resolution.test.mjs', '', trackedSet).tracked, []);
  assert.ok(resolvePattern('platform/**/*.test.mjs', '', trackedSet).tracked.length >= 10);

  // Repo-root variables must be stripped, or test-ci.sh:71 resolves to nothing
  // and this control reports a finding that is only its own parsing.
  assert.equal(stripRootVariables('${REPO_ROOT}/platform/ci/test/*.test.mjs'), 'platform/ci/test/*.test.mjs');
  assert.ok(
    resolvePattern('${REPO_ROOT}/platform/ci/test/*.test.mjs', '', trackedSet).tracked.length >= 10
  );
});

test('Gate Glob Resolution - the enumeration reaches the sources it claims to', () => {
  const tracked = trackedFiles();
  const sites = declaredCommands(tracked);
  const sources = new Set(sites.map((site) => site.source));

  assert.ok(sites.length > 100, `collected only ${sites.length} declared commands`);

  // Anchors on the three source kinds. These assert that the *enumeration*
  // reached them; the paths are not the input list — every tracked shell script
  // and workflow is read, and these three simply must be among them.
  assert.ok(sources.has('platform/coverage-baseline.yaml'), 'the coverage baseline must be read');
  assert.ok(sources.has('scripts/test-ci.sh'), 'the runner for this directory must be read');
  assert.ok(
    [...sources].some((source) => source.split('/').includes('workflows')),
    'workflow files must be read'
  );

  // The whole tracked set, not a named pair: gate-collection.test.mjs names two
  // shell scripts, and the sweep here must be strictly wider than that.
  const shellSources = [...sources].filter((source) => source.endsWith('.sh'));
  assert.ok(shellSources.length >= 10, `expected every tracked shell script, found ${shellSources.length}`);

  // And the baseline reader must still be reading. A format change that empties
  // it would otherwise leave the assertion below true over nothing.
  const baseline = coverageBaselineCommands(
    fs.readFileSync(path.join(REPO_ROOT, 'platform/coverage-baseline.yaml'), 'utf8')
  );
  assert.ok(baseline.length >= 2, `coverage-baseline.yaml parsed to ${baseline.length} components`);
  for (const component of baseline) {
    assert.ok(component.path, `component ${component.id} has a command but no path`);
  }

  const withPatterns = sites.filter((site) =>
    segments(site.command).some((segment) => {
      const parsed = nodeTestArguments(segment);
      return parsed && parsed.patterns.length > 0;
    })
  );
  assert.ok(
    withPatterns.length >= 3,
    `expected several node --test sites outside package.json gate scripts, found ${withPatterns.length}`
  );
});

// ---------------------------------------------------------------------------
// The gate.
// ---------------------------------------------------------------------------

test('Gate Glob Resolution - every test glob declared outside a gate script resolves', (t) => {
  const tracked = trackedFiles();
  const trackedSet = new Set(tracked);

  const findings = [];
  const resolved = [];
  const skippedArguments = new Set();
  let failClosedRunners = 0;

  for (const site of declaredCommands(tracked)) {
    for (const segment of segments(site.command)) {
      const parsed = nodeTestArguments(segment);
      if (!parsed) {
        if (FAIL_CLOSED_RUNNERS.test(segment)) failClosedRunners += 1;
        continue;
      }
      for (const argument of parsed.skipped) {
        skippedArguments.add(`${site.source} ${site.label}: ${argument}`);
      }
      // `node --test` with no positional argument discovers by its own default
      // rules; there is no declared pattern to resolve.
      if (parsed.patterns.length === 0) continue;

      for (const pattern of parsed.patterns) {
        const attempts = site.bases.map((base) => ({
          base,
          ...resolvePattern(pattern, base, trackedSet),
        }));
        const hit = attempts.find((attempt) => attempt.tracked.length > 0);
        if (hit) {
          resolved.push(
            `${site.source} ${site.label}: '${pattern}' -> ${hit.tracked.length} tracked file(s)` +
              (hit.base ? ` under ${hit.base}/` : '')
          );
          continue;
        }

        const untrackedOnly = attempts.find((attempt) => attempt.all.length > 0);
        findings.push(
          untrackedOnly
            ? `${site.source} ${site.label}: '${pattern}' matches only UNTRACKED files ` +
                `(${untrackedOnly.all.slice(0, 3).join(', ')}) — the gate collects nothing in a clean checkout`
            : `${site.source} ${site.label}: '${pattern}' resolves to ZERO tracked files — ` +
                '`node --test` exits 0 over nothing, so this gate cannot fail'
        );
      }
    }
  }

  for (const line of resolved) t.diagnostic(`resolved: ${line}`);
  for (const line of skippedArguments) t.diagnostic(`not path-shaped, not resolved: ${line}`);
  t.diagnostic(
    `excluded by design: ${failClosedRunners} command(s) on a runner that already exits non-zero ` +
      'over zero collected tests (vitest, jest, pytest, mocha, ava, playwright)'
  );

  assert.deepEqual(
    findings,
    [],
    'declared test globs that collect nothing, so the gate passes over zero assertions:\n' +
      findings.map((line) => `  - ${line}`).join('\n')
  );
});
