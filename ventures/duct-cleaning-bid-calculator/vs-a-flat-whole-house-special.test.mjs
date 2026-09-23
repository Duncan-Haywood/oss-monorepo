import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-whole-house-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

// This page compares against a generic pricing method (a flat whole-house
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-jobber.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber|Housecall Pro|ServiceTitan|Workiz|ServiceMonster/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-whole-house-special\.html">/);
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
// HTML entities are decoded (the visible prose spells the em dash as
// &mdash;, matching the venture's own convention; JSON-LD spells it as the
// literal character), or faq-visible.test.mjs's punctuation-diff check fails
// the build -- pin it here too so a future edit to one side alone is caught
// locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-whole-house-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-whole-house-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const { calculateBid, JOB_PRESETS, suggestedJobHours } = await import('./calc.mjs');

  // The form's own shipped defaults (index.html), not numbers invented for
  // this page.
  const rates = {
    includedSystems: 1,
    includedVents: 10,
    includedReturns: 1,
    includedStories: 1,
    hoursPerExtraSystem: 1.6,
    hoursPerExtraVent: 0.12,
    hoursPerExtraReturn: 0.3,
    hoursPerExtraStory: 0.8,
    hoursCrawl: 0.8,
    hoursOccupied: 0.35,
    hoursCoil: 0.85,
    hoursSanitizer: 0.3,
    hoursHeavyDebris: 0.7,
    siteHours: 0.4,
    consumables: 12,
    sanitizerCost: 18,
    hourlyWage: 32,
    burdenRate: 28,
    travelAndEquipment: 48,
    overheadRate: 16,
    targetMargin: 28,
  };

  function bidFor(preset) {
    const jobHours = suggestedJobHours(preset.jobType);
    return calculateBid({
      ...rates,
      ...jobHours,
      systems: preset.systems,
      vents: preset.vents,
      returns: preset.returns,
      stories: preset.stories,
      crawl: preset.crawl,
      occupied: preset.occupied,
      coil: preset.coil,
      sanitizer: preset.sanitizer,
      heavyDebris: preset.heavyDebris,
      jobType: preset.jobType,
    });
  }

  // The calculator's own shipped index.html defaults: 1 system, 10 vents,
  // 1 return, 1 story, residential, no crawl/occupied/coil/sanitizer/heavy.
  const defaultJob = bidFor(JOB_PRESETS[0]);
  const occupiedRanch = bidFor(JOB_PRESETS[1]);
  const colonial = bidFor(JOB_PRESETS[2]);
  const splitLevel = bidFor(JOB_PRESETS[3]);

  assert.equal(defaultJob.totalCost.toFixed(2), '232.91');
  assert.equal(occupiedRanch.totalCost.toFixed(2), '362.12');
  assert.equal(colonial.totalCost.toFixed(2), '600.50');
  assert.equal(splitLevel.totalCost.toFixed(2), '679.99');

  assert.match(html, /\$232\.91/);
  assert.match(html, /\$362\.12/);
  assert.match(html, /\$600\.50/);
  assert.match(html, /\$679\.99/);

  // The $299 after-coupon special shown is the venture's own headline
  // anchor -- calc.mjs's own docstring and JOB_TYPE_PRESETS already name
  // "$99 whole-house special (or a '$299 after-coupon' price)" as the
  // number a flat quote loses money on.
  assert.match(html, /\$299\.00/);
  assert.match(html, /\$66\.09/);
  assert.match(html, /\$63\.12/);
  assert.match(html, /\$301\.50/);
  assert.match(html, /\$380\.99/);
});
