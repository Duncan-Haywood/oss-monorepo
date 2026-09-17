import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-title-company-net-sheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
});

test('defers to the title company as the authoritative figure', () => {
  // The one claim on this page that would be harmful if it drifted. Unlike the
  // vs-<vendor> pages elsewhere in this repo, the thing being compared against
  // here is not a competitor product but the document that actually governs a
  // real closing -- so the page must never read as a substitute for it. Three
  // separate statements carry that, in the lede, the body, and the footer;
  // pinning them means a later copy edit cannot quietly turn a "use both, and
  // theirs wins" page into a "use this instead" one.
  assert.match(html, /the title company's are the ones that govern/);
  assert.match(html, /does not replace a qualified professional, title company, escrow officer, or attorney/);
  assert.match(html, /this calculator does not replace it/);
});

test('names no specific title company or vendor', () => {
  // Deliberately a category comparison rather than a named-vendor one: title
  // and escrow fees are local and quoted per transaction, so any claim about a
  // particular company's pricing or coverage would be unverifiable from here
  // (network egress in this environment is proxied and does not permit
  // fetching arbitrary vendor sites). Keeping it categorical is what lets the
  // page be accurate everywhere it is read.
  assert.doesNotMatch(html, /TitleCapture|Qualia|SoftPro|ResWare/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-title-company-net-sheet\.html">/);
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

test('every FAQPage answer is on the page verbatim', () => {
  // Google's structured-data guidance is that the marked-up answer must be the
  // answer the visitor sees. The headings test above pairs the questions; this
  // pairs the bodies, which is where a later copy edit actually drifts.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-title-company-net-sheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-title-company-net-sheet\.html/);
});

test('the comparison page links back to the calculator and to the offer comparison', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="offer-comparison\.html"/);
});
