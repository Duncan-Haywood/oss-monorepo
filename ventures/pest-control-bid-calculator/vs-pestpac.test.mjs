import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-pestpac.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, pest-control, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with PestPac', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by PestPac or WorkWave/);
});

test('no unverifiable price is claimed for PestPac', () => {
  // PestPac's own site is not reachable from this session (network egress in
  // this environment is proxied and blocks fetching arbitrary vendor sites --
  // confirmed live: a WebFetch to www.pestpac.com/resources/pestpac-overview
  // returned EGRESS_BLOCKED, and web search results for PestPac's founding
  // year and headquarters city conflicted across sources). Same discipline
  // vs-servicetitan.html uses for ServiceTitan and vs-gorilladesk.html uses
  // for GorillaDesk. Only well-documented, non-numeric identity facts
  // (product category, pest-control-specific focus, account-based
  // subscription model, ownership by WorkWave) are stated; no dollar figure
  // for PestPac appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/pest-control-bid-calculator\/vs-pestpac\.html">/,
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-pestpac\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-pestpac\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
