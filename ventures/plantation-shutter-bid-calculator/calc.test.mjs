import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  travelHours,
  openingSquareFeet,
  suggestedScopeKit,
  suggestedMountKit,
  suggestedGradeKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('product-install'),
    ...suggestedMountKit('inside'),
    ...suggestedGradeKit('paint'),
    ...suggestedExtraKit(),
  };
  return {
    openings: 6,
    widthIn: 30,
    heightIn: 60,
    panelsPerOpening: 2,
    stories: 1,
    scope: 'product-install',
    mount: 'inside',
    grade: 'paint',
    travelMiles: 8,
    includeRemoval: false,
    includeSpecialty: false,
    includeBypass: false,
    includeCafe: false,
    hourlyWage: 42,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 75,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('template-custom'),
    ...suggestedMountKit('outside'),
    ...suggestedGradeKit('stain'),
    ...suggestedExtraKit(),
  };
  return {
    openings: 8,
    widthIn: 48,
    heightIn: 80,
    panelsPerOpening: 4,
    stories: 2,
    scope: 'template-custom',
    mount: 'outside',
    grade: 'stain',
    travelMiles: 22,
    includeRemoval: true,
    includeSpecialty: true,
    includeBypass: true,
    includeCafe: false,
    hourlyWage: 42,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 160,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.2, 8, 0.035) - (1.2 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('opening square footage is width times height times count, in feet', () => {
  assert.ok(Math.abs(openingSquareFeet(6, 30, 60) - 75) < 1e-9);
  assert.ok(openingSquareFeet(8, 48, 80) > openingSquareFeet(6, 30, 60));
});

test('the cheap special is a paint-grade inside hang, not a template mill job', () => {
  const result = calculateBid(special());
  assert.equal(result.openings, 6);
  assert.equal(result.hoursMeasure, 0);
  assert.equal(result.hoursTemplate, 0);
  assert.equal(result.hoursRemoval, 0);
  assert.equal(result.hoursSpecialty, 0);
  assert.equal(result.hoursBypass, 0);
  assert.equal(result.hoursCafe, 0);
  assert.equal(result.hoursStory, 0);
  assert.equal(result.removalMaterial, 0);
  assert.equal(result.specialtyMaterial, 0);
  assert.ok(result.hoursHang > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursOpenings > 0);
  assert.ok(result.shares.plant + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerOpening > 400 && result.pricePerOpening < 2500);
});

test('a template stain-grade house is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.openings, 8);
  assert.ok(heavy.hoursHang > cheap.hoursHang);
  assert.ok(heavy.hoursTemplate > 0);
  assert.ok(heavy.hoursRemoval > 0);
  assert.ok(heavy.hoursSpecialty > 0);
  assert.ok(heavy.hoursBypass > 0);
  assert.ok(heavy.hoursStory > 0);
  assert.ok(heavy.removalMaterial > 0);
  assert.ok(heavy.specialtyMaterial > 0);
  assert.ok(heavy.bypassMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerOpening * heavy.openings,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.openings > cheap.price / cheap.openings);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 42 * 1.32);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...special(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices three scopes on the same openings', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const hang = rows.find((row) => row.scope === 'product-install');
  const measure = rows.find((row) => row.scope === 'measure-install');
  const custom = rows.find((row) => row.scope === 'template-custom');
  assert.ok(measure.price > hang.price);
  assert.ok(custom.price > hang.price);
  assert.ok(custom.hoursTemplate > hang.hoursTemplate);
  assert.ok(measure.hoursMeasure > hang.hoursMeasure);
  assert.ok(custom.delta > 0);
});

test('travel miles add hours and invoice without changing the hang', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursHang, near.hoursHang);
  assert.equal(far.openings, near.openings);
});

test('more openings and larger panels buy more labor than the cheap special', () => {
  const sixSmall = calculateBid(special());
  const eightWide = calculateBid({ ...special(), openings: 8, widthIn: 48, heightIn: 80, panelsPerOpening: 4 });
  assert.ok(eightWide.hoursOpenings > sixSmall.hoursOpenings);
  assert.ok(eightWide.panelMaterial > sixSmall.panelMaterial);
  assert.ok(eightWide.hoursPanels > sixSmall.hoursPanels);
  assert.ok(eightWide.hoursSize > sixSmall.hoursSize);
  assert.ok(eightWide.shutterMaterial > sixSmall.shutterMaterial);
});

test('unknown scope, mount, grade, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'window-swap' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), mount: 'nailing-flange' }), /Unknown mount/);
  assert.throws(() => calculateBid({ ...special(), grade: 'vinyl' }), /Unknown grade/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('window-swap'), /Unknown scope/);
  assert.throws(() => suggestedMountKit('nailing-flange'), /Unknown mount/);
  assert.throws(() => suggestedGradeKit('vinyl'), /Unknown grade/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedMountKit(preset.mount),
      ...suggestedGradeKit(preset.grade),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 32,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 75,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.openings > 0, preset.label);
  }
});

test('the customer summary names the openings and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Paint-grade hang');
  assert.match(text, /PLANTATION SHUTTER BID/);
  assert.match(text, /Paint-grade hang/);
  assert.match(text, /Product-on-site/i);
  assert.match(text, /Inside mount/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a window replacement/i);
});
