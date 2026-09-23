import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-99-dollar-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the nothing-leaves-your-browser notice and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat $99 special),
// not a named competitor, so it names no company and carries no affiliation
// disclaimer -- unlike vs-wepro.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /WePro|ServiceTitan|Jobber|Housecall Pro/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-99-dollar-special\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-99-dollar-special\.html"|href="vs-a-flat-99-dollar-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-99-dollar-special\.html/);
});

test('the comparison page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-for-dryer-vent-cleaning\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults ever change, this
// page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped defaults', async () => {
  const { calculateBid, suggestedJobHours, JOB_PRESETS } = await import('./calc.mjs');

  // The form's own shipped defaults (index.html), not numbers invented for
  // this page.
  const rates = {
    includedStories: 1,
    includedRunFeet: 8,
    includedDryers: 1,
    hoursPerExtraStory: 0.45,
    hoursPerExtra10Feet: 0.25,
    hoursPerExtraDryer: 0.55,
    hoursCamera: 0.35,
    hoursFlex: 0.5,
    hoursNest: 0.75,
    hoursOccupied: 0.25,
    siteHours: 0.4,
    brushKit: 18,
    extraRodPer10Feet: 6,
    cameraFee: 45,
    flexKit: 38,
    nestDisposal: 22,
    roofSafetyKit: 55,
    hourlyWage: 38,
    burdenRate: 32,
    travelAndEquipment: 35,
    overheadRate: 16,
    targetMargin: 28,
  };

  function run(job) {
    const hours = suggestedJobHours(job.jobType);
    return calculateBid({ ...rates, ...hours, ...job });
  }

  const [simple, twoStory, roof, duplex] = JOB_PRESETS.map(run);

  assert.equal(simple.totalCost.toFixed(2), '128.39');
  assert.equal(twoStory.totalCost.toFixed(2), '196.45');
  assert.equal(roof.totalCost.toFixed(2), '392.14');
  assert.equal(duplex.totalCost.toFixed(2), '507.23');

  assert.match(html, /\$128\.39/);
  assert.match(html, /\$196\.45/);
  assert.match(html, /\$392\.14/);
  assert.match(html, /\$507\.23/);

  // $99 is this venture's own headline anchor -- calc.mjs's own JOB_PRESETS
  // label the shortest job "the $99 special", and index.html's meta
  // description names the same figure.
  assert.match(html, /\$29\.39/);
  assert.match(html, /\$97\.45/);
  assert.match(html, /\$293\.14/);
  assert.match(html, /\$408\.23/);
});
