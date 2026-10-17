import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseLog, analyze, cleanPath, summaryLine, STATUSES } from './classify.mjs';

const here = (p) => new URL(p, import.meta.url);
const fixture = readFileSync(here('./fixture.txt'), 'utf8');

test('rename notations resolve to the new path', () => {
  assert.equal(cleanPath('api/{old => new}/users.py'), 'api/new/users.py');
  assert.equal(cleanPath('{ => src}/a.py'), 'src/a.py');
  assert.equal(cleanPath('a.py => b/c.py'), 'b/c.py');
});

test('binary files count as one line and pipes in names survive', () => {
  assert.deepEqual(parseLog('@@|A|a@x.io|100\n-\t-\tlogo.png\n')[0].files, [['logo.png', 1]]);
  const c = parseLog('@@|Ann | Bo|ab@x.io|100\n1\t1\tf\n')[0];
  assert.deepEqual([c.name, c.email], ['Ann | Bo', 'ab@x.io']);
});

test('a departed sole owner is orphaned and sorts first', () => {
  const r = analyze(parseLog(fixture));
  assert.equal(r.contributors, 3);
  assert.equal(r.directories[0].dir, 'api');
  assert.equal(r.directories[0].status, 'orphaned');
  assert.equal(r.orphaned, 1);
  const web = r.directories.find((d) => d.dir === 'web');
  assert.equal(web.status, 'shared');
  assert.equal(web.backup, 'Cy Lund');
  assert.match(summaryLine(r), /1 orphaned/);
});

test('empty and bot-only logs report an error', () => {
  assert.ok(analyze([]).error);
  assert.ok(analyze(parseLog('@@|d[bot]|d@x|1\n1\t1\tf\n')).error);
});

test('every status the analyzer emits is a known one', () => {
  for (const d of analyze(parseLog(fixture)).directories) assert.ok(STATUSES.includes(d.status));
});

test('browser port matches the Python CLI on the shared fixture', () => {
  const py = JSON.parse(execFileSync('python3', [new URL('./busfactor.py', import.meta.url).pathname,
    '--log', '-', '--format', 'json'], { input: fixture, encoding: 'utf8' }));
  assert.deepEqual(analyze(parseLog(fixture)), py);
});

test('browser port matches the Python CLI on a larger synthetic history', () => {
  let log = '';
  const people = [['Ann', 'ann@x.io'], ['Bo', 'bo@x.io'], ['Cai', 'cai@x.io']];
  for (let i = 0; i < 60; i++) {
    const [n, e] = people[(i * 7 + (i % 5)) % 3];
    log += `@@|${n}|${e}|${1690000000 + i * 3600000}\n${(i * 13) % 90 + 1}\t${i % 11}\tsrc/${['a', 'b', 'c'][i % 3]}/m${i % 4}.js\n`;
  }
  const py = JSON.parse(execFileSync('python3', [new URL('./busfactor.py', import.meta.url).pathname,
    '--log', '-', '--format', 'json', '--depth', '2', '--min-commits', '2'], { input: log, encoding: 'utf8' }));
  assert.deepEqual(analyze(parseLog(log), { minCommits: 2 }), py);
});
