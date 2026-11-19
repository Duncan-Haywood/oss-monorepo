// Differential test: patternMatches() against git's own gitignore matcher.
//
// GitHub says CODEOWNERS patterns follow .gitignore rules, with documented
// exceptions (no `!`, no `[ ]`, no `\#`, and `docs/*` does not reach nested
// files). git is the reference implementation of those rules, so this test
// writes one generated pattern at a time to a scratch repository's
// .gitignore, asks `git check-ignore` about a real tree of files and
// directories, and compares every answer with patternMatches().
//
// Compared: every path git matches or rejects directly (no ancestor
// directory matched), and every path git matches through an ancestor
// directory when the pattern's last segment is literal. Left out, on
// purpose:
// - descendants of a directory matched by a wildcard last segment
//   (`docs/*`, `*.js`): GitHub's documented exception to gitignore;
// - `***` and `**` glued to other characters (`a**`): git's wildmatch lets
//   these span '/', which its own docs call "regular asterisks"; what
//   GitHub does there is unknown, and nobody writes them;
// - `!`, `[ ]` and backslashes, which GitHub says do not work.
//
// The first run (2026-11-19) found ~1% of pairs wrong, all one bug: a
// trailing `**` (written, or implied by `dir/`) matched zero segments, so
// `build/` owned a file named `scripts/build`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { patternMatches } from './codeowners.mjs';

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function lcg(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const NAMES = ['a', 'b', 'ab', 'x.js', 'a.md', 'c'];
const SEGS = ['a', 'b', 'ab', '*', '?', '**', 'a*', '*b', '*.js', '*.md', 'x.*', '?b', 'a?', 'c'];
const PINNED = ['c/', 'docs/', 'a/**', 'a/**/', '**/', '**', '/a/', '*.js/', 'a/**/b', '/**/c', 'a/*', 'x.js'];

function compare(seed, patternCount) {
  const rnd = lcg(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const root = mkdtempSync(join(tmpdir(), 'codeowners-git-'));
  try {
    execFileSync('git', ['init', '-q', root], { env: ENV });
    const raw = Array.from({ length: 160 }, () =>
      Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => pick(NAMES)).join('/'));
    const uniq = [...new Set(raw)];
    // a path cannot be both a file and a directory
    const files = uniq.filter((p) => !uniq.some((q) => q.startsWith(`${p}/`)));
    for (const p of files) {
      mkdirSync(join(root, dirname(p)), { recursive: true });
      writeFileSync(join(root, p), '');
    }
    const ancestors = (p) => {
      const s = p.split('/');
      return s.slice(0, -1).map((_, i) => s.slice(0, i + 1).join('/'));
    };
    const queries = [...new Set([...files, ...files.flatMap(ancestors)])];
    const patterns = [...PINNED];
    while (patterns.length < patternCount) {
      let pat = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(SEGS)).join('/');
      if (rnd() < 0.3) pat = `/${pat}`;
      if (rnd() < 0.25) pat = `${pat}/`;
      patterns.push(pat);
    }
    let compared = 0;
    const wrong = [];
    for (const pat of patterns) {
      writeFileSync(join(root, '.gitignore'), `${pat}\n`);
      let out;
      try {
        out = execFileSync('git', ['-C', root, 'check-ignore', '-v', '-n', '--stdin'], {
          input: `${queries.join('\n')}\n`, env: ENV,
        }).toString();
      } catch (e) {
        out = e.stdout.toString(); // exit 1 = nothing matched
      }
      const git = new Map();
      for (const line of out.split('\n').filter(Boolean)) {
        const [source, path] = line.split('\t');
        git.set(path, source !== '::');
      }
      const lastLiteral = !/[*?]/.test(pat.replace(/\/$/, '').split('/').pop());
      for (const p of files) {
        const viaAncestor = ancestors(p).some((q) => git.get(q));
        if (viaAncestor && !lastLiteral) continue; // GitHub's documented exception
        compared++;
        const expected = git.get(p);
        if (patternMatches(pat, p) !== expected) wrong.push(`${pat} vs ${p}: git ${expected}`);
      }
    }
    return { compared, wrong };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('patternMatches agrees with git check-ignore on generated patterns', { skip: !hasGit() && 'git not installed' }, () => {
  for (const seed of [1, 7, 42]) {
    const { compared, wrong } = compare(seed, 120);
    assert.ok(compared > 5000, `seed ${seed}: only ${compared} pairs compared`);
    assert.deepEqual(wrong.slice(0, 10), [], `seed ${seed}: ${wrong.length} of ${compared} pairs disagree`);
  }
});
