import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choose, describe, FILES } from './usage-data.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('the branch copy wins when main has none, and main survives an absent branch file', () => {
  const doc = { last_pull: { on: '2026-11-01', errors: [] } };
  assert.equal(choose('cloudflare-analytics.json', null, doc), doc);
  assert.equal(choose('cloudflare-analytics.json', doc, null), doc);
});

test('site-visits days merge with the larger count, so a hand-run pull on main is kept', () => {
  const main = { unit: 'u', days: { '2026-10-20': { c: 5 }, '2026-10-21': { c: 1 } } };
  const branch = { unit: 'u', days: { '2026-10-21': { c: 3 }, '2026-10-22': { c: 2 } } };
  assert.deepEqual(choose('site-visits.json', main, branch).days,
    { '2026-10-20': { c: 5 }, '2026-10-21': { c: 3 }, '2026-10-22': { c: 2 } });
});

test('site-feedback merges by id, the branch record winning a tie', () => {
  const main = { note: 'n', feedback: [{ id: 1, message: 'a' }, { id: 3, message: 'c' }] };
  const branch = { note: 'n', feedback: [{ id: 1, message: 'a2' }, { id: 2, message: 'b' }] };
  assert.deepEqual(choose('site-feedback.json', main, branch).feedback.map((r) => [r.id, r.message]),
    [[1, 'a2'], [2, 'b'], [3, 'c']]);
});

test('describe says what each file covers', () => {
  assert.equal(describe(null), 'absent');
  assert.equal(describe({ days: { '2026-10-02': {}, '2026-10-01': {} } }), '2 day(s), 2026-10-01..2026-10-02');
  assert.equal(describe({ feedback: [{}] }), '1 message(s)');
  assert.equal(describe({ last_pull: { on: '2026-10-31', errors: ['x', 'y'] } }), 'last pull 2026-10-31, 2 dataset error(s)');
  assert.equal(FILES.length, 4);
});

// The CLI, run for real: a copy of this directory in a temp repo whose `origin`
// is a local repo holding the `usage-data` branch (2026-11-14, red team: every
// mutant in main() and the entry guard survived the tests above).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ID = ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'];

function fixture({ branch = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-data-'));
  const origin = path.join(dir, 'origin');
  const work = path.join(dir, 'work');
  fs.mkdirSync(origin);
  fs.mkdirSync(path.join(work, 'platform', 'counter'), { recursive: true });
  fs.mkdirSync(path.join(work, 'portfolio', 'usage'), { recursive: true });
  for (const f of ['usage-data.mjs', 'pull.mjs', 'core.mjs']) {
    fs.copyFileSync(path.join(HERE, f), path.join(work, 'platform', 'counter', f));
  }
  const g = (cwd, ...a) => execFileSync('git', [...ID, ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(origin, 'init', '-q', '-b', branch ? 'usage-data' : 'other');
  g(work, 'init', '-q');
  g(work, 'remote', 'add', 'origin', origin);
  const publish = (files) => {
    for (const [name, doc] of Object.entries(files)) fs.writeFileSync(path.join(origin, name), JSON.stringify(doc));
    g(origin, 'add', '.');
    g(origin, 'commit', '-q', '-m', 'pull');
  };
  const run = (...args) => spawnSync(process.execPath, [path.join(work, 'platform', 'counter', 'usage-data.mjs'), ...args], { cwd: work, encoding: 'utf8' });
  const local = (name) => path.join(work, 'portfolio', 'usage', name);
  return { dir, work, publish, run, local };
}

test('status, the default command, reports each file and writes nothing', (t) => {
  const fx = fixture();
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'site-visits.json': { days: { '2026-11-01': { c: 2 } } } });
  for (const args of [[], ['status']]) {
    const r = fx.run(...args);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^site-visits\.json: branch 1 day\(s\), 2026-11-01\.\.2026-11-01; main absent$/m);
    assert.equal(r.stdout.trim().split('\n').length, FILES.length);
    assert.equal(fs.existsSync(fx.local('site-visits.json')), false);
  }
});

test('sync writes the branch copy as JSON, merged with the days main already holds', (t) => {
  const fx = fixture();
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'site-visits.json': { days: { '2026-11-02': { c: 4 } } } });
  fs.writeFileSync(fx.local('site-visits.json'), JSON.stringify({ days: { '2026-11-01': { c: 1 } } }));
  const r = fx.run('sync');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 file\(s\) updated/);
  const text = fs.readFileSync(fx.local('site-visits.json'), 'utf8');
  assert.ok(text.endsWith('}\n'), 'one trailing newline');
  assert.deepEqual(JSON.parse(text).days, { '2026-11-01': { c: 1 }, '2026-11-02': { c: 4 } });
  const again = fx.run('sync');
  assert.match(again.stdout, /Nothing to copy\./);
});

test('show prints one file and exits 0; an unknown file or command exits 2', (t) => {
  const fx = fixture();
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'site-feedback.json': { feedback: [{ id: 1 }] } });
  const r = fx.run('show', 'site-feedback.json');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { feedback: [{ id: 1 }] });
  assert.equal(fx.run('show', 'site-visits.json').status, 1);
  assert.equal(fx.run('show', 'nope.json').status, 2);
  assert.equal(fx.run('push').status, 2);
});

test('a remote with no usage-data branch exits 1 instead of reporting every file absent', (t) => {
  const fx = fixture({ branch: false });
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'x.json': {} });
  const r = fx.run('status');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not fetch origin\/usage-data/);
  assert.equal(r.stdout, '');
});

test('a second run after the branch moves on still fetches it (a shallow fetch reads as non-fast-forward)', (t) => {
  const fx = fixture();
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'site-visits.json': { days: { '2026-11-01': { c: 2 } } } });
  assert.equal(fx.run('status').status, 0);
  fx.publish({ 'site-visits.json': { days: { '2026-11-01': { c: 2 }, '2026-11-02': { c: 3 } } } });
  const r = fx.run('status');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /site-visits\.json: branch 2 day\(s\), 2026-11-01\.\.2026-11-02/);
});

test('importing the module runs no command', (t) => {
  const fx = fixture();
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));
  fx.publish({ 'site-visits.json': { days: {} } });
  const script = path.join(fx.work, 'imports.mjs');
  fs.writeFileSync(script, "import { FILES } from './platform/counter/usage-data.mjs';\nconsole.log(FILES.length);\n");
  const r = spawnSync(process.execPath, [script], { cwd: fx.work, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '4\n');
});
