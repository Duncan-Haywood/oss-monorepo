import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { reviewVendor } from './calc.mjs';

const html = readFileSync(new URL('./vs-tracking-vendors-in-a-spreadsheet.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const robots = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('index, README, robots, and sitemap all let a visitor and a crawler reach the spreadsheet comparison page', () => {
  assert.match(index, /vs-tracking-vendors-in-a-spreadsheet\.html/);
  assert.match(readme, /vs-tracking-vendors-in-a-spreadsheet\.html/);
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-tracking-vendors-in-a-spreadsheet\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This tracker vs\. tracking vendors in a spreadsheet/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // Compares against a generic method (a hand-kept spreadsheet), not a named
  // product -- listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT set, and
  // clauses.test.mjs's real-tree sweep checks that listing agrees with this
  // file, same as vs-track1099.html's sibling test for the named-product page.
  assert.doesNotMatch(html, /not affiliated with, endorsed by, or sponsored by/i);
});

test('the page frames the mismatch as a stale formula, never as a mistake', () => {
  assert.match(html, /Nothing here says or implies that tracking 1099 vendors in a spreadsheet is a mistake/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'useless', 'incompetent']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage question and answer authored in JSON-LD is also visible on the page', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 3);
  for (const entry of ld.mainEntity) {
    assert.ok(html.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(html.includes(entry.acceptedAnswer.text), `answer not visible on page: ${entry.acceptedAnswer.text}`);
  }
});

test('the worked-example statuses cited on the page match the calculator for tax year 2026', () => {
  const contractor = reviewVendor(
    { entityType: 'individual', paymentCategory: 'services', totalPaid: 950, w9OnFile: false },
    { taxYear: 2026 },
  );
  const attorney = reviewVendor(
    { entityType: 'llcTaxedAsCorp', paymentCategory: 'attorneyFees', totalPaid: 5400, w9OnFile: true },
    { taxYear: 2026 },
  );
  const corpServices = reviewVendor(
    { entityType: 'cCorp', paymentCategory: 'services', totalPaid: 4100, w9OnFile: true },
    { taxYear: 2026 },
  );

  assert.equal(contractor.status, 'Below threshold — not yet reportable');
  assert.equal(attorney.status, 'Needs 1099 — W-9 on file');
  assert.equal(corpServices.status, 'Likely exempt — corporation');

  // A spreadsheet on the pre-2026 $600 threshold would have flagged the
  // $950 contractor -- the page's central claim about the mismatch.
  assert.ok(950 >= 600 && 950 < 2000, 'the $950 example must sit between the old and new thresholds');
});
