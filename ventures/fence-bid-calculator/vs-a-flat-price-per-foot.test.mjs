import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat price per
// foot), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-fence-cloud.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Fence Cloud|Buildxact|JobTread|ServiceTitan|Jobber/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-foot\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-foot\.html"|href="vs-a-flat-price-per-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-foot\.html/);
});

test('the comparison page links back to the calculator and the bidding walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-to-bid-a-fence-job\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const { calculateBid, MATERIAL_PRESETS } = await import('./calc.mjs');

  // The form's own shipped defaults (index.html), not numbers invented for
  // this page.
  const rates = {
    hourlyWage: 25,
    burdenRate: 28,
    hoursPerTearOutLf: 0.18,
    tearOutPerFoot: 4,
    otherCost: 150,
    overheadRate: 15,
    targetMargin: 25,
  };

  function runFrom(presetId, overrides) {
    const preset = MATERIAL_PRESETS.find((item) => item.id === presetId);
    return {
      name: preset.label,
      materialPerLf: preset.materialPerLf,
      linePostCost: preset.linePostCost,
      terminalPostCost: preset.terminalPostCost,
      walkGateCost: preset.walkGateCost,
      driveGateCost: preset.driveGateCost,
      concretePerPost: preset.concretePerPost,
      hoursPerLf: preset.hoursPerLf,
      hoursPerPost: preset.hoursPerPost,
      hoursPerWalkGate: preset.hoursPerWalkGate,
      hoursPerDriveGate: preset.hoursPerDriveGate,
      postSpacingFt: preset.postSpacingFt,
      ...overrides,
    };
  }

  const simple = calculateBid({
    ...rates,
    dig: 'normal',
    slope: 'flat',
    tearOutFeet: 0,
    runs: [runFrom('chain-link-4', { linearFeet: 140, corners: 0, walkGates: 0, driveGates: 0 })],
  });

  // The calculator's own shipped index.html default: 140 ft wood-privacy-6,
  // 2 corners, 1 walk gate, 1 drive gate, 40 ft tear-out, heavy clay, flat.
  const defaultJob = calculateBid({
    ...rates,
    dig: 'clay',
    slope: 'flat',
    tearOutFeet: 40,
    runs: [runFrom('wood-privacy-6', { linearFeet: 140, corners: 2, walkGates: 1, driveGates: 1 })],
  });

  const heavy = calculateBid({
    ...rates,
    dig: 'rocky',
    slope: 'steep',
    tearOutFeet: 60,
    runs: [runFrom('vinyl-privacy-6', { linearFeet: 220, corners: 3, walkGates: 1, driveGates: 1 })],
  });

  assert.equal(simple.totalCost.toFixed(2), '2532.76');
  assert.equal(defaultJob.totalCost.toFixed(2), '6033.93');
  assert.equal(heavy.totalCost.toFixed(2), '16261.98');

  assert.match(html, /\$2,532\.76/);
  assert.match(html, /\$6,033\.93/);
  assert.match(html, /\$16,261\.98/);

  // The $35/ft flat rate shown is this venture's own headline anchor --
  // how-to-bid-a-fence-job.html already names "a $35\/ft Facebook quote" as
  // the flat rate a fence bid loses money matching.
  assert.match(html, /\$4,900\.00/);
  assert.match(html, /\$7,700\.00/);
  assert.match(html, /\$2,367\.24/);
  assert.match(html, /\$1,133\.93/);
  assert.match(html, /\$8,561\.98/);
});
