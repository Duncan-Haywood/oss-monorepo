import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-omni-calculator.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not engineering advice/i);
});

test('states it is not affiliated with Omni Calculator', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Omni Calculator\./);
});

test('no unverifiable price is claimed for Omni Calculator', () => {
  // omnicalculator.com is not reachable from the sandboxed worker that runs
  // this repo's routine sessions (network egress there is proxied and does
  // not permit fetching arbitrary vendor sites), so no current plan, price,
  // or exact calculator catalog could be confirmed against a primary source
  // from that environment -- same discipline the other vs-* pages in this
  // repo use. Only well-documented, non-numeric identity facts (general
  // category, free-to-use, no account required) are stated; no dollar
  // figure for Omni Calculator appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-omni-calculator\.html">/);
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

test('the comparison page is linked from the tool hub, not orphaned', () => {
  assert.match(indexHtml, /href="vs-omni-calculator\.html"/);
});

test('the comparison page links back to the hub and to each calculator', () => {
  assert.match(html, /<a href="index\.html">/);
  for (const slug of [
    'resistor-calculator',
    'led-resistor-calculator',
    'voltage-divider-calculator',
    '555-timer-calculator',
    'rc-filter-calculator',
    'rc-time-calculator',
  ]) {
    assert.match(html, new RegExp(`href="${slug}/"`));
  }
});
