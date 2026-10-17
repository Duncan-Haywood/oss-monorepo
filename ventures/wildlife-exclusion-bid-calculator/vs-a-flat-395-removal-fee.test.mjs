import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-395-removal-fee.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, wildlife-regulation, veterinary, tax, financial, or insurance advice/i);
});

// This page compares against a generic pricing method (a flat removal fee),
// not a named competitor, so it names no company and carries no affiliation
// disclaimer -- unlike vs-pestpac.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /PestPac|WorkWave/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-395-removal-fee\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-395-removal-fee\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-395-removal-fee\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/what-to-charge-for-wildlife-exclusion\.html"/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The "mid" job matches
// index.html's own shipped default form values exactly, so a reader who
// opens the calculator with nothing changed sees this page's own middle row.
test('the worked-example table figures match calc.mjs run against the stated jobs', async () => {
  const { calculateBid, flatFeeGap } = await import('./calc.mjs');

  const shop = {
    hourlyWage: 25, burdenRate: 52, milesOneWay: 14, ratePerMile: 0.85, driveMinutesOneWay: 22,
    overheadRate: 14, targetMargin: 22, warrantyYears: 3, warrantyReservePct: 8,
    scheduledMonth: 10, proposedPrice: null,
  };

  const easy = calculateBid({
    ...shop,
    species: 'groundhog', heightTier: 'ground',
    crewSize: 1, trapCheckCrewSize: 1,
    separateInspection: false, inspectionMinutes: 0, inspectionBillable: true,
    trapsSet: 1, trapSetMinutes: 10, trapDays: 2, trapChecksPerDay: 1, minutesPerTrapCheck: 15, consumablesPerTrap: 7,
    exclusionLinearFeet: 40, exclusionMinutesPerFoot: 1.2, exclusionMaterialPerFoot: 2.75,
    oneWayDoors: 1, doorMinutesEach: 30, doorCostEach: 40, doorRemovalVisit: true, doorRemovalMinutes: 20,
    liftRentalCost: 0,
    deconSquareFeet: 0, deconMinutesPer100SqFt: 0, deconMaterialPer100SqFt: 0,
    insulationRemoveSqFt: 0, insulationRemoveCostPerSqFt: 0, insulationReplaceSqFt: 0, insulationReplaceCostPerSqFt: 0,
    disposalFee: 40, repairCost: 60,
  });

  const mid = calculateBid({
    species: 'raccoon', heightTier: 'two', scheduledMonth: 10,
    crewSize: 2, trapCheckCrewSize: 1, hourlyWage: 25, burdenRate: 52,
    milesOneWay: 14, ratePerMile: 0.85, driveMinutesOneWay: 22,
    separateInspection: false, inspectionMinutes: 45, inspectionBillable: true,
    trapsSet: 3, trapSetMinutes: 12, trapDays: 5, trapChecksPerDay: 1, minutesPerTrapCheck: 25, consumablesPerTrap: 7,
    exclusionLinearFeet: 45, exclusionMinutesPerFoot: 1.4, exclusionMaterialPerFoot: 3.20,
    oneWayDoors: 1, doorMinutesEach: 35, doorCostEach: 45, doorRemovalVisit: true, doorRemovalMinutes: 25,
    liftRentalCost: 350,
    deconSquareFeet: 250, deconMinutesPer100SqFt: 45, deconMaterialPer100SqFt: 55,
    insulationRemoveSqFt: 250, insulationRemoveCostPerSqFt: 1.40, insulationReplaceSqFt: 250, insulationReplaceCostPerSqFt: 1.90,
    disposalFee: 90, repairCost: 160,
    warrantyYears: 3, warrantyReservePct: 8, overheadRate: 14, targetMargin: 22,
    proposedPrice: null,
  });

  const hard = calculateBid({
    ...shop,
    species: 'bat', heightTier: 'lift',
    crewSize: 2, trapCheckCrewSize: 1,
    separateInspection: true, inspectionMinutes: 45, inspectionBillable: true,
    trapsSet: 0, trapSetMinutes: 0, trapDays: 0, trapChecksPerDay: 0, minutesPerTrapCheck: 0, consumablesPerTrap: 0,
    exclusionLinearFeet: 90, exclusionMinutesPerFoot: 1.6, exclusionMaterialPerFoot: 3.50,
    oneWayDoors: 3, doorMinutesEach: 40, doorCostEach: 55, doorRemovalVisit: true, doorRemovalMinutes: 30,
    liftRentalCost: 350,
    deconSquareFeet: 400, deconMinutesPer100SqFt: 50, deconMaterialPer100SqFt: 60,
    insulationRemoveSqFt: 400, insulationRemoveCostPerSqFt: 1.40, insulationReplaceSqFt: 400, insulationReplaceCostPerSqFt: 1.90,
    disposalFee: 120, repairCost: 220,
  });

  assert.equal(easy.breakEvenPrice.toFixed(2), '645.18');
  assert.equal(mid.breakEvenPrice.toFixed(2), '2740.42');
  assert.equal(hard.breakEvenPrice.toFixed(2), '4866.77');

  const flatFee = 395;
  assert.equal(flatFeeGap(flatFee, easy).shortfall.toFixed(2), '250.18');
  assert.equal(flatFeeGap(flatFee, mid).shortfall.toFixed(2), '2345.42');
  assert.equal(flatFeeGap(flatFee, hard).shortfall.toFixed(2), '4471.77');

  assert.match(html, /\$395\.00/);
  assert.match(html, /\$645\.18/);
  assert.match(html, /\$2,740\.42/);
  assert.match(html, /\$4,866\.77/);
  assert.match(html, /\$250\.18/);
  assert.match(html, /\$2,345\.42/);
  assert.match(html, /\$4,471\.77/);
});
