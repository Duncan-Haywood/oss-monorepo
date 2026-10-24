import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, Tally, createCounterServer, loadStore, saveStore, sourceOf, SOURCE_HOSTS, SOURCE_LABELS, SOURCES } from './counter.mjs';
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
  assert.deepEqual(summarise(merged), { days: 2, page_loads: 8, top: [['hub', 7], ['a', 1]], channels: {}, sources: {}, countries: {}, devices: {}, bot_pages: {}, bots: {} });
});

test('a known channel tag is attributed; an unknown one is dropped but the view still counts', () => {
  assert.deepEqual(classify({ ...ok, body: '{"p":"hub","r":"npm"}' }), { count: true, slug: 'hub', ref: 'npm' });
  assert.deepEqual(classify({ ...ok, body: '{"p":"hub","r":"free text"}' }), { count: true, slug: 'hub' });
  assert.equal(classify({ ...ok, body: 'null' }).reason, 'body');
});

test('the server adds ref:<tag> beside the page count, and summarise does not double it', async () => {
  const tally = new Tally();
  const server = createCounterServer({ tally, allowOrigin: 'https://x.example', now: () => new Date('2026-10-16T12:00:00Z') });
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  for (const body of ['{"p":"hub","r":"bluesky"}', '{"p":"a","r":"bluesky"}', '{"p":"a"}']) {
    await fetch(`http://127.0.0.1:${port}/hit`, { method: 'POST', body, headers: { 'user-agent': 'Mozilla/5.0' } });
  }
  server.close();
  assert.deepEqual(tally.days, { '2026-10-16': { hub: 1, a: 2, 'ref:bluesky': 2 } });
  const s = summarise(tally.days);
  assert.equal(s.page_loads, 3);
  assert.deepEqual(s.channels, { bluesky: 2 });
});

test('sourceOf reduces a referring host to a closed class, never the host', () => {
  const of = (h) => sourceOf(h, SOURCE_HOSTS, SOURCE_LABELS);
  assert.equal(of('www.google.com'), 'google');
  assert.equal(of('google.co.uk'), 'google');
  assert.equal(of('old.reddit.com'), 'reddit');
  assert.equal(of('t.co'), 'x');
  assert.equal(of('news.ycombinator.com'), 'hackernews');
  assert.equal(of('chatgpt.com'), 'chatgpt');
  assert.equal(of('someones-blog.example'), 'other');
  assert.equal(of('constructor.example'), 'other', 'prototype keys are not classes');
  assert.equal(of('google'), 'other', 'the last label alone is never matched');
  assert.equal(of(''), '');
  for (const v of [...Object.values(SOURCE_HOSTS), ...Object.values(SOURCE_LABELS)]) assert.ok(SOURCES.includes(v));
});

test('the server adds src:<class> beside the page count; a host or unknown class is dropped', async () => {
  assert.deepEqual(classify({ ...ok, body: '{"p":"hub","s":"google"}' }), { count: true, slug: 'hub', src: 'google' });
  assert.deepEqual(classify({ ...ok, body: '{"p":"hub","s":"someones-blog.example"}' }), { count: true, slug: 'hub' });
  const tally = new Tally();
  const server = createCounterServer({ tally, allowOrigin: 'https://x.example', now: () => new Date('2026-10-20T12:00:00Z') });
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  for (const body of ['{"p":"hub","s":"google"}', '{"p":"a","s":"google","r":"npm"}', '{"p":"a","s":"reddit"}']) {
    await fetch(`http://127.0.0.1:${port}/hit`, { method: 'POST', body, headers: { 'user-agent': 'Mozilla/5.0' } });
  }
  server.close();
  assert.deepEqual(tally.days, { '2026-10-20': { hub: 1, a: 2, 'src:google': 2, 'ref:npm': 1, 'src:reddit': 1 } });
  const s = summarise(tally.days);
  assert.equal(s.page_loads, 3);
  assert.deepEqual(s.sources, { google: 2, reddit: 1 });
});

test('crawler, device and country classes', async () => {
  const { botClass, deviceClass, countryCode, isPageKey } = await import('./core.mjs');
  assert.equal(botClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'), '');
  assert.equal(botClass('Mozilla/5.0 (compatible; bingbot/2.0)'), 'bingbot');
  assert.equal(botClass('Mozilla/5.0 (compatible; GPTBot/1.2)'), 'gptbot');
  assert.equal(botClass('Mozilla/5.0 (compatible; ClaudeBot/1.0)'), 'claudebot');
  assert.equal(botClass('Mozilla/5.0 (compatible; Claude-User/1.0)'), 'claude-user');
  assert.equal(botClass('facebookexternalhit/1.1'), 'meta');
  assert.equal(botClass('Mozilla/5.0 HeadlessChrome/130.0'), 'headless');
  assert.equal(botClass('NewCrawler/0.1'), 'other');
  assert.equal(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148'), 'mobile');
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), 'mobile');
  assert.equal(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'desktop');
  assert.equal(countryCode('DE'), 'DE');
  assert.equal(countryCode('T1'), 'T1');
  assert.equal(countryCode('de'), '');
  assert.equal(countryCode(undefined), '');
  assert.ok(isPageKey('categories/trades'));
  for (const k of ['ref:npm', 'src:google', 'geo:US', 'dev:mobile', 'bot:googlebot', 'botpage:hub']) assert.ok(!isPageKey(k), k);
  // A crawler's beacon reports its class and page instead of counting.
  assert.deepEqual(classify({ ...ok, headers: { 'user-agent': 'Googlebot/2.1' } }), { count: false, reason: 'bot', bot: 'googlebot', slug: 'shop-rate-calculator' });
  assert.deepEqual(classify({ ...ok, headers: { 'user-agent': 'ChatGPT-User/1.0' } }).reason, 'bot');
});
