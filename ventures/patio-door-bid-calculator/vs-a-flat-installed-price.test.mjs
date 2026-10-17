import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-installed-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat special), not
// a named competitor, so it names no company and carries no affiliation
// disclaimer -- unlike vs-jobber.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber|ServiceTitan|Housecall|JobNimbus|Workiz|FieldEdge/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-installed-price\.html">/);
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
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-installed-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-installed-price\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults, kits, or presets
// ever change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and the form defaults', async () => {
  const {
    calculateBid,
    suggestedConfigKit,
    suggestedFrameKit,
    suggestedGlazingKit,
    suggestedInstallKit,
    suggestedAccessKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  // The extra-work hours/costs, and the loaded-cost rates, that index.html
  // ships as form defaults and that applyJob() never overwrites when a
  // preset is picked -- only the config/frame/glazing/install/access kit
  // fields are overwritten. See index.html's SUGGESTED_*_IDS.
  const formDefaults = {
    hoursTrip: 1, hoursScreen: 0.9, hoursTransom: 1.4, hoursSillPan: 1.5,
    hoursThreshold: 1.3, hoursTearOut: 1.4, siteHours: 0.5,
    screenCost: 95, transomCost: 380, trimCost: 140, sillPanCost: 165,
    thresholdCost: 95, dumpFee: 65, permitFee: 0,
    hourlyWage: 48, burdenRate: 32, travelAndEquipment: 110,
    overheadRate: 16, targetMargin: 32,
  };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...formDefaults,
      ...suggestedConfigKit(preset.config),
      ...suggestedFrameKit(preset.frame),
      ...suggestedGlazingKit(preset.glazing),
      ...suggestedInstallKit(preset.install),
      ...suggestedAccessKit(preset.access),
    });
  }

  const cheapest = priceJob(JOB_PRESETS[0]);
  const midNewCon = priceJob(JOB_PRESETS[3]);
  const balcony = priceJob(JOB_PRESETS[2]);

  assert.equal(cheapest.price.toFixed(2), '2770.12');
  assert.equal(midNewCon.price.toFixed(2), '7975.38');
  assert.equal(balcony.price.toFixed(2), '23344.28');

  assert.match(html, /\$2,770\.12/);
  assert.match(html, /\$7,975\.38/);
  assert.match(html, /\$23,344\.28/);
  assert.match(html, /\$970\.12/);
  assert.match(html, /\$6,175\.38/);
  assert.match(html, /\$21,544\.28/);
});
