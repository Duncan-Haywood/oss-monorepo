import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-vagaro.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, employment, or career advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Vagaro', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Vagaro\./);
});

test('no unverifiable price is claimed for Vagaro', () => {
  // Vagaro's own site is not reachable from this session to confirm today's
  // plan names or pricing (same discipline as freight-accessorial-auditor's
  // vs-trax.html and equipment-rental-break-even's vs-booqable.html), so no
  // dollar figure for Vagaro appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-vagaro\.html">/);
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

test('the FAQPage answer text matches the visible paragraph exactly (modulo entities)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
  for (const question of schema.mainEntity) {
    assert.ok(
      squash(visible).includes(squash(question.acceptedAnswer.text)),
      `answer for "${question.name}" is not visible on the page verbatim`,
    );
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-vagaro\.html"|href="vs-vagaro\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-vagaro\.html/);
});

test('the comparison page links back to the calculator and to the break-even walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-many-clients-does-booth-rent-need\.html"/);
});

test('names the mechanical differences: booking/payments/scheduling SaaS vs. one-book worksheet', () => {
  assert.match(html, /booking|schedul/i);
  assert.match(html, /break-even/i);
  assert.match(html, /never uploaded|nothing you type is uploaded|nothing typed in is uploaded/);
});

test('does not disparage the named platform', () => {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const word of ['worse', 'rip-off', 'ripoff', 'overpriced', 'scam', 'useless']) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});
