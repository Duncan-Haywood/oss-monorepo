import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-249-windshield-coupon.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not automotive, legal, tax, financial, or engineering advice/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat coupon rate),
// not a named competitor, so it names no company and carries no affiliation
// disclaimer.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /affiliated/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-249-windshield-coupon\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-249-windshield-coupon\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-249-windshield-coupon\.html/);
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
    suggestedGlassKit,
    suggestedSourceKit,
    suggestedCalibrationKit,
    suggestedServiceKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  // index.html's own form defaults for every field a preset never touches
  // (position/glassSource/calibration/service pick hoursRR, moldingCost,
  // glassCost, hoursCalibration, calibrationCost, tripFee, tripHours via the
  // suggested*Kit functions; addWiperService stays unchecked).
  const formDefaults = {
    wiperServiceHours: 0.1, siteHours: 0.25, urethaneKitCost: 30, wiperServiceCost: 12,
    hourlyWage: 28, burdenRate: 22, travelAndEquipment: 25, overheadRate: 14,
    targetMargin: 32, cashDiscountPercent: 0, deductible: 0,
  };

  function priceJob(job) {
    const glassKit = suggestedGlassKit(job.position);
    const sourceKit = suggestedSourceKit(job.glassSource);
    const calKit = suggestedCalibrationKit(job.calibration);
    const svcKit = suggestedServiceKit(job.service);
    return calculateBid({
      ...formDefaults,
      position: job.position,
      glassSource: job.glassSource,
      calibration: job.calibration,
      service: job.service,
      payer: job.payer,
      addWiperService: false,
      hoursRR: glassKit.hoursRR,
      moldingCost: glassKit.moldingCost,
      glassCost: sourceKit.glassCost,
      hoursCalibration: calKit.hoursCalibration,
      calibrationCost: calKit.calibrationCost,
      tripHours: svcKit.tripHours,
      tripFee: svcKit.tripFee,
    });
  }

  const FLAT_COUPON = 249;
  const couponJob = priceJob(JOB_PRESETS[0]); // economy aftermarket, no ADAS, in-shop
  const dynamicJob = priceJob(JOB_PRESETS[1]); // OEE, dynamic calibration, mobile, insurance
  const dualJob = priceJob(JOB_PRESETS[2]); // OEM, static + dynamic calibration, mobile, insurance

  assert.equal(couponJob.totalCost.toFixed(2), '428.77');
  assert.equal(couponJob.price.toFixed(2), '630.55');
  assert.equal(dynamicJob.totalCost.toFixed(2), '773.57');
  assert.equal(dynamicJob.price.toFixed(2), '1137.60');
  assert.equal(dualJob.totalCost.toFixed(2), '1266.70');
  assert.equal(dualJob.price.toFixed(2), '1862.80');

  const shortfall = (job) => (job.totalCost - FLAT_COUPON).toFixed(2);
  assert.equal(shortfall(couponJob), '179.77');
  assert.equal(shortfall(dynamicJob), '524.57');
  assert.equal(shortfall(dualJob), '1017.70');

  assert.match(html, /\$249\.00/);
  assert.match(html, /\$428\.77/);
  assert.match(html, /\$630\.55/);
  assert.match(html, /\$179\.77/);
  assert.match(html, /\$773\.57/);
  assert.match(html, /\$1,137\.60/);
  assert.match(html, /\$524\.57/);
  assert.match(html, /\$1,266\.70/);
  assert.match(html, /\$1,862\.80/);
  assert.match(html, /\$1,017\.70/);
});
