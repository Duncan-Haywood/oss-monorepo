import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-hutch.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /MIT licensed/);
  assert.match(html, /GitHub Sponsors/);
});

test('states it is not affiliated with Hutch', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Hutch/);
});

test('every dollar figure attributed to Hutch is hedged as a third-party estimate, not a confirmed reading of its own site', () => {
  // This session's outbound access to hutchstaging.com is blocked (the same
  // egress limit vs-rover.html's test documents for rover.com), and search
  // results for Hutch's own pricing tier disagreed between sources ($99 vs
  // $149/month), so this page states a range attributed to named third-party
  // directories rather than asserting a single figure as Hutch's own current
  // price. That hedge must stay attached to every number.
  // Source HTML wraps lines for readability, so whitespace (including
  // newlines) between words is normalized before searching -- a hedge phrase
  // split across a line wrap must still count as present.
  const bodyRaw = html.slice(html.indexOf('<body>'));
  const body = bodyRaw.replace(/\s+/g, ' ');
  const numberPattern = /\$\d[\d,]*/g;
  let match;
  const numberIndexes = [];
  while ((match = numberPattern.exec(body))) numberIndexes.push(match.index);
  assert.ok(numberIndexes.length > 0, 'expected at least one Hutch pricing figure on the page');
  const hedge = 'third-party software directories';
  const hedgeIndexes = [];
  let hIdx = body.indexOf(hedge);
  while (hIdx > -1) {
    hedgeIndexes.push(hIdx);
    hIdx = body.indexOf(hedge, hIdx + 1);
  }
  assert.ok(hedgeIndexes.length > 0, 'the third-party-directory hedge must appear in the visible body');
  for (const idx of numberIndexes) {
    const near = hedgeIndexes.some((h) => Math.abs(h - idx) < 700);
    assert.ok(near, `dollar figure at body offset ${idx} is not near the third-party-estimate hedge`);
  }
});

test('names the specific named sources for the pricing estimate', () => {
  assert.match(html, /StageCore/);
  assert.match(html, /WifiTalents/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-hutch\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-hutch\.html"|href="vs-hutch\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-hutch\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="price"/);
  assert.match(indexHtml, /id="termWarning"/);
  assert.match(indexHtml, /id="actualTermMonths"/);
});

test('only one "Common questions" heading on the page', () => {
  const matches = html.match(/Common questions/g) || [];
  assert.equal(matches.length, 1);
});
