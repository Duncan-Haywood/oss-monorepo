import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { FORMAT, parseLog, parseCommit, suggestBump, bumpVersion, group, render, summarize } from './changelog.mjs';

const rec = (subject, body = '', author = 'Ann', hash = 'abcdef1234567') => `${hash}\x1f${author}\x1f${subject}\x1f${body}\x1e\n`;

test('parses conventional commits with scope, bang and PR number', () => {
  const c = parseCommit({ subject: 'feat(api)!: drop v1 endpoints (#42)', hash: 'abcdef1234' });
  assert.deepEqual([c.type, c.scope, c.breaking, c.desc, c.pr, c.conventional], ['feat', 'api', true, 'drop v1 endpoints', '42', true]);
});

test('BREAKING CHANGE footer marks breaking and keeps the note', () => {
  const c = parseCommit({ subject: 'fix: tighten parser', body: 'BREAKING CHANGE: inputs over 1MB are rejected\n\nmore' });
  assert.equal(c.breaking, true);
  assert.equal(c.breakingNote, 'inputs over 1MB are rejected');
});

test('non-conventional subjects are classified by leading verb, else other', () => {
  assert.equal(parseCommit({ subject: 'Add dark mode' }).type, 'feat');
  assert.equal(parseCommit({ subject: 'Fixed nothing, tbh' }).type, 'other');
  assert.equal(parseCommit({ subject: 'Fix crash on empty file' }).type, 'fix');
  assert.equal(parseCommit({ subject: 'wip' }).conventional, false);
  assert.equal(parseCommit({ subject: 'unknown: thing' }).type, 'other');
});

test('semver bump suggestion, including pre-1.0 behaviour', () => {
  const mk = (...s) => s.map((subject) => parseCommit({ subject }));
  assert.equal(suggestBump(mk('fix: a')), 'patch');
  assert.equal(suggestBump(mk('fix: a', 'feat: b')), 'minor');
  assert.equal(suggestBump(mk('feat!: b')), 'major');
  assert.equal(suggestBump(mk('feat!: b'), { major0: true }), 'minor');
  assert.equal(suggestBump([]), 'none');
  assert.equal(bumpVersion('v1.2.3', 'minor'), 'v1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(bumpVersion('1.2.3-rc.1', 'patch'), '1.2.4');
  assert.equal(bumpVersion('nonsense', 'patch'), null);
});

test('groups in a fixed order, breaking first, skipping merges and skipped types', () => {
  const commits = parseLog(rec('chore: tidy') + rec('feat: x') + rec('fix!: y') + rec("Merge branch 'main' into x") + rec('docs: z'));
  assert.deepEqual(group(commits).map((g) => g.key), ['breaking', 'feat', 'docs', 'chore']);
  assert.deepEqual(group(commits, { skip: ['chore', 'docs'] }).map((g) => g.key), ['breaking', 'feat']);
});

test('render links PRs and commits when a repo URL is given', () => {
  const commits = parseLog(rec('feat: add search (#7)') + rec('fix(ui): align icon', '', 'Bo', '1234567890abc'));
  const md = render(commits, { version: '1.4.0', date: '2026-10-12', repo: 'https://github.com/o/r/', authors: true });
  assert.match(md, /^## \[1\.4\.0\] - 2026-10-12/);
  assert.match(md, /### Features\n- add search \(\[#7\]\(https:\/\/github\.com\/o\/r\/pull\/7\)\) — Ann/);
  assert.match(md, /- \*\*ui:\*\* align icon \(\[1234567\]\(https:\/\/github\.com\/o\/r\/commit\/1234567\)\) — Bo/);
  const gh = render(commits, { style: 'github' });
  assert.match(gh, /^## What's changed/);
  const plain = render(commits, { style: 'plain', version: 'v1' });
  assert.doesNotMatch(plain, /\[|\(#7\)/);
});

test('empty range renders an honest empty notice', () => {
  assert.match(render([]), /No user-facing changes\./);
});

test('summary warns when most commits are not conventional', () => {
  const s = summarize(parseLog(rec('wip') + rec('stuff') + rec('feat: a')));
  assert.equal(s.nonConventional, 2);
  assert.match(s.warnings[0], /guessed/);
});

test('CLI reads a real git history end to end', () => {
  const out = execFileSync('git', ['log', `--format=${FORMAT}`, '-n', '5'], { encoding: 'utf8' });
  const commits = parseLog(out);
  assert.ok(commits.length > 0 && commits.length <= 5);
  assert.ok(commits.every((c) => /^[0-9a-f]{40}$/.test(c.hash)));
  const cli = execFileSync('node', [new URL('./cli.mjs', import.meta.url).pathname, '--stdin', '--version', '9.9.9'], { input: out, encoding: 'utf8' });
  assert.match(cli, /^## \[9\.9\.9\]/);
});
