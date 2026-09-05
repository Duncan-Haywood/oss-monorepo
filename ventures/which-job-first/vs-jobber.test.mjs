import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-jobber.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, legal, or business advice/i);
});

test('states it is not affiliated with Jobber', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Jobber\./);
});

test('no unverifiable price is claimed for Jobber', () => {
  // getjobber.com is not reachable from the sandboxed worker that runs this
  // repo's routine sessions (network egress there is proxied and does not
  // permit fetching arbitrary vendor sites), so no current plan name or
  // price could be confirmed against a primary source from that
  // environment -- same discipline the other vs-* pages in this repo use.
  // Only well-documented, non-numeric identity facts (founding year,
  // headquarters city, product category, the >200,000-user claim which is
  // Jobber's own published figure, not a dollar amount) are stated; no
  // dollar figure for Jobber appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-jobber\.html">/);
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
  assert.match(indexHtml, /href="vs-jobber\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-jobber\.html/);
});

test('the comparison page links back to the tool and to the decision walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-do-i-decide-which-job-to-take-first\.html"/);
});
