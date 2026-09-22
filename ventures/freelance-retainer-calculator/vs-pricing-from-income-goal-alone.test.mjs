import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-pricing-from-income-goal-alone.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, legal, or tax advice/i);
});

test('names no vendor, competing calculator, or business-management platform', () => {
  // This page compares against a generic pricing habit (dividing income by
  // billable hours), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest: an edit that later named one would need to
  // add the disclaimer and leave this exemption, and this test would catch
  // the page claiming both at once.
  assert.doesNotMatch(html, /Bonsai|Harvest/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/freelance-retainer-calculator\/vs-pricing-from-income-goal-alone\.html">/);
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
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the worked-example figures match app.js on the shipped defaults', async () => {
  const { calculatePlan } = await import('./app.js');
  const plan = calculatePlan({
    income: 6000,
    costs: 1800,
    hours: 160,
    utilization: 65,
    retainerHours: 20,
    buffer: 15,
  });
  assert.equal(plan.rate.toFixed(2), '75.00');
  assert.equal(plan.retainer.toFixed(2), '1725.00');

  // The income-only guess: take-home divided by billable capacity, applied
  // to the same retainer hours, with no costs and no buffer added.
  const naiveRate = 6000 / (160 * 0.65);
  const naiveRetainer = naiveRate * 20;
  assert.equal(naiveRetainer.toFixed(2), '1153.85');
  assert.equal((plan.retainer - naiveRetainer).toFixed(2), '571.15');
  assert.equal((571.15 * 12).toFixed(2), '6853.80');

  assert.match(html, /\$1,725\.00/);
  assert.match(html, /\$1,153\.85/);
  assert.match(html, /\$571\.15/);
  assert.match(html, /\$6,853\.80/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-pricing-from-income-goal-alone\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-pricing-from-income-goal-alone\.html/);
});

test('the comparison page links back to the calculator and to the income-goal check', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="will-this-retainer-hit-my-income-goal\.html"/);
});
