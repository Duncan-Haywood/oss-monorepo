import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-it-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('names no specific product or company -- this is a generic-method comparison', () => {
  // This page compares against doing the arithmetic by hand or in a
  // spreadsheet -- a generic method every service business already has
  // access to, not a company or product a reader could mistake this for.
  // It is therefore exempt from the "not affiliated" clause in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT set, and this
  // test pins the very sentence that exemption depends on staying true: an
  // author who later named a specific spreadsheet app or booking platform
  // here would be claiming an exemption for a page that had become the
  // thing it exempts.
  assert.match(html, /names no spreadsheet application, booking platform, or vendor at all/);
  assert.doesNotMatch(html, /not affiliated with/i);
});

test('the canonical tag names this file at the real GitHub Pages origin', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/appointment-deposit-calculator\/vs-doing-it-by-hand\.html">/,
  );
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-doing-it-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-it-by-hand\.html/);
});

test('the comparison page links back to the calculator and to the percentage worked table', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="what-percentage-deposit-should-i-charge\.html"/);
});

test('the page explains the break-even booking rate a spreadsheet does not set up on its own', () => {
  assert.match(html, /break-even booking rate/i);
});

test('links style.css like the other pages in this venture', () => {
  assert.match(html, /<link rel="stylesheet" href="style\.css">/);
});
