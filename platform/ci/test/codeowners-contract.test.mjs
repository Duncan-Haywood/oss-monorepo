import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CODEOWNERS = path.join(REPO_ROOT, '.gitea/CODEOWNERS');

/**
 * A CODEOWNERS rule that matches no file is worse than a missing rule, because
 * it reads as coverage from the outside and reviews nothing.
 *
 * `/SECURITY-ROADMAP.md` was one of these. The tracked file is
 * `SECURITY_ROADMAP.md` — underscore, not hyphen — so the register holding the
 * repository's recorded HIGH findings could be edited without review, while the
 * file said security owned it. This is the same shape as every other gate this
 * repository has had to repair: a control that is declared, looks present, and
 * does not execute.
 *
 * The check is deliberately literal. It does not attempt to model Gitea's
 * matching rules; it asserts only that each rule's path exists on disk, which
 * is enough to catch the typo and the stale rule left behind by a rename.
 */

function rules() {
  return fs
    .readFileSync(CODEOWNERS, 'utf8')
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line && !line.startsWith('#'))
    .map(({ line, number }) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners, number };
    });
}

test('CODEOWNERS Contract - every rule matches a path that exists', () => {
  const missing = [];
  for (const { pattern, number } of rules()) {
    // Wildcards are a legitimate way to write a rule; only literal paths can be
    // resolved this way, so leave the rest to Gitea.
    if (/[*?[\]]/.test(pattern)) continue;

    const relative = pattern.replace(/^\//, '');
    const target = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(target)) {
      missing.push(`.gitea/CODEOWNERS:${number} — '${pattern}' matches nothing`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    'CODEOWNERS rules that review nothing:\n' +
      missing.map((line) => `  - ${line}`).join('\n')
  );
});

test('CODEOWNERS Contract - every rule names at least one owner', () => {
  const unowned = rules()
    .filter(({ owners }) => owners.length === 0 || !owners.every((o) => o.startsWith('@')))
    .map(({ pattern, number }) => `.gitea/CODEOWNERS:${number} — '${pattern}'`);

  assert.deepEqual(unowned, [], `rules with no valid owner: ${unowned.join(', ')}`);
});

/**
 * Does a CODEOWNERS pattern cover this path?
 *
 * Deliberately conservative — it models less than Gitea does, so a rule it
 * reads as covering really does cover. A directory rule covers what is under
 * it, a literal file rule covers that file, and a wildcard rule is expanded
 * segment-wise. Anything it cannot decide it declines, which errs toward
 * reporting a file unowned rather than toward inventing coverage.
 */
function covers(pattern, target) {
  const rule = pattern.replace(/^\//, '');
  if (rule.endsWith('/')) return target === rule || target.startsWith(rule);
  if (/[*?[\]]/.test(rule)) {
    const source =
      '^' +
      rule
        .split(/(\*\*|\*|\?)/)
        .map((piece) => {
          if (piece === '**') return '.*';
          if (piece === '*') return '[^/]*';
          if (piece === '?') return '[^/]';
          return piece.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        })
        .join('') +
      '(/.*)?$';
    return new RegExp(source).test(target);
  }
  return target === rule || target.startsWith(`${rule}/`);
}

/**
 * Every tracked YAML directly under `platform/`. These are the declared
 * budgets, baselines and registers — the numbers that decide whether a gate is
 * allowed to report green. Derived rather than listed, because the five-entry
 * hardcoded list this replaced stopped at `exception-register.yaml` and seven
 * budget files added after it were reviewed by nobody.
 */
function trackedPlatformYaml() {
  return execFileSync('git', ['ls-files', 'platform/*.yaml'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.split('/').length === 2)
    .sort();
}

test('CODEOWNERS Contract - the controls that decide a green run are owned', () => {
  // The first group is the files that can waive a gate as effectively as
  // editing the gate: the suppression register, the audit that reads it, the CI
  // engine, and the script that registers repository-wide gates. The second is
  // derived from the tree, so a budget file added tomorrow fails this contract
  // until someone owns it — the hardcoded half is what let the first seven
  // through.
  const mustBeOwned = [
    'scripts/ci/',
    'scripts/test-ci.sh',
    'platform/ci/',
    'platform/exception-register.yaml',
    'SECURITY_ROADMAP.md',
    ...trackedPlatformYaml(),
  ];

  const declared = rules();
  const unowned = mustBeOwned.filter(
    (entry) => !declared.some(({ pattern }) => covers(pattern, entry))
  );

  assert.deepEqual(
    unowned,
    [],
    'control surfaces and declared budgets no CODEOWNERS rule reviews:\n' +
      unowned.map((entry) => `  - ${entry}`).join('\n')
  );
});
