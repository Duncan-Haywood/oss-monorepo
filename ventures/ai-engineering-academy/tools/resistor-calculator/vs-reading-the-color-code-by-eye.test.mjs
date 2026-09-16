import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-reading-the-color-code-by-eye.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not\s+engineering\s+advice/i);
});

test('carries the best-effort hosting / no SLA note', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-reading-the-color-code-by-eye\.html" \/>/);
});

test('links back to the calculator and the tool hub', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="\.\.\/">/);
});

test('states the calculator runs entirely in the browser, nothing uploaded', () => {
  assert.match(html, /never leave this page/i);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  // Exactly one ld+json block on this page (asserted implicitly: JSON.parse
  // fails loudly if the match ever captures more or less than the object),
  // so it is safe to take everything between the tags rather than trying to
  // balance braces with a regex.
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'no ld+json schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
    // The schema's answer text is authored once and reused verbatim in the
    // visible <p> right after each heading -- this guards against the two
    // copies drifting apart, the exact defect class CLAUDE.md records
    // costing live product when a JSON-LD answer says something the page
    // itself does not.
    assert.ok(
      html.includes(question.acceptedAnswer.text),
      `visible copy for "${question.name}" does not match its FAQPage answer text verbatim`,
    );
  }
});

test('names no specific commercial product, so carries no trademark disclaimer', () => {
  // Compares against a manual reading method, not a named competitor --
  // exempted in platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // for the same reason the other manual-method vs- pages in this repo are.
  assert.doesNotMatch(html, /affiliated with/i);
});

test('the comparison page is linked from the calculator, not orphaned', () => {
  assert.match(indexHtml, /href="vs-reading-the-color-code-by-eye\.html"/);
});
