import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-jobber.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Jobber', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Jobber/);
});

test('no unverifiable price is claimed for Jobber', () => {
  // Jobber's own site is not reachable from this session (network egress in
  // this environment is proxied and blocks fetching arbitrary vendor sites)
  // -- same discipline vs-gorilladesk.html uses for GorillaDesk. Only
  // well-documented, non-numeric identity facts (product category, home
  // service focus, account-based subscription model) are stated; no dollar
  // figure for Jobber appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/pressure-washing-bid-calculator\/vs-jobber\.html">/,
  );
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s,
  );
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s,
  );
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-jobber\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-jobber\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
