import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-a-flat-usage-fee.html');
const index = docsPage('index.html');

test('index links to the flat-usage-fee comparison page', () => {
  assert.match(index, /vs-a-flat-usage-fee\.html/);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing habit (a flat usage-fee
// percentage), not a named competitor, so it names no company and carries
// no affiliation disclaimer -- unlike vs-fotoquote.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /fotoQuote|Cradoc/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/commercial-photo-license-calculator\/vs-a-flat-usage-fee\.html">/);
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

// The JSON-LD text and the visible prose must read as the same string once
// HTML entities are decoded, or faq-visible.test.mjs's punctuation-diff
// check fails the build -- pin it here too so a future edit to one side
// alone is caught locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-flat-usage-fee\.html/);
});

test('the comparison page links back to the calculator and the territory guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-more-does-a-national-or-worldwide-license-cost\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if app.mjs's formula or the form's shipped
// defaults ever change, this page's numbers must be re-derived, not left
// stale.
test('the worked-example table figures match app.mjs run against a fixed $1,200 creative fee', async () => {
  const { calculate } = await import('../app.mjs');

  const FLAT_PCT = 25;
  const creative = 1200;
  const flatTotal = creative + (creative * FLAT_PCT) / 100;

  const easy = calculate({
    creative,
    images: 1,
    term: 1,
    territory: 1,
    exclusivity: 1,
    rush: 0,
    channels: [{ name: 'web', factor: 1 }],
  });

  // The form's own shipped default (index.html): $1,200 creative fee, 5
  // images, 6-month term, national territory, non-exclusive, web only.
  const defaultJob = calculate({
    creative,
    images: 5,
    term: 6,
    territory: 1.25,
    exclusivity: 1,
    rush: 0,
    channels: [{ name: 'web', factor: 1 }],
  });

  const heavy = calculate({
    creative,
    images: 5,
    term: 24,
    territory: 1.6,
    exclusivity: 1.75,
    rush: 20,
    channels: [
      { name: 'web', factor: 1 },
      { name: 'paid', factor: 1.4 },
      { name: 'print', factor: 1.25 },
      { name: 'outdoor', factor: 1.6 },
    ],
  });

  assert.equal(flatTotal.toFixed(2), '1500.00');
  assert.equal(easy.total.toFixed(2), '1371.46');
  assert.equal(defaultJob.total.toFixed(2), '1725.00');
  assert.equal(heavy.total.toFixed(2), '7261.10');

  assert.match(html, /\$1,500\.00/);
  assert.match(html, /\$1,371\.46/);
  assert.match(html, /\$1,725\.00/);
  assert.match(html, /\$7,261\.10/);
  assert.match(html, /\$128\.54/);
  assert.match(html, /\$225\.00/);
  assert.match(html, /\$5,761\.10/);
});
