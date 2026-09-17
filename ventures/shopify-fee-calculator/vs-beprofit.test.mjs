import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-beprofit.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the licence and sponsors paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with BeProfit', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by BeProfit/);
});

test('no unverifiable price is claimed for BeProfit', () => {
  // BeProfit's own pricing page is not reachable from this session: outbound
  // HTTPS to arbitrary hosts is refused by the agent egress proxy with
  // `CONNECT tunnel failed, response 403`, so no plan name or dollar figure
  // could be confirmed against the vendor's own page. The same discipline
  // vs-smartmoving.html uses for SmartMoving and vs-paintscout.html uses for
  // PaintScout: only the well-documented, non-numeric category is stated --
  // an installed, connected, subscription profit-analytics app for
  // e-commerce stores -- and no dollar amount for BeProfit appears anywhere.
  //
  // The assertion is on the whole page rather than on BeProfit's paragraphs
  // because this venture's *own* figures are all user-entered too: this page
  // publishes no rate schedule for Shopify either, so a bare `$` followed by
  // a digit anywhere here is a number someone invented.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-beprofit\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test('every FAQ answer in the schema matches the visible answer text', () => {
  // The regression this pins is the one #2872 fixed on the hardwood
  // calculator: JSON-LD that has drifted from the copy a reader sees is a
  // structured-data mismatch, and search engines treat it as one. Compare on
  // text, after decoding the entities the visible copy uses and the JSON-LD
  // does not.
  const decode = (s) =>
    s
      .replace(/&mdash;/g, '—')
      .replace(/&amp;/g, '&')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const schema = JSON.parse(
    html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s)[1],
  );
  for (const question of schema.mainEntity) {
    const heading = `<h3>${question.name}</h3>`;
    const after = html.slice(html.indexOf(heading) + heading.length);
    const visible = decode(after.slice(0, after.indexOf('</p>')));
    assert.equal(
      visible,
      decode(question.acceptedAnswer.text),
      `FAQ answer for "${question.name}" differs between the schema and the visible copy`,
    );
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-beprofit\.html"|href="vs-beprofit\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-beprofit\.html/);
});

test('the comparison page links back to the calculator and to its sibling pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="why-paypal-costs-more\.html"/);
  assert.match(html, /href="basic-vs-grow\.html"/);
});

test('is indexable', () => {
  assert.match(html, /<meta name="robots" content="index, follow">/);
  // Exactly one robots directive: the mirror's injectMirrorTags strips what a
  // venture declares and writes its own, and two disagreeing directives on
  // one page is the defect that guards against.
  assert.equal((html.match(/<meta name="robots"/g) || []).length, 1);
});
