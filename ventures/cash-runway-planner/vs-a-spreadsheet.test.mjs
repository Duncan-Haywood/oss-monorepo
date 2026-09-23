import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, or legal advice/i);
});

// This page compares against a generic method (a spreadsheet), not a named
// competitor, so it names no company and carries no affiliation disclaimer --
// unlike vs-quickbooks-cash-flow-planner.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /QuickBooks|Intuit|Xero|FreshBooks|Wave|Float|Pulse/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
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
// entities are decoded, or faq-visible.test.mjs's punctuation-diff check
// fails the build -- pin it here too so an edit to one side alone is caught
// locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&minus;/g, '−');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example figures are the page's factual claim about the
// planner's own arithmetic -- if app.mjs's forecast logic or index.html's
// shipped defaults ever change, this page's numbers must be re-derived, not
// left stale.
test('the worked-example figures match app.mjs run against the shipped defaults', async () => {
  const { forecast, status, shortfallPlans, parseItems } = await import('./app.mjs');

  // The form's own shipped defaults (index.html).
  const base = { cash: 5000, weeklyIncome: 1800, collectionWeeks: 2, weeklyCosts: 1400, weeks: 12 };

  const baseRows = forecast({ ...base, items: [] });
  const baseStatus = status(baseRows);
  assert.equal(baseStatus.lowest, 2200);
  assert.equal(baseStatus.week, 2);
  assert.equal(baseStatus.shortfall, false);

  const items = parseItems({ item1Name: 'Quarterly tax', item1Amount: '6000', item1Week: '4', item1Kind: 'out', item1Repeat: '' }, base.weeks);
  const shortfallRows = forecast({ ...base, items });
  const shortfallStatus = status(shortfallRows);
  assert.equal(shortfallStatus.lowest, -3000);
  assert.equal(shortfallStatus.week, 4);
  assert.equal(shortfallStatus.shortfall, true);

  const [plan] = shortfallPlans(shortfallRows, { items, weeklyIncome: base.weeklyIncome, weeklyCosts: base.weeklyCosts });
  assert.equal(plan.deficit, 3000);
  assert.equal(plan.delay.name, 'Quarterly tax');
  assert.equal(plan.delay.amount, 6000);
  assert.equal(plan.delay.clears, true);
  assert.equal(plan.runEndWeek, 11);

  assert.match(html, /\$2,200 in week 2/);
  assert.match(html, /&minus;\$3,000 in week 4/);
  assert.match(html, /\$6,000 quarterly tax bill past week 11 closes the \$3,000 gap/);
});
