import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-it-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-doing-it-in-a-spreadsheet\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-doing-it-in-a-spreadsheet\.html"|href="vs-doing-it-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-it-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names the mechanical differences: stepwise machine loads vs. a linear per-pound average', () => {
  assert.match(html, /whole.load|stepwise|whole machine load/i);
  assert.match(html, /per order|per-order/i);
  assert.match(html, /minimum charge|minimum-charge/i);
  assert.match(html, /never uploaded|nothing you type is uploaded/i);
});

test('does not disparage spreadsheets or claim they are wrong, only incomplete by default', () => {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const word of ['worse', 'rip-off', 'ripoff', 'useless', 'wrong', 'bad idea']) {
    assert.ok(!text.includes(word), `disparaging or overstated word on the page: ${word}`);
  }
});

test('names no specific spreadsheet product or vendor', () => {
  const text = html.toLowerCase();
  for (const vendor of ['excel', 'google sheets', 'numbers.app', 'airtable']) {
    assert.ok(!text.includes(vendor), `page names a specific vendor: ${vendor}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});
