import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * `mktemp` substitutes a run of `X`s only when that run is at the END of the
 * template. Put anything after it and the call stops producing a temporary file
 * — without saying so on the platform most of this repository is written on.
 *
 * This is not hypothetical. `scripts/test-ci.sh` carried
 *
 *     POLICY_SCAN_REPORT="$(mktemp "${TMPDIR:-/tmp}/repository-policy-scan.XXXXXX.md")"
 *
 * from 2026-08-08 (`2d83f3c4`) to 2026-08-16, and the line exists for a stated
 * security reason: the repository policy scan's default output is the *tracked*
 * `security-scan-report.md`, and a gate that rewrites a tracked file as a side
 * effect of measuring is how `pytest` came to mutate `SECURITY_ROADMAP.md`. So
 * the report was moved to a temporary file. With the `.md` after the `X`s it
 * was not a temporary file:
 *
 *   - BSD/macOS `mktemp` takes the template literally. It created the fixed,
 *     predictable, world-known path `$TMPDIR/repository-policy-scan.XXXXXX.md`
 *     — every process on the host can name it in advance — and then failed
 *     `mkstemp failed on … : File exists` on every subsequent run. `test-ci.sh`
 *     is `set -euo pipefail`, so the second `scripts/verify-all.sh` on any
 *     developer machine aborted the entire verification at that line.
 *   - GNU `mktemp` refuses a template whose `X`s are not trailing outright, so
 *     on the Linux runners the same line fails on the first run.
 *
 * Both halves of the intent were lost — the file was neither unpredictable nor
 * unique — and the failure arrived as a runner crash in an unrelated-looking
 * place rather than as anything naming the scan.
 *
 * The rule below is static and reads text, because that is the only form that
 * gives the same answer on a laptop and a runner. `probes the platform` beneath
 * it is the evidence that the rule is about a real defect rather than a style
 * preference: it runs the real `mktemp` twice against a bad template and a good
 * one, and asserts only the good one yields two distinct files.
 *
 * Scripts are enumerated from `git ls-files`, never from a filesystem walk, for
 * the reason `gate-glob-resolution.test.mjs` gives: a walk reads `node_modules`
 * and another agent's untracked working copy, and answers differently in a
 * clone than in a shared tree.
 */

const TRAILING_X = /X{3,}$/;
const AT_LEAST_THREE_X = /X{3,}/;

function git(args) {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function trackedShellScripts() {
  return git(['ls-files', '--', '*.sh', '*.bash'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

/**
 * Blank out the comment part of a shell line, so prose is never read as a call.
 *
 * The rule above has to be stated somewhere, and the natural place is a comment
 * beside the line that got it wrong — `scripts/test-ci.sh` does exactly that.
 * But a sweep that reads its own explanation as a violation makes deleting the
 * explanation the cheapest way to get green, which is the one outcome this
 * control exists to prevent. Today that file passes only because its comment
 * happens to wrap before the word `mktemp` meets the bad template; re-flowing
 * the paragraph turns the gate red with no change to any code. Verified
 * 2026-08-16 by joining them onto one line — `every mktemp template ends in its
 * X run` failed.
 *
 * The fix is not an exemption for that file. Exempting it would blind the sweep
 * in the single place already known to have had this defect (cf.
 * `fixture-assembles-prohibited-strings`: assemble the marker, never exempt the
 * file). A `#` comment simply is not an invocation.
 *
 * Full-line comments go entirely. A trailing comment goes only when the quotes
 * ahead of it are balanced, so a `#` inside a string literal is left alone.
 */
export function stripShellComment(line) {
  if (/^\s*#/.test(line)) return '';
  const hash = line.search(/\s#/);
  if (hash === -1) return line;
  const before = line.slice(0, hash);
  const balanced = (quote) => (before.split(quote).length - 1) % 2 === 0;
  return balanced('"') && balanced("'") ? before : line;
}

/**
 * Pull the template argument out of every `mktemp` invocation on a line.
 *
 * Deliberately literal: it does not parse bash. A template is any argument
 * token that contains a run of three or more `X`s, which is the only shape
 * `mktemp` treats as a template at all. `mktemp` with no template, and
 * `mktemp -d`/`-u` with one, are all covered — the flag is irrelevant to where
 * the `X`s must sit.
 *
 * Returns `{ raw, template }` per finding, where `template` has one layer of
 * surrounding quotes removed so `"…XXXXXX"` and `…XXXXXX` compare the same.
 */
export function mktempTemplatesOnLine(line) {
  const found = [];
  const call = /\bmktemp\b([^\n;|&)]*)/g;
  let match;
  while ((match = call.exec(line)) !== null) {
    const args = match[1];
    for (const token of args.split(/\s+/)) {
      const raw = token.trim();
      if (!raw || raw.startsWith('-')) continue;
      if (!AT_LEAST_THREE_X.test(raw)) continue;
      let template = raw;
      // Strip a trailing `)` or `"` left by the command substitution around it,
      // then one balanced layer of quotes.
      template = template.replace(/[)"']+$/, (tail) => (tail.includes(')') ? '' : tail));
      if (
        (template.startsWith('"') && template.endsWith('"')) ||
        (template.startsWith("'") && template.endsWith("'"))
      ) {
        template = template.slice(1, -1);
      }
      template = template.replace(/["')]+$/, '');
      found.push({ raw, template });
    }
  }
  return found;
}

function findings() {
  const scripts = trackedShellScripts();
  const invocations = [];
  const violations = [];
  for (const rel of scripts) {
    const abs = path.join(REPO_ROOT, rel);
    let source;
    try {
      source = fs.readFileSync(abs, 'utf8');
    } catch {
      // A tracked path that is not readable is a failure, not a skip: a check
      // that goes quiet on the input it cannot read passes for the wrong reason.
      violations.push({ file: rel, line: 0, template: '', reason: 'unreadable' });
      continue;
    }
    source.split('\n').forEach((line, index) => {
      for (const { raw, template } of mktempTemplatesOnLine(stripShellComment(line))) {
        invocations.push({ file: rel, line: index + 1, raw, template });
        if (!TRAILING_X.test(template)) {
          violations.push({ file: rel, line: index + 1, template: raw, reason: 'x-not-trailing' });
        }
      }
    });
  }
  return { scripts, invocations, violations };
}

test('every mktemp template ends in its X run', () => {
  const { violations } = findings();
  assert.deepEqual(
    violations.map((v) => `${v.file}:${v.line} ${v.template} (${v.reason})`),
    [],
    'mktemp only substitutes a run of Xs that ends the template. Anything after ' +
      'it makes the path fixed and predictable on BSD and an outright error on ' +
      'GNU. Move the suffix off, or create the file and rename it afterwards.'
  );
});

test('it finds mktemp templates at all, so an empty pass cannot look like a green one', () => {
  const { scripts, invocations } = findings();
  assert.ok(
    scripts.length >= 10,
    `git ls-files -- '*.sh' '*.bash' returned ${scripts.length} script(s); the pathspec is wrong ` +
      'and every assertion above is vacuous.'
  );
  assert.ok(
    invocations.length >= 3,
    `only ${invocations.length} mktemp template(s) were parsed out of ${scripts.length} tracked ` +
      'scripts. The repository has always had more than that; the parser has stopped matching.'
  );
});

test('the detector separates the safe shape from the broken one', () => {
  const safe = [
    'test_root="$(mktemp -d "${TMPDIR:-/tmp}/security-scan-test.XXXXXX")"',
    'FINDINGS_TMP=$(mktemp)',
    'f=$(mktemp /tmp/plain.XXXXXXXXXX)',
    "f=$(mktemp '/tmp/single-quoted.XXXXXX')",
  ];
  const broken = [
    'REPORT="$(mktemp "${TMPDIR:-/tmp}/repository-policy-scan.XXXXXX.md")"',
    'f=$(mktemp /tmp/report.XXXXXX.json)',
    'd=$(mktemp -d /tmp/work.XXXXXX/inner)',
  ];

  for (const line of safe) {
    for (const { raw, template } of mktempTemplatesOnLine(line)) {
      assert.ok(
        TRAILING_X.test(template),
        `false positive: ${raw} in ${line} parsed to ${template}`
      );
    }
  }
  for (const line of broken) {
    const parsed = mktempTemplatesOnLine(line);
    assert.equal(parsed.length, 1, `expected one template in: ${line}`);
    assert.ok(
      !TRAILING_X.test(parsed[0].template),
      `missed a hole: ${parsed[0].raw} in ${line} parsed to ${parsed[0].template}`
    );
  }
});

test('probes the platform: only a trailing X run yields two distinct temporary files', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mktemp-template-probe-'));
  try {
    const run = (template) =>
      spawnSync('mktemp', [template], { encoding: 'utf8' });

    const goodTemplate = path.join(scratch, 'good.XXXXXX');
    const first = run(goodTemplate);
    const second = run(goodTemplate);
    assert.equal(first.status, 0, `mktemp refused a well-formed template: ${first.stderr}`);
    assert.equal(second.status, 0, `mktemp refused a well-formed template: ${second.stderr}`);
    assert.notEqual(
      first.stdout.trim(),
      second.stdout.trim(),
      'two runs of a well-formed template returned the same path'
    );

    const badTemplate = path.join(scratch, 'bad.XXXXXX.md');
    const firstBad = run(badTemplate);
    const secondBad = run(badTemplate);
    const bothSucceededDistinctly =
      firstBad.status === 0 &&
      secondBad.status === 0 &&
      firstBad.stdout.trim() !== secondBad.stdout.trim();
    assert.ok(
      !bothSucceededDistinctly,
      'this platform substituted a non-trailing X run, which no released mktemp does. ' +
        'Read the docblock above before relaxing the static rule — the rule is about ' +
        'portability, and the runners are Linux.'
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('prose about the broken shape is read as prose, not as a call to it', () => {
  // The comment beside the fixed line in scripts/test-ci.sh must be free to say
  // what the broken form was. Without this, the sweep reports its own
  // documentation and the cheapest green is to delete the warning.
  const documented = '# Never write mktemp "${TMPDIR:-/tmp}/scan.XXXXXX.md" — the X run must end it.';
  assert.deepEqual(mktempTemplatesOnLine(stripShellComment(documented)), []);

  // Trailing comments too, which is how these paragraphs usually get re-flowed.
  const trailing = 'd="$(mktemp -d "${TMPDIR:-/tmp}/scan.XXXXXX")"  # not scan.XXXXXX.md';
  assert.deepEqual(
    mktempTemplatesOnLine(stripShellComment(trailing)).map((f) => f.template),
    ['${TMPDIR:-/tmp}/scan.XXXXXX'],
  );

  // But a real call is still caught on a line that merely ends in a comment,
  // and a `#` inside a string must not truncate the line.
  assert.deepEqual(
    mktempTemplatesOnLine(stripShellComment('f=$(mktemp /tmp/a.XXXXXX.md)  # report')).map(
      (f) => f.template,
    ),
    ['/tmp/a.XXXXXX.md'],
  );
  assert.deepEqual(
    mktempTemplatesOnLine(stripShellComment('f=$(mktemp "/tmp/c#1.XXXXXX.md")')).map(
      (f) => f.template,
    ),
    ['/tmp/c#1.XXXXXX.md'],
  );
});
