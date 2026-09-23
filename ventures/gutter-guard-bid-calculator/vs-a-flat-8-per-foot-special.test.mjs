import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-8-per-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat $8/ft
  // leaf-filter special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html and
  // vs-jobnimbus.html, which do name products and carry their own
  // "not affiliated" clauses.
  assert.doesNotMatch(html, /Jobber|JobNimbus/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/gutter-guard-bid-calculator\/vs-a-flat-8-per-foot-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped cost inputs', async () => {
  const { calculateBid, suggestedJobHours } = await import('./calc.mjs');

  const base = {
    includedFeet: 120,
    includedStories: 1,
    includedMiters: 4,
    includedDownspouts: 3,
    hoursPerExtraStory: 1.2,
    hoursPerExtra10Feet: 0.35,
    hoursPerExtraMiter: 0.15,
    hoursPerExtraDownspout: 0.25,
    hoursCleanFirstPer10Feet: 0.2,
    hoursFasciaPer10Feet: 0.8,
    hoursOccupied: 0.3,
    hoursSteepRoof: 0.9,
    siteHours: 0.5,
    miterKit: 8,
    downspoutAdapter: 22,
    fasciaBoardPer10Feet: 45,
    cleanDisposal: 35,
    hourlyWage: 36,
    burdenRate: 32,
    travelAndEquipment: 45,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: null,
  };

  // The job an $8/ft special is shopped from: a one-story ranch with
  // empty gutters, close to this venture's own JOB_PRESETS[0].
  const ranch = calculateBid({
    ...base,
    ...suggestedJobHours('screen'),
    jobType: 'screen',
    linealFeet: 140,
    stories: 1,
    miters: 4,
    extraDownspouts: 0,
    fasciaRepairFeet: 0,
    cleanFirst: false,
    occupied: false,
    steepRoof: false,
  });
  assert.equal(ranch.totalHours.toFixed(1), '2.7');
  assert.equal(ranch.price.toFixed(2), '786.71');
  assert.equal(ranch.pricePerFoot.toFixed(2), '5.62');
  assert.equal(ranch.breakEvenPrice.toFixed(2), '566.43');

  // The identical rate applied to a harder job: a two-story colonial,
  // micromesh, extra miters and downspouts, a clean-first pass, and fascia
  // repair -- this venture's own JOB_PRESETS[3].
  const colonial = calculateBid({
    ...base,
    ...suggestedJobHours('mesh'),
    jobType: 'mesh',
    linealFeet: 220,
    stories: 2,
    miters: 12,
    extraDownspouts: 2,
    fasciaRepairFeet: 16,
    cleanFirst: true,
    occupied: true,
    steepRoof: false,
  });
  assert.equal(colonial.totalHours.toFixed(1), '15.3');
  assert.equal(colonial.breakEvenPrice.toFixed(2), '3313.08');
  assert.equal(colonial.price.toFixed(2), '4601.50');
  assert.equal(colonial.pricePerFoot.toFixed(2), '20.92');

  // A flat $8/ft special applied to the colonial's own footage.
  const flatRate = 8;
  const flatQuote = flatRate * colonial.linealFeet;
  assert.equal(flatQuote.toFixed(2), '1760.00');
  assert.ok(
    flatQuote < colonial.breakEvenPrice,
    'the flat $8/ft quote should land below the colonial job\'s own break-even cost',
  );
  assert.equal((colonial.breakEvenPrice - flatQuote).toFixed(2), '1553.08');
  assert.equal((colonial.price - flatQuote).toFixed(2), '2841.50');

  assert.match(html, /\$786\.71/);
  assert.match(html, /\$5\.62/);
  assert.match(html, /\$3,313\.08/);
  assert.match(html, /\$4,601\.50/);
  assert.match(html, /\$20\.92/);
  assert.match(html, /\$1,760\.00/);
  assert.match(html, /\$1,553\.08/);
  assert.match(html, /\$2,841\.50/);
  assert.match(html, /2\.7 crew-hours/);
  assert.match(html, /15\.3 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-8-per-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-8-per-foot-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-gutter-guards\.html"/);
});
