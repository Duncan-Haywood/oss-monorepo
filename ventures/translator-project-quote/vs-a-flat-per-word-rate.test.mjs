import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadQuote, calculate } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-word-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('names no specific company or product', () => {
  assert.match(html, /names no specific company or product/);
  assert.doesNotMatch(html, /not affiliated with, endorsed by, or sponsored by/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-word-rate\.html">/);
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

test('the comparison page is linked from the tool page and the guide, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-word-rate\.html"/);
  assert.match(html, /href="\.\/how-to-quote-a-translation-project\.html"/);
  assert.match(html, /href="\.\/vs-smartcat\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-word-rate\.html/);
});

test('the naive flat per-word figures on the page match calc.mjs on the guide\'s worked example', () => {
  const q = loadQuote({
    new_words: 1800,
    fuzzy_words: 1200,
    fuzzy_rate: 50,
    words_per_hour: 400,
    hourly_rate: 45,
    qa_hours: 2,
    dtp_cost: 75,
    rush_fee: 0,
    minimum_price: 250,
    target_margin: 25,
  });
  const r = calculate(q);
  const flatRate = q.hourly_rate / q.words_per_hour;
  const naiveQuote = (q.new_words + q.fuzzy_words) * flatRate;
  assert.equal(flatRate, 0.1125);
  assert.equal(naiveQuote, 337.5);
  assert.equal(r.labor_cost, 270);
  assert.equal(r.recommended_price, 580);
  // The page's own claim: the flat quote overcharges relative to weighted
  // labor cost alone, but still undercharges relative to the recommended
  // price once add-ons and margin are counted.
  assert.ok(naiveQuote > r.labor_cost);
  assert.ok(naiveQuote < r.recommended_price);
  assert.equal(Math.round((r.recommended_price - naiveQuote) * 100) / 100, 242.5);
  assert.match(html, /\$337\.50/);
  assert.match(html, /\$580\.00/);
  assert.match(html, /\$270/);
  assert.match(html, /\$242\.50/);
});

test('the naive flat per-word figure matches direct cost exactly on a project with no fuzzy matches or add-ons', () => {
  const q = loadQuote({
    new_words: 2000,
    words_per_hour: 400,
    hourly_rate: 45,
    minimum_price: 250,
    target_margin: 25,
  });
  const r = calculate(q);
  const flatRate = q.hourly_rate / q.words_per_hour;
  const naiveQuote = q.new_words * flatRate;
  assert.equal(naiveQuote, 225);
  assert.equal(r.direct_cost, 225);
  assert.equal(naiveQuote, r.direct_cost);
  assert.equal(r.recommended_price, 300);
  assert.equal(r.recommended_price - naiveQuote, 75);
  assert.match(html, /\$225\.00/);
  assert.match(html, /\$300\.00/);
});
