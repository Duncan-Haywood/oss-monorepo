import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-accessibe.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const deadlineHtml = fs.readFileSync(new URL('./deadline.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or compliance advice/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with accessiBe', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by accessiBe, Inc\./);
});

test('no unverifiable price is claimed for accessiBe', () => {
  // accessiBe's own current pricing and contract terms are not reachable
  // from this session to confirm today's figures, so no dollar amount for
  // accessiBe is invented here -- only its well-documented product shape
  // (an installed widget plus an audit/monitoring subscription) is described.
  const accessibeSection = html.split('Common questions')[0];
  assert.doesNotMatch(accessibeSection, /\$\d/);
});

test('does not claim accessiBe achieves or fails Title II compliance, and does not claim to determine compliance itself', () => {
  assert.match(html, /does not by itself prove compliance with ADA Title II/);
  assert.match(html, /makes no claim about accessWidget's effectiveness either way/);
  assert.match(html, /does not determine whether a site is compliant/);
});

test('names the WCAG 2.1 AA standard, the same one the evidence report and deadline lookup use', () => {
  assert.match(html, /WCAG 2\.1 AA/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-accessibe\.html">/);
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

test('the comparison page is linked from the tool page and the deadline lookup, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-accessibe\.html"|href="vs-accessibe\.html"/);
  assert.match(deadlineHtml, /href="\.\/vs-accessibe\.html"|href="vs-accessibe\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-accessibe\.html/);
});

test('the comparison page links back to the evidence report and the deadline lookup', () => {
  assert.match(html, /href="\.\/index\.html"/);
  assert.match(html, /href="\.\/deadline\.html"/);
});
