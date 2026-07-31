import assert from 'node:assert/strict';
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

test('CODEOWNERS Contract - the controls that decide a green run are owned', () => {
  // These are the files that can waive a gate as effectively as editing the
  // gate: the suppression register, the audit that reads it, the CI engine, and
  // the script that registers repository-wide gates. Losing review on any of
  // them is indistinguishable from losing the gate.
  const mustBeOwned = [
    'scripts/ci/',
    'scripts/test-ci.sh',
    'platform/ci/',
    'platform/exception-register.yaml',
    'SECURITY_ROADMAP.md',
  ];

  const patterns = new Set(rules().map(({ pattern }) => pattern.replace(/^\//, '')));
  const unowned = mustBeOwned.filter((entry) => !patterns.has(entry));

  assert.deepEqual(unowned, [], `unowned control surfaces: ${unowned.join(', ')}`);
});
