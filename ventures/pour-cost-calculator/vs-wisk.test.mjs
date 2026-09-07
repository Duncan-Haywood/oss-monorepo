import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-wisk.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, accounting, insurance, alcohol-service, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /MIT licence/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with WISK', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by WISK/);
});

test('never asserts a specific WISK price as confirmed — only a disputed range with the reason no figure is quoted', () => {
  // This session's outbound access to wisk.ai is blocked, and independent
  // pricing write-ups disagreed far more widely than the precedent this page
  // followed (roughly $100 to over $700/month), so no single figure is
  // stated as WISK's likely price anywhere on the page — only the fact that
  // sources disagree too widely to pick one, each time a dollar sign appears.
  const bodyRaw = html.slice(html.indexOf('<body>'));
  const body = bodyRaw.replace(/\s+/g, ' ');
  const numberPattern = /\$\d[\d,]*/g;
  let match;
  const numberIndexes = [];
  while ((match = numberPattern.exec(body))) numberIndexes.push(match.index);
  assert.ok(numberIndexes.length > 0, 'expected the disputed-range figures to appear on the page');
  const hedge = 'disagreed too widely';
  const hedgeIndexes = [];
  let hIdx = body.indexOf(hedge);
  while (hIdx > -1) {
    hedgeIndexes.push(hIdx);
    hIdx = body.indexOf(hedge, hIdx + 1);
  }
  assert.ok(hedgeIndexes.length > 0, 'the disagreement hedge must appear in the visible body');
  for (const idx of numberIndexes) {
    const near = hedgeIndexes.some((h) => Math.abs(h - idx) < 700);
    assert.ok(near, `dollar figure at body offset ${idx} is not near the disagreement hedge`);
  }
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-wisk\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-wisk\.html"|href="vs-wisk\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-wisk\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="pourCostPercent"/);
  assert.match(indexHtml, /id="overpour"/);
});

test('only one "Common questions" heading on the page', () => {
  const matches = html.match(/Common questions/g) || [];
  assert.equal(matches.length, 1);
});
