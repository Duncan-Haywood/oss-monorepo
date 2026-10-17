import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-45-per-square-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat rate per
// square foot), not a named competitor, so it names no company and carries
// no affiliation disclaimer -- unlike this venture's own vs-buildxact.html,
// which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildxact/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-45-per-square-foot-special\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-45-per-square-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-45-per-square-foot-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The worked-example rows are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults or JOB_PRESETS ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped job presets and the form defaults', async () => {
  const {
    calculateBid,
    suggestedPostCount,
    suggestedRafterCount,
    suggestedBeamLf,
    suggestedLedgerLf,
    suggestedKneeBraceCount,
    suggestedShadeKit,
    suggestedHeightKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  // index.html's own form defaults for postSpacingFeet and
  // rafterSpacingInches (neither is overwritten by a job preset -- only
  // width, depth, attachment, shade, height, and the checkboxes are), plus
  // every hours/cost field the shade and height kits never touch.
  const postSpacingFeet = 8;
  const rafterSpacingInches = 24;
  const formDefaults = {
    hoursTrip: 2.5, hoursPerPost: 1.6, hoursPerRafter: 0.25, hoursPerBeamLf: 0.12,
    hoursLedger: 1.5, hoursKneeBrace: 0.25, hoursFan: 1.2, hoursDemo: 3, hoursSite: 0.6,
    siteHours: 0.5, beamPerLf: 22, rafterEach: 28, footingEach: 55, ledgerPerLf: 16,
    hardwareLump: 350, kneeBraceEach: 22, fanCircuitFee: 275, demoFee: 350,
    mobilizationFee: 225, permitFee: 250, hourlyWage: 32, burdenRate: 30,
    travelAndEquipment: 125, overheadRate: 15, targetMargin: 25,
  };

  function priceJob(preset) {
    const shadeKit = suggestedShadeKit(preset.shade);
    const heightKit = suggestedHeightKit(preset.height);
    const postCount = suggestedPostCount(preset.widthFeet, preset.depthFeet, postSpacingFeet, preset.attachment);
    const rafterCount = suggestedRafterCount(preset.widthFeet, rafterSpacingInches);
    const beamLf = suggestedBeamLf(preset.widthFeet, preset.depthFeet, postSpacingFeet, preset.attachment);
    const ledgerLf = suggestedLedgerLf(preset.widthFeet, preset.attachment);
    const footingCount = postCount;
    const kneeBraceCount = suggestedKneeBraceCount(postCount, preset.includeKneeBraces);

    return calculateBid({
      ...formDefaults,
      widthFeet: preset.widthFeet,
      depthFeet: preset.depthFeet,
      postSpacingFeet,
      rafterSpacingInches,
      attachment: preset.attachment,
      shade: preset.shade,
      height: preset.height,
      includeKneeBraces: preset.includeKneeBraces,
      includeFanCircuit: preset.includeFanCircuit,
      includePermit: preset.includePermit,
      demoExisting: preset.demoExisting,
      hoursPer100SfShade: shadeKit.hoursPer100Sf,
      shadePerSf: shadeKit.shadePerSf,
      postEach: heightKit.postEach,
      extraHoursPerPost: heightKit.extraHoursPerPost,
      postCount, rafterCount, beamLf, ledgerLf, footingCount, kneeBraceCount,
    });
  }

  const FLAT_RATE_PER_SF = 45;
  const easyOpen = priceJob(JOB_PRESETS[0]); // 10x10 freestanding, 8 ft, open cedar
  const easySlats = priceJob(JOB_PRESETS[1]); // 12x16 attached, 8 ft, shade slats
  const hardLouvered = priceJob(JOB_PRESETS[2]); // 12x16 attached, 10 ft, louvered, fan
  const bigDemo = priceJob(JOB_PRESETS[3]); // 16x20 freestanding, 12 ft, polycarbonate, demo, permit

  assert.equal(easyOpen.footprintSf, 100);
  assert.equal(easySlats.footprintSf, 192);
  assert.equal(hardLouvered.footprintSf, 192);
  assert.equal(bigDemo.footprintSf, 320);

  assert.equal(easyOpen.totalCost.toFixed(2), '2813.18');
  assert.equal(easyOpen.price.toFixed(2), '3750.90');
  assert.equal(easySlats.totalCost.toFixed(2), '4840.90');
  assert.equal(easySlats.price.toFixed(2), '6454.54');
  assert.equal(hardLouvered.totalCost.toFixed(2), '8210.93');
  assert.equal(hardLouvered.price.toFixed(2), '10947.91');
  assert.equal(bigDemo.totalCost.toFixed(2), '11792.29');
  assert.equal(bigDemo.price.toFixed(2), '15723.06');

  const flatOf = (job) => job.footprintSf * FLAT_RATE_PER_SF;
  const marginPctOf = (job) => ((flatOf(job) - job.totalCost) / flatOf(job)) * 100;

  assert.equal(flatOf(easyOpen).toFixed(2), '4500.00');
  assert.equal(flatOf(easySlats).toFixed(2), '8640.00');
  assert.equal(flatOf(hardLouvered).toFixed(2), '8640.00');
  assert.equal(flatOf(bigDemo).toFixed(2), '14400.00');

  assert.equal(marginPctOf(easyOpen).toFixed(1), '37.5');
  assert.equal(marginPctOf(easySlats).toFixed(1), '44.0');
  assert.equal(marginPctOf(hardLouvered).toFixed(1), '5.0');
  assert.equal(marginPctOf(bigDemo).toFixed(1), '18.1');

  assert.equal((hardLouvered.price - flatOf(hardLouvered)).toFixed(2), '2307.91');
  assert.equal((bigDemo.price - flatOf(bigDemo)).toFixed(2), '1323.06');

  assert.match(html, /\$4,500\.00/);
  assert.match(html, /\$2,813\.18/);
  assert.match(html, /\$3,750\.90/);
  assert.match(html, /37\.5%/);
  assert.match(html, /\$8,640\.00/);
  assert.match(html, /\$4,840\.90/);
  assert.match(html, /\$6,454\.54/);
  assert.match(html, /44\.0%/);
  assert.match(html, /\$8,210\.93/);
  assert.match(html, /\$10,947\.91/);
  assert.match(html, /5\.0%/);
  assert.match(html, /\$2,307\.91/);
  assert.match(html, /\$14,400\.00/);
  assert.match(html, /\$11,792\.29/);
  assert.match(html, /\$15,723\.06/);
  assert.match(html, /18\.1%/);
  assert.match(html, /\$1,323\.06/);
});
