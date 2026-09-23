import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-a-bare-labor-and-materials-guess.html');
const index = docsPage('index.html');

test('index links to the bare-guess comparison page', () => {
  assert.match(index, /vs-a-bare-labor-and-materials-guess\.html/);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, engineering, or construction advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing habit (a bare hours-times-wage
// guess), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-buildertrend.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildertrend/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/change-order-margin-calculator\/vs-a-bare-labor-and-materials-guess\.html">/);
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

// The JSON-LD text and the visible prose must read as the same string once
// HTML entities are decoded, or faq-visible.test.mjs's punctuation-diff
// check fails the build -- pin it here too so a future edit to one side
// alone is caught locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-bare-labor-and-materials-guess\.html/);
});

test('the comparison page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-to-price-a-change-order\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's formula or the form's shipped
// defaults ever change, this page's numbers must be re-derived, not left
// stale. "Bare guess" is computed through calculateChangeOrder itself, with
// burden, overhead, schedule delay, and target margin all zeroed out, so it
// is exactly hours * wage + materials + subcontractor without restating that
// formula a second time.
test('the worked-example table figures match calc.mjs run against the stated inputs', async () => {
  const { calculateChangeOrder } = await import('./calc.mjs');

  const bareGuess = (input) => calculateChangeOrder({
    ...input,
    burdenPercent: 0,
    overheadPercent: 0,
    targetMarginPercent: 0,
    daysAdded: 0,
    dailyGeneralConditions: 0,
    markupCapPercent: 0,
  }).walkAwayPrice;

  // This calculator's own shipped default job (index.html).
  const small = {
    hours: 8, wage: 28, burdenPercent: 25, materials: 350, subcontractor: 0,
    daysAdded: 0, dailyGeneralConditions: 0, markupCapPercent: 0,
    overheadPercent: 10, targetMarginPercent: 20,
  };
  const medium = {
    hours: 14, wage: 30, burdenPercent: 27, materials: 500, subcontractor: 900,
    daysAdded: 0, dailyGeneralConditions: 0, markupCapPercent: 0,
    overheadPercent: 12, targetMarginPercent: 20,
  };
  const heavy = {
    hours: 20, wage: 32, burdenPercent: 28, materials: 800, subcontractor: 1200,
    daysAdded: 3, dailyGeneralConditions: 450, markupCapPercent: 0,
    overheadPercent: 12, targetMarginPercent: 22,
  };

  const smallResult = calculateChangeOrder(small);
  const mediumResult = calculateChangeOrder(medium);
  const heavyResult = calculateChangeOrder(heavy);

  assert.equal(bareGuess(small).toFixed(2), '574.00');
  assert.equal(smallResult.walkAwayPrice.toFixed(2), '693.00');
  assert.equal(smallResult.targetPrice.toFixed(2), '866.25');

  assert.equal(bareGuess(medium).toFixed(2), '1820.00');
  assert.equal(mediumResult.walkAwayPrice.toFixed(2), '2165.41');
  assert.equal(mediumResult.targetPrice.toFixed(2), '2706.76');

  assert.equal(bareGuess(heavy).toFixed(2), '2640.00');
  assert.equal(heavyResult.walkAwayPrice.toFixed(2), '4669.50');
  assert.equal(heavyResult.targetPrice.toFixed(2), '5986.54');

  assert.match(html, /\$574\.00/);
  assert.match(html, /\$693\.00/);
  assert.match(html, /\$866\.25/);
  assert.match(html, /\$119\.00/);
  assert.match(html, /\$292\.25/);
  assert.match(html, /\$1,820\.00/);
  assert.match(html, /\$2,165\.41/);
  assert.match(html, /\$2,706\.76/);
  assert.match(html, /\$345\.41/);
  assert.match(html, /\$2,640\.00/);
  assert.match(html, /\$4,669\.50/);
  assert.match(html, /\$5,986\.54/);
  assert.match(html, /\$2,029\.50/);
});
