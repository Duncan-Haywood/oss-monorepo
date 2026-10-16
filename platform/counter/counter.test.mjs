import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, Tally, createCounterServer, loadStore, saveStore } from './counter.mjs';
import { mergeDays, summarise } from './pull.mjs';

const ok = { method: 'POST', url: '/hit', headers: { 'user-agent': 'Mozilla/5.0' }, body: '{"p":"shop-rate-calculator"}' };

test('counts a plain page view under its slug', () => {
  assert.deepEqual(classify(ok), { count: true, slug: 'shop-rate-calculator' });
});

test('honours Do Not Track and Global Privacy Control', () => {
  assert.equal(classify({ ...ok, headers: { ...ok.headers, DNT: '1' } }).count, false);
  assert.equal(classify({ ...ok, headers: { ...ok.headers, 'Sec-GPC': '1' } }).count, false);
});

test('drops crawlers so a sitemap crawl is not an audience', () => {
  for (const ua of ['Googlebot/2.1', 'bingbot', 'HeadlessChrome', 'curl/8.0']) {
    assert.equal(classify({ ...ok, headers: { 'user-agent': ua } }).reason, 'bot');
  }
});

test('refuses anything but a known-shape slug', () => {
  for (const body of ['{"p":"../etc"}', '{"p":"Has Spaces"}', '{"p":"<script>"}', '{"p":42}', 'not json', `{"p":"${'a'.repeat(300)}"}`]) {
    assert.equal(classify({ ...ok, body }).count, false, body);
  }
  assert.equal(classify({ ...ok, body: '{"p":"categories/trades"}' }).count, true);
  assert.equal(classify({ ...ok, url: '/other' }).reason, 'route');
  assert.equal(classify({ ...ok, method: 'GET' }).reason, 'route');
});

test('tally stores one integer per day and slug, capped', () => {
  const t = new Tally({ maxPerSlugPerDay: 2 });
  assert.equal(t.add('hub', '2026-10-16'), true);
  assert.equal(t.add('hub', '2026-10-16'), true);
  assert.equal(t.add('hub', '2026-10-16'), false);
  t.add('hub', '2026-10-17');
  assert.deepEqual(t.since('2026-10-17'), { '2026-10-17': { hub: 1 } });
  assert.deepEqual(t.days, { '2026-10-16': { hub: 2 }, '2026-10-17': { hub: 1 } });
});

test('store round-trips and a missing store is empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'counter-'));
  const file = path.join(dir, 'sub', 'counts.json');
  assert.deepEqual(loadStore(file), {});
  saveStore(file, { '2026-10-16': { hub: 3 } });
  assert.deepEqual(loadStore(file), { '2026-10-16': { hub: 3 } });
});

test('server: counts a hit, persists nothing about the request, serves aggregates', async () => {
  const tally = new Tally();
  const server = createCounterServer({ tally, allowOrigin: 'https://example.github.io', now: () => new Date('2026-10-16T12:00:00Z') });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const hit = await fetch(`${base}/hit`, { method: 'POST', body: '{"p":"hub"}', headers: { 'user-agent': 'Mozilla/5.0', 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(hit.status, 204);
    assert.equal(hit.headers.get('access-control-allow-origin'), 'https://example.github.io');
    await fetch(`${base}/hit`, { method: 'POST', body: '{"p":"hub"}', headers: { 'user-agent': 'Mozilla/5.0', DNT: '1' } });
    const counts = await (await fetch(`${base}/counts`)).json();
    assert.deepEqual(counts.days, { '2026-10-16': { hub: 1 } });
    assert.match(counts.unit, /not people/);
    assert.ok(!JSON.stringify(tally.days).includes('203.0.113.9'));
    assert.equal((await fetch(`${base}/nope`, { method: 'POST' })).status, 404);
  } finally {
    server.close();
  }
});

test('pull merge never shrinks a recorded day and ignores junk', () => {
  const merged = mergeDays({ '2026-10-15': { hub: 5 } }, { '2026-10-15': { hub: 3, a: 1 }, '2026-10-16': { hub: 2, bad: -1 }, nope: { x: 1 } });
  assert.deepEqual(merged, { '2026-10-15': { a: 1, hub: 5 }, '2026-10-16': { hub: 2 } });
  assert.deepEqual(summarise(merged), { days: 2, page_loads: 8, top: [['hub', 7], ['a', 1]] });
});
