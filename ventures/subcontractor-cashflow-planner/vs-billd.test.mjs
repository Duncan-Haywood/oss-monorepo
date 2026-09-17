import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { planCashflow } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-billd.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Billd, and names the trademark holder correctly', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Billd, LLC/);
  assert.match(html, /trademarks of Billd, LLC/);
});

test('never disparages Billd — no negative-framing language', () => {
  assert.doesNotMatch(html, /\b(scam|rip[- ]?off|predatory|avoid|worse than|inferior|shady|dangerous)\b/i);
});

test('is explicit that Billd actually lends money and this calculator does not', () => {
  assert.match(html, /does not lend/i);
  assert.match(html, /real credit/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/subcontractor-cashflow-planner\/vs-billd\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-billd\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-billd\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the index page FAQ addition is mirrored in its own FAQPage schema (no drift)', () => {
  const heading = 'Once I know the gap, how do I actually close it?';
  assert.match(indexHtml, new RegExp(`<h3>${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h3>`));
  const schemaBlock = indexHtml.slice(indexHtml.indexOf('"@type":"FAQPage"'));
  assert.ok(schemaBlock.includes(JSON.stringify(heading).slice(1, -1)));
});

test('the illustrative dollar figures on the page match calc.mjs, not a hand-typed guess', () => {
  const base = {
    invoice: 10000, materials: 2500, weeklyBurn: 700, terms: 30,
    retention: 10, retentionRelease: 60, delay: 14, startingCash: 5000,
    deposit: 0, supplierTerms: 0,
  };

  // The 12%-APR figure repeated from the calculator's own defaults/FAQ.
  const at12 = planCashflow({ ...base, apr: 12 });
  assert.equal(at12.gap, 1900);
  assert.ok(Math.abs(at12.bridgeCost - 6.25) < 0.01, `expected ~$6.25 at 12% APR, got ${at12.bridgeCost}`);

  // Billd's own published standard fee (2.99%/month) annualized by simple
  // multiplication, used only as an illustrative rate translation -- see the
  // page copy for the caveat that this is not a Billd quote.
  const billdEquivalentApr = 2.99 * 12;
  assert.ok(Math.abs(billdEquivalentApr - 35.88) < 0.001);
  const atBilldRate = planCashflow({ ...base, apr: billdEquivalentApr });
  assert.ok(Math.abs(atBilldRate.bridgeCost - 18.68) < 0.01, `expected ~$18.68 at 35.88% APR, got ${atBilldRate.bridgeCost}`);

  // Both figures, rounded exactly as the page prints them, must appear on
  // the page verbatim.
  assert.match(html, /\$6\.25/);
  assert.match(html, /\$18\.68/);
  assert.match(html, /35\.9%/);
});

test('states Billd facts that are cited to a public source and none look invented', () => {
  assert.match(html, /2\.99% per month/);
  assert.match(html, /120 days/);
  assert.match(html, /\$100,000\+/);
  assert.match(html, /625\+ credit score/);
  assert.match(html, /billd\.com/);
});
