import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-square-appointments.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with Square', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Block, Inc\., Square, or Square Appointments/);
});

test('no unverifiable price is claimed for Square Appointments', () => {
  // squareup.com is not reachable from this session (network egress in this
  // environment is proxied and does not permit fetching arbitrary vendor
  // sites), so no current plan name or processing rate could be confirmed
  // against a primary source -- same discipline the other vs-* pages in this
  // repo use. Only well-documented, non-numeric identity facts (founding
  // year, founders, headquarters city, parent company, product category) are
  // stated; no dollar figure for Square Appointments appears on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file at the real GitHub Pages origin', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/appointment-deposit-calculator\/vs-square-appointments\.html">/,
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
  assert.match(indexHtml, /href="vs-square-appointments\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-square-appointments\.html/);
});

test('the comparison page links back to the calculator and to the percentage worked table', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="what-percentage-deposit-should-i-charge\.html"/);
});

test('the page is clear that this calculator never touches payment', () => {
  assert.match(html, /never touches payment|does not collect or process any payment|no connection to a\s*payment processor/);
});

test('links style.css like the other pages in this venture', () => {
  assert.match(html, /<link rel="stylesheet" href="style\.css">/);
});
