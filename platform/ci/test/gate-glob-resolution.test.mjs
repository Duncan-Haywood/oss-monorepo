// A gate whose test glob matches nothing is a gate that passes over zero
// assertions, and every other control in this directory reads it as healthy.
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
// Verified on Node 22.22.3, and identically through `npm test`. Renaming five
// files disarmed the only gate on the one venture with a public customer
// surface, and nothing went red. The unquoted spelling behaves the same way:
// the shell leaves an unmatched pattern literal, and `node --test` globs its
// own positional arguments, so `node --test test/*.test.mjs` with no matches is
// also exit 0. A literal non-glob path that does not exist *is* an error
// (exit 1) — the fail-open belongs to the pattern, not to the missing file.
//
// The existing controls all stop one question short of this:
//
//   - `gate-substance.test.mjs` asks whether a gate command is capable of
//     failing. Its classifier (`isInertSegment`) returns "real" for anything it
//     does not recognise as an echo or an inline `node -e`, and
//     `node --test '<glob>'` is real *as a command*. Whether the glob resolves
//     is outside what a text classifier can see.
//   - `gate-wiring.test.mjs` asks whether anything invokes the gate. Something
//     does; it invokes it over nothing.
//   - `verify-contract.test.mjs` asks whether the declarations agree with each
//     other. They agree perfectly on a pattern that matches no file.
//
// So this file asks the remaining question: for every declared gate command in
// the repository that hands a glob to a test runner, does that glob resolve to
// at least one *tracked* file. Tracked, not merely present on disk: this
// repository runs many concurrent agents, and a pattern kept alive by another
// session's uncommitted working file is not coverage that survives a clean
// checkout.
//
// WHAT IS COLLECTED (deliberately enumerated, never hardcoded — a hardcoded
// input list is the exact defect class this control exists to close):
//
//   1. every tracked `package.json`, every entry in its `scripts` map;
//   2. every `command:` list in `platform/coverage-baseline.yaml`, which is a
//      second, independent declaration of how a component is tested;
//   3. every tracked `*.sh`, line by line — this is where `scripts/test-ci.sh:71`
//      lives, the runner for this whole directory;
//   4. every tracked workflow YAML (any `*.yml`/`*.yaml` under a `workflows/`
//      directory, in `.gitea/`, `.github/`, or a venture's own `.github/`).
//
// WHAT IS EXCLUDED, AND WHY (each is `log()`ged at run time so the boundary is
// visible in the TAP output rather than only in this comment):
//
//   - Runners other than `node --test`. `vitest run`, `pytest` and `jest` all
//     exit non-zero when they collect no tests, so a vacuous pattern there
//     already fails closed. `node --test` is the one that does not. Every such
//     command seen is logged, so if one is ever swapped for a fail-open runner
//     the list is in front of whoever reads the output.
//   - Positional arguments that are not path-shaped (no `/`, no glob
//     metacharacter, no file extension) — `tsx` in `node --import tsx --test`,
//     for instance. These are logged individually. Note that flags taking a
//     separate value are consumed by name (`VALUE_FLAGS` below); an unknown
//     one would make its value look like a positional, which produces a false
//     finding rather than a missed one. That is the correct direction to be
//     wrong in, and the fix is to add the flag.
//
// Resolution uses `fs.globSync`, the same glob implementation `node --test`
// uses for its positionals, so the answer here is the answer the runner would
// give — then intersected with `git ls-files`. A pattern that matches only
// untracked files is reported separately and just as loudly, because it is the
// same hole with a longer fuse.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Flags that consume the following token, so it is not a test path. */
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

/** Test runners that already exit non-zero when they collect nothing. */
const FAIL_CLOSED_RUNNERS = /\b(vitest|jest|pytest|mocha|ava|playwright|tsc|eslint)\b/;

const GLOB_CHARS = /[*?[\]{}]/;

// ---------------------------------------------------------------------------
// Command parsing. Deliberately literal, like the other detectors here: it
// reads text, and every piece is unit-checked below against inputs known to
// carry a glob and inputs known not to.
// ---------------------------------------------------------------------------

/** Split a shell command on the operators that chain scripts, quote-aware. */
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

/** Split a segment into argv, dropping quote characters. */
export function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quoted = false;
  let quote = null;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
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
      if (current || quoted) {
        tokens.push(current);
        current = '';
        quoted = false;
      }
      continue;
    }
    current += ch;
  }
  if (current || quoted) tokens.push(current);
  return tokens;
}

/** A positional that names a file or a set of them, rather than a flag value. */
export function isPathShaped(token) {
  return token.includes('/') || GLOB_CHARS.test(token) || /\.[cm]?[jt]sx?$/.test(token);
}

/**
 * The test path patterns a `node --test` invocation passes to the runner, or
 * null when the segment is not a `node --test` invocation at all.
 *
 * Returns `{ patterns, skipped }` so the arguments this declined to treat as
 * paths can be logged rather than silently dropped.
 */
export function nodeTestArguments(segment) {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
  if (i >= tokens.length) return null;
  if (!/^(?:.*\/)?node$/.test(tokens[i])) return null;
  i += 1;

  if (!tokens.slice(i).some((token) => token === '--test' || token.startsWith('--test='))) {
    return null;
  }

  const patterns = [];
  const skipped = [];
  let positionalsOnly = false;

  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
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
// Enumeration of every place a gate command is declared.
// ---------------------------------------------------------------------------

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return output.split('\0').filter(Boolean);
}

/** `${REPO_ROOT}/x` and `$GITHUB_WORKSPACE/x` are repo-relative `x`. */
function stripRootVariables(pattern) {
  return pattern
    .replace(/\$\{?(REPO_ROOT|GITHUB_WORKSPACE|CI_PROJECT_DIR|PWD)\}?\/?/g, '')
    .replace(/^\.\//, '');
}

function parseCoverageBaselineCommands(text) {
  const lines = text.split('\n');
  const components = [];
  let current = null;
  let inCommand = false;

  for (const line of lines) {
    const start = /^\s{2}-\s+id:\s*(\S+)\s*$/.exec(line);
    if (start) {
      if (current) components.push(current);
      current = { id: start[1], path: null, command: [] };
      inCommand = false;
      continue;
    }
    if (!current) continue;

    const item = /^\s{6,}-\s+(.*?)\s*$/.exec(line);
    if (inCommand && item) {
      current.command.push(item[1].replace(/^["'](.*)["']$/, '$1'));
      continue;
    }
    inCommand = false;

    const pathKey = /^\s{4}path:\s*(\S+)\s*$/.exec(line);
    if (pathKey) {
      current.path = pathKey[1];
      continue;
    }
    if (/^\s{4}command:\s*$/.test(line)) {
      inCommand = true;
      continue;
    }
  }
  if (current) components.push(current);
  return components.filter((component) => component.command.length > 0);
}

/**
 * Every declared command in the repository, with the directory it runs in.
 *
 * `base` is the directory a relative pattern is resolved against. For a
 * package.json script that is unambiguous. For a shell script or a workflow
 * step it is not — a `run:` block may set `working-directory`, and a shell
 * script may `cd` — so those declare their base as a list of candidates
 * (repo root and the declaring file's own directory) and a pattern counts as
 * resolved if any candidate resolves it. That is lenient about *where*, and
 * not lenient at all about *whether*: a pattern matching nothing anywhere is
 * still a finding.
 */
export function declaredCommands(tracked) {
  const sites = [];
  const read = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

  for (const relative of tracked) {
    if (relative.split('/').includes('node_modules')) continue;

    if (path.basename(relative) === 'package.json') {
      let scripts;
      try {
        scripts = JSON.parse(read(relative)).scripts || {};
      } catch {
        continue;
      }
      const dir = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
      for (const [name, command] of Object.entries(scripts)) {
        if (typeof command !== 'string') continue;
        sites.push({ source: relative, label: `\`${name}\``, command, bases: [dir] });
      }
      continue;
    }

    if (relative === 'platform/coverage-baseline.yaml') {
      for (const component of parseCoverageBaselineCommands(read(relative))) {
        sites.push({
          source: relative,
          label: `component ${component.id} \`command:\``,
          command: component.command.map((token) => (/\s/.test(token) ? `'${token}'` : token)).join(' '),
          bases: [component.path || ''],
        });
      }
      continue;
    }

    const isShell = relative.endsWith('.sh') || relative.endsWith('.bash');
    const isWorkflow =
      relative.split('/').includes('workflows') &&
      (relative.endsWith('.yml') || relative.endsWith('.yaml'));
    if (!isShell && !isWorkflow) continue;

    const dir = path.posix.dirname(relative);
    read(relative)
      .split('\n')
      .forEach((line, index) => {
        const text = line.replace(/^\s*(?:-\s*)?(?:run|cmd):\s*/, '').trim();
        if (!text || text.startsWith('#')) return;
        sites.push({
          source: relative,
          label: `line ${index + 1}`,
          command: text,
          bases: ['', dir],
        });
      });
  }

  return sites;
}

// ---------------------------------------------------------------------------
// Resolution.
// ---------------------------------------------------------------------------

/**
 * Match a glob the way `node --test` matches its own positional arguments,
 * then keep only the results git is tracking.
 */
export function resolvePattern(pattern, base, trackedSet) {
  const cleaned = stripRootVariables(pattern);
  const cwd = path.join(REPO_ROOT, base || '');
  let matches = [];
  try {
    matches = fs.globSync(cleaned, { cwd });
  } catch {
    matches = [];
  }
  const relative = matches.map((match) =>
    path.posix.normalize(path.posix.join(base || '', match.split(path.sep).join('/')))
  );
  return {
    all: relative,
    tracked: relative.filter((file) => trackedSet.has(file)),
  };
}

// ---------------------------------------------------------------------------
// Detector self-checks. A collector that stops collecting would pass every
// assertion below it forever, which is one level up of the same defect.
// ---------------------------------------------------------------------------

test('Gate Glob Resolution - the parser finds the glob in every spelling used here', () => {
  const cases = [
    ["node --test 'test/*.test.mjs'", ['test/*.test.mjs']],
    ['node --test test/*.test.mjs', ['test/*.test.mjs']],
    ["node --experimental-strip-types --test 'src/**/*.test.ts'", ['src/**/*.test.ts']],
    ['node --import tsx --test tests/*.test.ts', ['tests/*.test.ts']],
    ['node --test "${REPO_ROOT}/platform/ci/test/"*.test.mjs', ['${REPO_ROOT}/platform/ci/test/*.test.mjs']],
    [
      'node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=$X test/*.test.mjs',
      ['test/*.test.mjs'],
    ],
    ['node --test a.test.mjs b.test.mjs', ['a.test.mjs', 'b.test.mjs']],
  ];
  for (const [command, expected] of cases) {
    const parsed = nodeTestArguments(command);
    assert.notEqual(parsed, null, `should be recognised as node --test: ${command}`);
    assert.deepEqual(parsed.patterns, expected, command);
  }

  // `--import tsx` must not read as a test path, or every tsx suite becomes a
  // false finding and the control gets weakened to shut it up.
  assert.deepEqual(nodeTestArguments('node --import tsx --test tests/*.test.ts').skipped, []);

  for (const command of ['vitest run', 'pytest tests', 'node src/pipeline.mjs', 'eslint .', 'next build']) {
    assert.equal(nodeTestArguments(command), null, `should not be node --test: ${command}`);
  }

  // Chaining must not hide the runner behind another command.
  const chained = segments('echo running && node --test "test/*.test.mjs" || true');
  assert.equal(chained.length, 3);
  assert.deepEqual(nodeTestArguments(chained[1]).patterns, ['test/*.test.mjs']);
});

test('Gate Glob Resolution - resolution separates a real glob from a vacuous one', () => {
  const tracked = new Set(trackedFiles());
  assert.ok(tracked.size > 100, `git ls-files returned ${tracked.size} files`);

  const real = resolvePattern('tests/*.test.mjs', 'portfolio/marisstella-homepage', tracked);
  assert.ok(real.tracked.length > 0, 'the homepage suite must resolve to tracked files');

  // The mutation this control exists to catch, spelled as a pattern.
  const renamed = resolvePattern('test/*.test.mjs', 'portfolio/marisstella-nowhere', tracked);
  assert.deepEqual(renamed.tracked, [], 'a pattern under a missing directory must resolve to nothing');
  const vacuous = resolvePattern('test/*.spec.mjs', 'portfolio/marisstella-homepage', tracked);
  assert.deepEqual(vacuous.tracked, [], 'a pattern matching no file must resolve to nothing');
});

test('Gate Glob Resolution - the enumeration reaches the gates it claims to', () => {
  const tracked = trackedFiles();
  const sites = declaredCommands(tracked);

  const sources = new Set(sites.map((site) => site.source));
  assert.ok(sites.length > 200, `collected only ${sites.length} declared commands`);

  // The catalog is the executed truth; every node/pnpm component's package.json
  // must be inside what was collected, or the enumeration has a hole shaped
  // like the one being closed.
  const missing = [];
  for (const component of VENTURE_CATALOG) {
    if (component.type !== 'node' && component.type !== 'pnpm') continue;
    const manifest = path.posix.join(component.packageDir || component.dir, 'package.json');
    if (!fs.existsSync(path.join(REPO_ROOT, manifest))) continue;
    if (!sources.has(manifest)) missing.push(`${component.id}: ${manifest} was not collected`);
  }
  assert.deepEqual(missing, [], `catalog components outside the scan:\n${missing.join('\n')}`);

  // Named anchors, not a hardcoded input list: these are the sites the audit
  // substantiated, and each must be *present in what was enumerated*. If a
  // refactor moves them out of reach, this fails instead of quietly narrowing.
  assert.ok(
    sources.has('portfolio/marisstella-homepage/package.json'),
    'the only gate on the venture in production must be in the scan'
  );
  assert.ok(sources.has('scripts/test-ci.sh'), 'the runner for this directory must be in the scan');
  assert.ok(
    sources.has('platform/coverage-baseline.yaml'),
    'the coverage baseline declares node --test commands and must be in the scan'
  );

  const withGlobs = sites.filter((site) =>
    segments(site.command).some((segment) => {
      const parsed = nodeTestArguments(segment);
      return parsed && parsed.patterns.some((pattern) => GLOB_CHARS.test(pattern));
    })
  );
  assert.ok(
    withGlobs.length >= 5,
    `expected several node --test glob sites, found ${withGlobs.length} — the extractor has stopped extracting`
  );
});

// ---------------------------------------------------------------------------
// The gate itself.
// ---------------------------------------------------------------------------

test('Gate Glob Resolution - every declared test glob resolves to a tracked file', (t) => {
  const tracked = trackedFiles();
  const trackedSet = new Set(tracked);
  const sites = declaredCommands(tracked);

  const findings = [];
  const resolved = [];
  const otherRunners = new Set();
  const skippedArguments = new Set();

  for (const site of sites) {
    for (const segment of segments(site.command)) {
      const parsed = nodeTestArguments(segment);
      if (!parsed) {
        if (FAIL_CLOSED_RUNNERS.test(segment)) otherRunners.add(segment.trim());
        continue;
      }
      for (const argument of parsed.skipped) {
        skippedArguments.add(`${site.source} ${site.label}: ${argument}`);
      }
      if (parsed.patterns.length === 0) {
        // `node --test` with no positional arguments discovers by its own
        // default rules; there is no declared pattern to resolve.
        continue;
      }

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
                `(${untrackedOnly.all.slice(0, 3).join(', ')}) — the gate is empty in a clean checkout`
            : `${site.source} ${site.label}: '${pattern}' resolves to ZERO tracked files — ` +
                `\`node --test\` exits 0 over nothing, so this gate cannot fail`
        );
      }
    }
  }

  for (const line of resolved) t.diagnostic(`resolved: ${line}`);
  for (const line of skippedArguments) t.diagnostic(`not path-shaped, not resolved: ${line}`);
  t.diagnostic(
    `excluded by design: ${otherRunners.size} command(s) using a runner that already exits ` +
      'non-zero on zero collected tests (vitest, jest, pytest, mocha, ava, playwright, tsc, eslint)'
  );

  assert.deepEqual(
    findings,
    [],
    'declared test globs that match nothing, so the gate passes over zero assertions:\n' +
      findings.map((line) => `  - ${line}`).join('\n')
  );
});
