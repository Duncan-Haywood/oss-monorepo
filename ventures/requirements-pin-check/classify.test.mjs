import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { analyze, logicalLines, summaryLine, CATEGORIES } from './classify.mjs';

const cats = (text, o) => analyze(text, o).findings.map((f) => `${f.name}:${f.category}`);

test('exact pins are clean, ranges and bare names are not', () => {
  assert.deepEqual(cats('requests==2.31.0\n'), []);
  assert.deepEqual(cats('requests>=2\nnumpy\nflask~=2.1\n'), ['numpy:no-version', 'requests:range-version', 'flask:range-version']);
});

test('wildcard == is a range, not a pin', () => {
  assert.deepEqual(cats('django==4.2.*\n'), ['django:range-version']);
});

test('extras, environment markers and trailing comments do not hide the pin', () => {
  assert.deepEqual(cats('pandas[performance]==2.1.0 ; python_version >= "3.9"  # why\n'), []);
});

test('backslash continuations join into one requirement and carry hashes', () => {
  const lines = logicalLines('django==4.2 \\\n  --hash=sha256:aa \\\n  --hash=sha256:bb\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(cats('django==4.2 \\\n  --hash=sha256:aa\n', { requireHashes: true }), []);
  assert.deepEqual(cats('django==4.2\n', { requireHashes: true }), ['django:no-hashes']);
  assert.deepEqual(cats('django==4.2\n'), []);
});

test('index options: extra-index-url and http sources are flagged, a single https index is not', () => {
  assert.deepEqual(cats('--index-url https://pypi.example/simple\nflask==2.0\n'), []);
  assert.equal(analyze('--extra-index-url https://x.example/simple\nflask==2.0\n').findings[0].category, 'index-override');
  assert.equal(analyze('-i http://x.example/simple\nflask==2.0\n').findings[0].category, 'insecure-source');
  assert.equal(analyze('--trusted-host x.example\nflask==2.0\n').findings[0].category, 'insecure-source');
});

test('VCS and URL dependencies: only full-commit or hashed ones are pinned', () => {
  assert.deepEqual(cats('a @ git+https://h/x.git@main\n'), ['a:vcs-unpinned']);
  assert.deepEqual(cats(`a @ git+https://h/x.git@${'a'.repeat(40)}\n`), []);
  assert.deepEqual(cats('a @ https://h/a.tar.gz\n'), ['a:url-dependency']);
  assert.deepEqual(cats('a @ https://h/a.tar.gz#sha256=abc\n'), []);
  assert.deepEqual(cats('a @ http://h/a.tar.gz\n'), ['a:insecure-source']);
});

test('duplicates are matched across case and separators', () => {
  assert.deepEqual(cats('My_Pkg==1\nmy-pkg==2\n'), ['my-pkg:duplicate']);
});

test('-r and -c includes are ignored, comments and blanks skipped', () => {
  assert.deepEqual(cats('-r base.txt\n-c constraints.txt\n\n# nothing\nflask==1\n'), []);
});

test('empty and non-requirement input return an error, not a clean pass', () => {
  assert.match(analyze('').error, /No requirements/);
  assert.match(analyze('# only a comment\n').error, /No requirements/);
  assert.match(analyze('--index-url https://x/simple\n').error, /No package requirements/);
});

test('every category is emitted by the fixture or documented', () => {
  const r = analyze(readFileSync(new URL('./fixture.txt', import.meta.url), 'utf8'), { requireHashes: true });
  const seen = new Set(r.findings.map((f) => f.category));
  for (const c of CATEGORIES.filter((x) => x !== 'pinned')) assert.ok(seen.has(c), `fixture never produces ${c}`);
});

test('summary line counts severities', () => {
  assert.match(summaryLine(analyze('flask==1\n')), /all pinned/);
  assert.match(summaryLine(analyze('flask\n')), /1 medium/);
});

test('CLI exit codes: 0 clean, 1 on --fail-on, 2 on unreadable', () => {
  const cli = new URL('./requirements-check.mjs', import.meta.url).pathname;
  const fx = new URL('./fixture.txt', import.meta.url).pathname;
  assert.equal(spawnSync('node', [cli, fx]).status, 0);
  assert.equal(spawnSync('node', [cli, fx, '--fail-on', 'high']).status, 1);
  assert.equal(spawnSync('node', [cli, '/nonexistent/requirements.txt']).status, 2);
  const out = JSON.parse(execFileSync('node', [cli, fx, '--json']).toString());
  assert.ok(out.findings.length > 0);
});
