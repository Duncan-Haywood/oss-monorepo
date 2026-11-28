// Every page on marisstella.app and every bet's app subdomain loads Cloudflare Web Analytics: the zone
// injects the beacon (the build no longer adds a second copy, platform/analytics/site.json). So no product
// page may say it runs no analytics. On 2026-11-28 the PayApps, CMMC, Seller Books and Job Shop Quote
// sites' privacy notices all did, which made a false privacy statement on live pages, and CMMC's app
// CSP blocked the beacon, so its visits went uncounted.
// (docs/reports/2026-11-28-analytics-disclosure.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The served marketing sites (copied into the catalogue) and the deployed apps whose privacy
// policies cover the app's own pages.
const SITE_SOURCES = [
  'ventures/payapps/apps/payapps-site/src',
  'ventures/payapps/apps/payapps-site/catalogue-export',
  'ventures/cmmc/apps/cmmc-site/src',
  'ventures/seller-books/apps/seller-books-site/src',
  'ventures/jobshop-quote/apps/jobshop-site/src',
  'ventures/jobshop-quote/apps/jobshop-site/catalogue-export',
];
// Static served pages checked one by one (their folders hold tests, fixtures and calculator copies).
const SITE_PAGES = ['index.html', 'terms.html', 'refunds.html', 'privacy.html']
  .map((f) => `ventures/residential-takeoff/apps/wall-framing-takeoff/${f}`);
const APP_PRIVACY = [
  'ventures/payapps/apps/payapps/docs/legal/privacy.md',
  'ventures/cmmc/apps/cmmc/docs/legal/privacy.md',
  'ventures/seller-books/apps/seller-books/docs/legal/privacy.md',
  'ventures/jobshop-quote/apps/jobshop-quote/docs/legal/privacy.md',
];

// "no analytics", "runs no analytics", "no tracking scripts", "load no analytics or third-party scripts".
const DENIAL = /\bno (?:analytics|tracking scripts?)\b|\bcookies, or analytics vendors?\b|\b(?:runs?|loads?) no (?:analytics|third-party scripts)\b|no forms, (?:no )?cookies(?:,)? (?:or|and|no) (?:analytics|tracking)/i;

function files(dir) {
  const abs = path.join(repo, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const p = path.join(abs, name);
    if (statSync(p).isDirectory()) out.push(...files(path.join(dir, name)));
    else if (/\.(m?js|ts|html|txt|md)$/.test(name) && !/\.test\./.test(name)) out.push(path.join(dir, name));
  }
  return out;
}

test('no served product site says it runs no analytics', () => {
  const hits = [];
  for (const f of [...SITE_SOURCES.flatMap(files), ...SITE_PAGES])
    readFileSync(path.join(repo, f), 'utf8').split('\n').forEach((line, i) => {
      if (DENIAL.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  assert.deepEqual(hits, [], 'these lines deny analytics the pages load; say Cloudflare Web Analytics counts visits without cookies');
});

test('each deployed app privacy policy names Cloudflare Web Analytics', () => {
  for (const f of APP_PRIVACY) {
    const md = readFileSync(path.join(repo, f), 'utf8');
    assert.match(md, /Cloudflare Web Analytics/, f);
    assert.doesNotMatch(md, DENIAL, f);
  }
});

test('the pattern catches the 2026-11-28 wording and passes the fix', () => {
  for (const bad of [
    'These pages have no forms, set no cookies and run no analytics, advertising or other scripts.',
    'This marketing site stores nothing about you: no forms, no cookies, no tracking scripts.',
    'These pages have no forms, set no cookies and load no analytics or third-party',
    'The PayApps website has no forms, cookies or analytics.',
    'No analytics or advertising scripts run on this site.',
    'there are no accounts, cookies, or analytics vendors.',
  ]) assert.match(bad, DENIAL, bad);
  assert.doesNotMatch('These pages have no forms, set no cookies and run no advertising scripts.', DENIAL);
  assert.doesNotMatch('Visits are counted by cookieless Cloudflare Web Analytics.', DENIAL);
});
