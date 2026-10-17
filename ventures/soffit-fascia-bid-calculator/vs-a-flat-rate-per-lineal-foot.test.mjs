import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  calculateBid,
  JOB_PRESETS,
  suggestedScopeKit,
  suggestedStoryKit,
  suggestedTypeKit,
  suggestedExtraKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-lineal-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same crew defaults index.html ships with, since JOB_PRESETS only carries
// the eave/scope/story/type/extras fields and leaves crew rates to the form.
const CREW_DEFAULTS = {
  hourlyWage: 32, burdenRate: 30, travelAndEquipment: 75, otherCost: 0, overheadRate: 15, targetMargin: 20,
};

function priceJob(job) {
  return calculateBid({
    ...job,
    ...CREW_DEFAULTS,
    ...suggestedScopeKit(job.scope),
    ...suggestedStoryKit(job.stories),
    ...suggestedTypeKit(job.soffitType),
    ...suggestedExtraKit(),
  });
}

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not roofing, siding, building-code, ventilation, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // Generic mental model (a flat $/LF rate), not a named competitor --
  // distinct from this venture's own vs-jobber.html, which names Jobber
  // and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-per-lineal-foot\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs exactly', () => {
  const cheapSpecial = priceJob(JOB_PRESETS[0]);
  assert.equal(cheapSpecial.eaveLf, 160);
  assert.equal(cheapSpecial.price.toFixed(2), '3315.58');
  assert.equal(cheapSpecial.pricePerLf.toFixed(2), '20.72');

  const lossJob = priceJob(JOB_PRESETS[2]);
  assert.equal(lossJob.eaveLf, 200);
  assert.equal(lossJob.price.toFixed(2), '13057.93');
  assert.equal(lossJob.pricePerLf.toFixed(2), '65.29');

  const naiveQuote = cheapSpecial.pricePerLf * lossJob.eaveLf;
  assert.equal(naiveQuote.toFixed(2), '4144.47');

  const shortfall = lossJob.price - naiveQuote;
  assert.equal(shortfall.toFixed(2), '8913.46');

  const naiveSharePercent = (naiveQuote / lossJob.price) * 100;
  assert.equal(naiveSharePercent.toFixed(1), '31.7');

  const rateRatio = lossJob.pricePerLf / cheapSpecial.pricePerLf;
  assert.equal(rateRatio.toFixed(1), '3.2');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-rate-per-lineal-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-lineal-foot\.html/);
});

test('the comparison page links back to the calculator and to the guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-soffit-and-fascia\.html"/);
});
