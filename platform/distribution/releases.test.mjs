import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { weekStart, composeRelease, plan, run } from './releases.mjs';

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
  assert.equal((await run({ env, fetchImpl: mk(calls, false), log() {}, now })).posted, 1);
  assert.equal(calls.length, 2);
  calls = [];
  assert.equal((await run({ env, fetchImpl: mk(calls, true), log() {}, now })).posted, 0);
  assert.deepEqual(calls.map((c) => c.split(' ')[0]), ['GET']);
});
