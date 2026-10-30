import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { weekStart, composeRelease, plan, run, MAX_TOOLS } from './releases.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence.">';

test('weekStart returns the Monday of the week', () => {
  assert.equal(weekStart('2026-10-15'), '2026-10-12');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
});

test('composeRelease links each tool and states the limits', () => {
  const r = composeRelease([{ slug: 'mileage-log', meta: { title: 'Mileage Log — Free Tracker', description: 'Free log. More.' } }], '2026-10-15');
  assert.equal(r.tag, 'launches-2026-10-12');
  assert.match(r.body, /\[Mileage Log\]\(https:\/\/.*mileage-log.*\): Free log\./);
  assert.match(r.body, /not legal, tax or professional advice/);
  assert.match(r.body, /free and open source \(MIT\)/);
});

test('plan returns null when nothing launched in the window', async () => {
  assert.equal(await plan({ launched: { a: '2026-01-01' }, today: '2026-10-15', readPage: async () => page }), null);
});

test('plan caps the release at MAX_TOOLS and reports nothing planned when empty', async () => {
  const launched = Object.fromEntries(Array.from({ length: MAX_TOOLS + 5 }, (_, i) => [`t${i}`, '2026-10-14']));
  const rel = await plan({ launched, today: '2026-10-15', readPage: async () => page });
  assert.equal(rel.body.split('\n').filter((l) => l.startsWith('- [')).length, MAX_TOOLS);
  const logs = [];
  const r = await run({ env: {}, fetchImpl: () => { throw new Error('network'); }, log: (m) => logs.push(m), now: new Date('2000-01-01') });
  assert.deepEqual(r, { posted: 0, planned: 0 });
  assert.match(logs[0], /nothing launched/);
});

test('importing the module is silent; running it as a CLI does a dry run', () => {
  const file = fileURLToPath(new URL('./releases.mjs', import.meta.url));
  const quiet = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(file)})`], { encoding: 'utf8', env: {} });
  assert.equal(quiet, '');
  const out = execFileSync(process.execPath, [file], { encoding: 'utf8', env: {} });
  assert.match(out, /DRY RUN|nothing launched/);
});

test('dry run and half-configured runs never touch the network', async () => {
  const { launched } = JSON.parse(await fs.readFile(new URL('../pages/launched.json', import.meta.url)));
  const now = new Date(Object.values(launched).sort().pop());
  const boom = () => { throw new Error('network'); };
  for (const env of [{}, { DISTRIBUTE_RELEASES: 'true' }, { DISTRIBUTE_RELEASES: 'true', GITHUB_TOKEN: 't' }]) {
    const r = await run({ env, fetchImpl: boom, log() {}, now });
    assert.equal(r.posted, 0);
  }
});

test('live: creates the release once, skips an existing tag', async () => {
  const { launched } = JSON.parse(await fs.readFile(new URL('../pages/launched.json', import.meta.url)));
  const now = new Date(Object.values(launched).sort().pop());
  const env = { DISTRIBUTE_RELEASES: 'true', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' };
  const mk = (calls, exists) => async (url, init) => {
    calls.push(`${init.method} ${url}`);
    if (init.method === 'GET') return { ok: exists, status: exists ? 200 : 404 };
    assert.equal(JSON.parse(init.body).tag_name.startsWith('launches-'), true);
    return { ok: true, status: 201 };
  };
  let calls = [];
  const made = await run({ env, fetchImpl: mk(calls, false), log() {}, now });
  assert.deepEqual({ posted: made.posted, planned: made.planned }, { posted: 1, planned: 1 });
  assert.equal(calls.length, 2);
  calls = [];
  const seen = await run({ env, fetchImpl: mk(calls, true), log() {}, now });
  assert.deepEqual({ posted: seen.posted, planned: seen.planned }, { posted: 0, planned: 1 });
  assert.deepEqual(calls.map((c) => c.split(' ')[0]), ['GET']);
});

test('the release lists at most 25 tools', () => {
  assert.equal(MAX_TOOLS, 25);
});

test('live: the release is pinned to GITHUB_SHA when set and unpinned otherwise', async () => {
  const { launched } = JSON.parse(await fs.readFile(new URL('../pages/launched.json', import.meta.url)));
  const now = new Date(Object.values(launched).sort().pop());
  const base = { DISTRIBUTE_RELEASES: 'true', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' };
  const bodyFor = async (env) => {
    let body;
    const fetchImpl = async (url, init) => {
      if (init.method === 'GET') return { ok: false, status: 404 };
      body = JSON.parse(init.body);
      return { ok: true, status: 201 };
    };
    await run({ env, fetchImpl, log() {}, now });
    return body;
  };
  assert.equal((await bodyFor({ ...base, GITHUB_SHA: 'abc123' })).target_commitish, 'abc123');
  assert.equal('target_commitish' in (await bodyFor(base)), false);
});
