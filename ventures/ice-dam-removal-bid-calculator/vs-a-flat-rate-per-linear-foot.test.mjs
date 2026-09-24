import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateQuote, DEFAULTS } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-rate-per-linear-foot.html');
const index = page('index.html');

test('index links to the flat-rate-per-linear-foot comparison page', () => {
  assert.match(index, /vs-a-flat-rate-per-linear-foot\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-flat-rate-per-linear-foot\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat per-foot rate card/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors|github\.com\/sponsors/);
});

test('the page frames the difference as a different call, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat per-foot rate card is a bad-faith practice/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic pricing method, not a named
  // product -- it is listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // set, and clauses.test.mjs's real-tree sweep checks that listing agrees
  // with this file.
  assert.doesNotMatch(html, /not affiliated with, endorsed by, or sponsored by/i);
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

test('the scheduled, emergency, and ran-long figures cited on the page match the calculator', () => {
  // The calculator's own default 80-foot job, quoted at the $7/ft rate card
  // ($560), compared across three states: a scheduled call, the identical
  // call dispatched as a storm-night emergency, and the scheduled call once
  // the crew's actual on-site hours run past the estimate.
  const scheduled = calculateQuote({ ...DEFAULTS, emergencyCall: false });
  const emergency = calculateQuote({ ...DEFAULTS, emergencyCall: true });
  const ranLong = calculateQuote({ ...DEFAULTS, emergencyCall: false, actualHours: 4.5 });

  assert.equal(scheduled.quotedPrice, 560);
  assert.ok(Math.abs(scheduled.cost - 332.024) < 0.01, `expected scheduled cost near $332.02, got ${scheduled.cost.toFixed(2)}`);
  assert.ok(Math.abs(scheduled.profit - 227.976) < 0.01, `expected scheduled profit near $227.98, got ${scheduled.profit.toFixed(2)}`);
  assert.ok(Math.abs(scheduled.profitMarginPct - 40.71) < 0.01, `expected scheduled margin near 40.71%, got ${scheduled.profitMarginPct.toFixed(2)}`);

  assert.equal(emergency.quotedPrice, 560);
  assert.ok(Math.abs(emergency.cost - 425.32) < 0.01, `expected emergency cost near $425.32, got ${emergency.cost.toFixed(2)}`);
  assert.ok(Math.abs(emergency.profit - 134.68) < 0.01, `expected emergency profit near $134.68, got ${emergency.profit.toFixed(2)}`);
  assert.ok(Math.abs(emergency.profitMarginPct - 24.05) < 0.01, `expected emergency margin near 24.05%, got ${emergency.profitMarginPct.toFixed(2)}`);
  assert.ok(emergency.belowTargetMargin, 'the emergency call should fall below the target-margin price at the flat quote');
  assert.ok(Math.abs(emergency.shortfallVsTarget - 47.6) < 0.01, `expected shortfall vs target near $47.60, got ${emergency.shortfallVsTarget.toFixed(2)}`);

  assert.equal(ranLong.quotedPrice, 560);
  assert.ok(Math.abs(ranLong.actual.cost - 484.344) < 0.01, `expected ran-long actual cost near $484.34, got ${ranLong.actual.cost.toFixed(2)}`);
  assert.ok(Math.abs(ranLong.actual.profit - 75.656) < 0.01, `expected ran-long actual profit near $75.66, got ${ranLong.actual.profit.toFixed(2)}`);
});
