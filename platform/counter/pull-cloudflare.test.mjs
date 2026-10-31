import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientClass, isPagePath, zoneDays, classifyDay, workerDays, mergeDays, summarise, window, ADAPTIVE_LIMIT } from './pull-cloudflare.mjs';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const YANDEX = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';

test('classes a request by browser string, with scanner paths as probes whatever they claim to be', () => {
  assert.equal(clientClass(CHROME, '/'), 'browser');
  assert.equal(clientClass(YANDEX, '/'), 'yandexbot');
  assert.equal(clientClass(GPTBOT, '/llms.txt'), 'gptbot');
  assert.equal(clientClass('curl/8.5.0', '/'), 'script');
  assert.equal(clientClass('', '/'), 'no-ua');
  assert.equal(clientClass(CHROME, '/wp-login.php'), 'probe');
  assert.equal(clientClass(CHROME, '/.env'), 'probe');
  assert.equal(clientClass(CHROME, '/.git/config'), 'probe');
});

test('lists only answered HTML-like routes as pages', () => {
  assert.ok(isPagePath('/ai-bookkeeper/', 200));
  assert.ok(isPagePath('/llms.txt', 304));
  assert.ok(isPagePath('/c/services', 200));
  assert.ok(!isPagePath('/ai-bookkeeper/', 404), 'a 404 is an invented path, not a page');
  assert.ok(!isPagePath('/assets/site.js', 200));
  assert.ok(!isPagePath('/x?q=<script>', 200));
  assert.ok(!isPagePath('no-slash', 200));
});

test('zone daily totals keep counts only', () => {
  const rows = [{
    dimensions: { date: '2026-10-30' },
    sum: { requests: 31960, cachedRequests: 1920, bytes: 415e6, pageViews: 2470, threats: 0,
      countryMap: [{ clientCountryName: 'US', requests: 30270 }, { clientCountryName: 'RU', requests: 368 }, { clientCountryName: 'bad', requests: 1 }],
      responseStatusMap: [{ edgeResponseStatus: 200, requests: 29000 }, { edgeResponseStatus: 404, requests: 2050 }] },
    uniq: { uniques: 922 },
  }, { dimensions: { date: 'nope' }, sum: {} }];
  assert.deepEqual(zoneDays(rows), { '2026-10-30': {
    requests: 31960, cached: 1920, bytes: 415e6, page_views: 2470, threats: 0, unique_ips: 922,
    countries: { US: 30270, RU: 368 }, statuses: { 200: 29000, 404: 2050 },
  } });
});

test('a day of adaptive rows becomes class totals and top pages, with no browser string kept', () => {
  const rows = [
    { count: 360, dimensions: { userAgent: YANDEX, clientRequestPath: '/ai-bookkeeper/', edgeResponseStatus: 200 } },
    { count: 40, dimensions: { userAgent: YANDEX, clientRequestPath: '/nope/', edgeResponseStatus: 404 } },
    { count: 9, dimensions: { userAgent: CHROME, clientRequestPath: '/', edgeResponseStatus: 200 } },
    { count: 3, dimensions: { userAgent: CHROME, clientRequestPath: '/site.css', edgeResponseStatus: 200 } },
    { count: 12, dimensions: { userAgent: CHROME, clientRequestPath: '/wp-admin/setup-config.php', edgeResponseStatus: 404 } },
  ];
  const day = classifyDay(rows);
  assert.deepEqual(day.classes, { browser: 12, probe: 12, yandexbot: 400 });
  assert.deepEqual(day.pages, { browser: { '/': 9 }, yandexbot: { '/ai-bookkeeper/': 360 } });
  assert.equal(day.truncated, false);
  assert.ok(!JSON.stringify(day).includes('Mozilla'), 'browser strings are dropped');
  assert.ok(!JSON.stringify(day).includes('wp-admin'), 'scanner paths are not written');
  assert.equal(classifyDay(Array(ADAPTIVE_LIMIT).fill(rows[2])).truncated, true);
});

test('worker invocations sum per day and script', () => {
  const rows = [
    { dimensions: { date: '2026-10-30', scriptName: 'monorepo-projects-site' }, sum: { requests: 70, errors: 0 } },
    { dimensions: { date: '2026-10-30', scriptName: 'monorepo-projects-site' }, sum: { requests: 5, errors: 1 } },
    { dimensions: { date: '2026-10-30', scriptName: 'monorepo-projects-edge' }, sum: { requests: 4420, errors: 2 } },
  ];
  assert.deepEqual(workerDays(rows), { '2026-10-30': {
    'monorepo-projects-site': { requests: 75, errors: 1 },
    'monorepo-projects-edge': { requests: 4420, errors: 2 },
  } });
});

test('a smaller re-pull never shrinks a section already on file', () => {
  const old = { '2026-10-30': { zone: { requests: 100 }, traffic: { classes: { browser: 10 } } } };
  const merged = mergeDays(old, {
    '2026-10-30': { zone: { requests: 40 }, traffic: { classes: { browser: 11 } } },
    '2026-10-29': { zone: { requests: 5 } },
  });
  assert.deepEqual(Object.keys(merged), ['2026-10-29', '2026-10-30']);
  assert.equal(merged['2026-10-30'].zone.requests, 100);
  assert.equal(merged['2026-10-30'].traffic.classes.browser, 11);
  assert.equal(old['2026-10-30'].traffic.classes.browser, 10, 'input not mutated');
});

test('the window resumes two days before the last complete day, inside the 30-day retention', () => {
  assert.deepEqual(window({}, '2026-10-31'), { since: '2026-10-17', until: '2026-10-30' });
  assert.deepEqual(window({ '2026-10-29': { zone: {} } }, '2026-10-31'), { since: '2026-10-27', until: '2026-10-30' });
  assert.deepEqual(window({ '2026-01-01': { zone: {} } }, '2026-10-31'), { since: '2026-10-01', until: '2026-10-30' });
});

test('the summary says how much was ordinary browsers', () => {
  const [line] = summarise({ '2026-10-30': { zone: { requests: 500, page_views: 80 }, traffic: { classes: { browser: 20, yandexbot: 360, script: 40 } } } });
  assert.equal(line, '2026-10-30: 500 requests, 80 page views; browser 20 of 420 eyeball requests (yandexbot 360, script 40)');
});
