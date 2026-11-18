import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadLastChanged, parseLastChanged } from './lastmod.mjs';
import { renderVentureSitemap } from './build.mjs';

test('parseLastChanged keeps the newest commit per file and skips boundary commits', () => {
  const log = '\0bbb 2026-10-02T00:00:00+00:00\n\na/x.html\n\0aaa 2026-10-01T00:00:00+00:00\n\na/x.html\na/y.html\n';
  const dates = parseLastChanged(log, new Set(['aaa']));
  assert.equal(dates.get('a/x.html'), '2026-10-02T00:00:00+00:00');
  assert.equal(dates.has('a/y.html'), false);
});

test('loadLastChanged reports each file at its own last commit, never a later one', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmod-'));
  const git = (date, ...args) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    });
  git('2026-01-01T00:00:00Z', 'init', '-q');
  fs.mkdirSync(path.join(dir, 'ventures/t'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ventures/t/a.html'), 'a');
  fs.writeFileSync(path.join(dir, 'ventures/t/b.html'), 'b');
  git('2026-01-01T00:00:00Z', 'add', '.');
  git('2026-01-01T00:00:00Z', 'commit', '-qm', 'one');
  fs.writeFileSync(path.join(dir, 'ventures/t/b.html'), 'b2');
  git('2026-02-01T00:00:00Z', 'commit', '-qam', 'two');

  const dates = await loadLastChanged(dir);
  assert.ok(dates.get('ventures/t/a.html').startsWith('2026-01-01'));
  assert.ok(dates.get('ventures/t/b.html').startsWith('2026-02-01'));
  assert.equal((await loadLastChanged(path.join(dir, 'missing'))).size, 0);
});

test('loadLastChanged in a shallow clone drops boundary-dated files and reports historyStart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmod-src-'));
  const git = (cwd, date, ...args) =>
    execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    });
  git(dir, '2026-01-01T00:00:00Z', 'init', '-q');
  fs.mkdirSync(path.join(dir, 'ventures/t'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ventures/t/a.html'), 'a');
  fs.writeFileSync(path.join(dir, 'ventures/t/b.html'), 'b');
  git(dir, '2026-01-01T00:00:00Z', 'add', '.');
  git(dir, '2026-01-01T00:00:00Z', 'commit', '-qm', 'one');
  fs.writeFileSync(path.join(dir, 'ventures/t/b.html'), 'b2');
  git(dir, '2026-02-01T00:00:00Z', 'commit', '-qam', 'two');

  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'lastmod-shallow-'));
  execFileSync('git', ['clone', '-q', '--depth=1', `file://${dir}`, clone]);
  const dates = await loadLastChanged(clone);
  // The only visible commit is the boundary: it proves nothing about a.html's own date.
  assert.equal(dates.has('ventures/t/a.html'), false);
  assert.ok(dates.historyStart.startsWith('2026-02-01'));
  // A full clone has no boundary.
  assert.equal((await loadLastChanged(dir)).historyStart, null);
});

test('renderVentureSitemap writes lastmod only where a date is known', () => {
  const xml = renderVentureSitemap('t', ['index.html', 'b.html'], 'https://x/', { 'b.html': '2026-02-01T00:00:00+00:00' });
  assert.match(xml, /<loc>https:\/\/x\/t\/b<\/loc><lastmod>2026-02-01T00:00:00\+00:00<\/lastmod>/);
  assert.match(xml, /<url><loc>https:\/\/x\/t\/<\/loc><\/url>/);
});
