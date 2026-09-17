import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateSettlement } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-headline-commission-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or estate-planning advice/i);
});

test('states nothing is uploaded', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-headline-commission-rate\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 2);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-headline-commission-rate\.html"|href="vs-headline-commission-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-headline-commission-rate\.html/);
});

test('no real estate sale company is named, so no unverifiable pricing is claimed', () => {
  // The whole page is about a *shape* of quote, not about any company's
  // actual schedule -- nothing here is reachable to verify from this repo,
  // and the venture footer already promises no affiliation with any company.
  // "Company A"/"Company B" are illustrative labels, which is why the worked
  // example carries its own "not a claim about any real company" note.
  assert.match(html, /not a claim about any real company's pricing/);
});

// The worked example is the page's central claim -- that the company quoting
// the LOWER headline rate can retain MORE. If the shipped arithmetic ever
// changes, this page becomes false rather than merely stale, so the numbers
// printed in the table are pinned against the module the calculator itself
// runs. Recomputed here rather than restated: a hand-copied constant is
// exactly what would go quietly wrong.
test('the worked example matches what the shipped calculator computes', () => {
  const gross = 12000;
  const a = calculateSettlement({
    grossSale: gross,
    tier1Rate: 40, tier1Threshold: 2000,
    tier2Rate: 30, tier2Threshold: 8000,
    tier3Rate: 25,
    setupFee: 400, cardProcessingFee: 250, haulAwayFee: 300,
    minimumGuarantee: '',
  });
  const b = calculateSettlement({
    grossSale: gross,
    tier1Rate: 35, tier1Threshold: gross,
    tier2Rate: '', tier2Threshold: '', tier3Rate: '',
    setupFee: '', cardProcessingFee: '', haulAwayFee: '',
    minimumGuarantee: '',
  });
  assert.ok(a.ok && b.ok);

  assert.equal(a.commission.toFixed(2), '3600.00');
  assert.equal(a.fees.toFixed(2), '950.00');
  assert.equal(a.net.toFixed(2), '7450.00');
  assert.equal(a.totalRetained.toFixed(2), '37.92');

  assert.equal(b.commission.toFixed(2), '4200.00');
  assert.equal(b.fees.toFixed(2), '0.00');
  assert.equal(b.net.toFixed(2), '7800.00');
  assert.equal(b.totalRetained.toFixed(2), '35.00');

  // The reversal the page exists to show, asserted as a relationship rather
  // than as two more constants: A quotes the lower rate and keeps more.
  assert.ok(a.totalRetained > b.totalRetained);
  assert.equal((b.net - a.net).toFixed(2), '350.00');

  for (const value of ['$3,600.00', '$950.00', '$7,450.00', '37.92%', '$4,200.00', '$7,800.00', '35.00%']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
  assert.ok(html.includes('$350'), 'the net difference is not stated on the page');
});
