/**
 * Every tool that asks git "which commit added this file" must handle the
 * shallow boundary.
 *
 * CI checkouts and agent sessions are shallow clones. git diffs a shallow
 * boundary commit against nothing, so `git log --diff-filter=A` reports it as
 * adding every file in the tree. Code that forgets this reads the clone's
 * horizon as a launch date or an add count. On 2026-11-16 that had put
 * "1,377 ventures added" in 30 days (the whole portfolio) on
 * marisstella.app/dev, and would have dated an old tool as new in feed.xml.
 * Four readers already handled it and two did not.
 *
 * The check is deliberately crude: a non-test source file that runs a
 * `--diff-filter=A` log must also read the boundary list (`rev-parse
 * --git-path shallow`, `.git/shallow`) or ask `--is-shallow-repository`. A file that is right for
 * another reason can go in ALLOWED with that reason.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCANNED = ['platform', 'portfolio', 'prompts', '.claude'];
const SOURCE = /\.(m?js|py|sh)$/;
const IS_TEST = /(\.test\.m?js|(^|\/)test_[^/]*\.py)$/;
// `--diff-filter=A` or `'--diff-filter', 'A'`, not `=AM` or `=AD`.
const ADDS_ONLY = /diff-filter(=|['"]\s*,\s*['"])A(?![A-Za-z])/;
const ALLOWED = new Map([
  // ['path/from/root', 'why the boundary cannot matter here'],
]);

// Reading the boundary list (or asking whether the clone is shallow), not a
// comment that mentions the word: both files fixed on 2026-11-16 said
// "shallow clone" in a comment and still counted the boundary.
const READS_SHALLOW = /--git-path['"]?\s*,?\s*['"]?\s*shallow|is-shallow-repository|\.git\/shallow/;

export function needsShallowGuard(text) {
  return ADDS_ONLY.test(text) && /\blog\b/.test(text) && !READS_SHALLOW.test(text);
}

test('the pattern sees the forms the repository uses, and nothing wider', () => {
  assert.ok(needsShallowGuard("git log --diff-filter=A -- x"));
  assert.ok(needsShallowGuard("['log', ref, '--diff-filter=A', '--name-only']"));
  assert.ok(needsShallowGuard("['git', 'log', '--diff-filter', 'A']"));
  assert.ok(!needsShallowGuard("git diff --name-only --diff-filter=AM origin/main"));
  assert.ok(needsShallowGuard("git log --diff-filter=A  // a shallow clone sees one commit"));
  assert.ok(!needsShallowGuard("git log --diff-filter=A; git rev-parse --git-path shallow"));
  assert.ok(!needsShallowGuard("['log', '--diff-filter=A']; git(['rev-parse', '--git-path', 'shallow'])"));
  assert.ok(!needsShallowGuard("git log --diff-filter=A; git rev-parse --is-shallow-repository"));
});

test('every git log --diff-filter=A reader handles the shallow boundary', () => {
  const tracked = execFileSync('git', ['ls-files', '--', ...SCANNED], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((rel) => SOURCE.test(rel) && !IS_TEST.test(rel) && !ALLOWED.has(rel));
  const missing = [];
  for (const rel of tracked) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    if (needsShallowGuard(text)) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    'these files count adds with git log but never skip shallow boundary commits (see platform/daily/collect.mjs for the pattern)',
  );
});
