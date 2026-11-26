import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareType,
  formatBidSummary,
  travelHours,
  suggestedTypeKit,
  suggestedScopeKit,
  suggestedRoofKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedTypeKit('tubular'),
    ...suggestedScopeKit('replace-existing'),
    ...suggestedRoofKit('asphalt'),
    ...suggestedExtraKit(),
  };
  return {
    units: 1,
    shafts: 0,
    stories: 1,
    type: 'tubular',
    scope: 'replace-existing',
    roof: 'asphalt',
    travelMiles: 8,
    includeIceWater: false,
    includeLaminated: false,
    includePaint: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 75,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedTypeKit('venting-solar'),
    ...suggestedScopeKit('new-cut-in'),
    ...suggestedRoofKit('tile-or-metal'),
    ...suggestedExtraKit(),
  };
  return {
    units: 3,
    shafts: 3,
    stories: 2,
    type: 'venting-solar',
    scope: 'new-cut-in',
    roof: 'tile-or-metal',
    travelMiles: 22,
    includeIceWater: true,
    includeLaminated: true,
    includePaint: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 140,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 8, 0.035) - (1.4 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is one tubular replace, not a venting tile cut-in', () => {
  const result = calculateBid(special());
  assert.equal(result.units, 1);
  assert.equal(result.hoursShafts, 0);
  assert.equal(result.hoursIceWater, 0);
  assert.equal(result.hoursLaminated, 0);
  assert.equal(result.hoursPaint, 0);
  assert.equal(result.hoursStories, 0);
  assert.equal(result.laminatedMaterial, 0);
  assert.ok(result.hoursUnits > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursPull > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerUnit > 400 && result.pricePerUnit < 2200);
});

test('a venting tile cut-in is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.units, 3);
  assert.ok(heavy.hoursUnits > cheap.hoursUnits);
  assert.ok(heavy.hoursCut > cheap.hoursCut);
  assert.ok(heavy.hoursFraming > cheap.hoursFraming);
  assert.ok(heavy.hoursRoof > cheap.hoursRoof);
  assert.ok(heavy.hoursShafts > 0);
  assert.ok(heavy.hoursIceWater > 0);
  assert.ok(heavy.hoursLaminated > 0);
  assert.ok(heavy.hoursPaint > 0);
  assert.ok(heavy.hoursStories > 0);
  assert.ok(heavy.roofFlashMaterial > 0);
  assert.ok(heavy.laminatedMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerUnit * heavy.units,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.units > cheap.price / cheap.units);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 42 * 1.3);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareType prices three unit types on the same openings', () => {
  const rows = compareType(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const tubular = rows.find((row) => row.type === 'tubular');
  const fixed = rows.find((row) => row.type === 'fixed');
  const venting = rows.find((row) => row.type === 'venting-solar');
  assert.ok(fixed.price > tubular.price);
  assert.ok(venting.price > tubular.price);
  assert.ok(venting.unitMaterial > tubular.unitMaterial);
  assert.ok(venting.hoursUnits > tubular.hoursUnits);
  assert.ok(venting.delta > 0);
});

test('travel miles add hours and invoice without changing the unit count', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursUnits, near.hoursUnits);
  assert.equal(far.units, near.units);
});

test('a second story and shafts add hours the $800 special cannot see', () => {
  const oneStory = calculateBid(special());
  const twoStory = calculateBid({ ...special(), stories: 2, shafts: 1, includePaint: true });
  assert.ok(twoStory.hoursStories > oneStory.hoursStories);
  assert.ok(twoStory.hoursShafts > 0);
  assert.ok(twoStory.hoursPaint > 0);
  assert.ok(twoStory.price > oneStory.price);
});

test('unknown type, scope, roof, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), type: 'casement-window' }), /Unknown type/);
  assert.throws(() => calculateBid({ ...special(), scope: 'reroof' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), roof: 'standing-seam-house' }), /Unknown roof/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedTypeKit('casement-window'), /Unknown type/);
  assert.throws(() => suggestedScopeKit('reroof'), /Unknown scope/);
  assert.throws(() => suggestedRoofKit('standing-seam-house'), /Unknown roof/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedTypeKit(preset.type),
      ...suggestedScopeKit(preset.scope),
      ...suggestedRoofKit(preset.roof),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 75,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.units > 0, preset.label);
  }
});

test('extraCost never double-counts extras labor already inside laborCost', () => {
  // Regression: extraCost used to add the loaded-wage cost of every extras
  // hour on top of extraHardware, but those hours are already inside
  // laborCost/totalHours -- so any job with real extras charged that labor
  // twice in the displayed cost breakdown. extraCost must equal exactly
  // extraHardware: the extras' material/invoice spend, no labor re-added.
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedTypeKit(preset.type),
      ...suggestedScopeKit(preset.scope),
      ...suggestedRoofKit(preset.roof),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 75,
      otherCost: 0,
      ...kit,
    });
    assert.ok(Math.abs(result.extraCost - result.extraHardware) < 1e-9, preset.label);
  }
});

test('the customer summary names the units and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Tubular sun tunnel');
  assert.match(text, /SKYLIGHT INSTALL BID/);
  assert.match(text, /Tubular sun tunnel/);
  assert.match(text, /Replace existing/i);
  assert.match(text, /tubular/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a roofing specification/i);
});

// Round 105 audit (portfolio/quality/audits/2026-11-23-skylight-install-bid-calculator.json):
// the customer-supplied article's figures held only at $0 travel and equipment, which it
// did not say. Pin them to the engine and to the stated assumption.
test('customer-supplied article walk-aways match the engine at the stated $0 travel and equipment', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./should-i-install-a-customer-supplied-skylight.html', import.meta.url), 'utf8');
  assert.match(html, /travel-and-equipment line set to \$0/);
  const j = JOB_PRESETS[0];
  const kit = { ...suggestedExtraKit(), ...suggestedTypeKit(j.type), ...suggestedScopeKit(j.scope), ...suggestedRoofKit(j.roof) };
  const base = { ...j, hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 20, travelAndEquipment: 0, ...kit };
  const supplied = calculateBid(base).totalCost;
  const owner = calculateBid({ ...base, unitInvoice: 0, flashingInvoice: 0 }).totalCost;
  assert.equal(Math.round(supplied), 1018);
  assert.equal(Math.round(owner), 483);
  assert.equal(Math.round(owner - 350), 133);
  const withDefault = calculateBid({ ...base, travelAndEquipment: 75 }).totalCost;
  assert.equal(Math.round(withDefault - supplied), 86);
});

// Quality audit 2026-11-23 (same file): four seeded mutants in the pricing
// engine survived the suite. Each test below fails on one of them, with the
// expected figure worked by hand.

function typical() {
  return {
    ...special(),
    ...suggestedTypeKit('fixed'),
    ...suggestedScopeKit('new-cut-in'),
    units: 2, shafts: 2, stories: 1, type: 'fixed', scope: 'new-cut-in', roof: 'asphalt',
    travelMiles: 12, includeIceWater: true, includePaint: true,
  };
}

const near = (actual, expected, tol = 1e-6) => assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);

test('the Typical job recomputed line by line by hand', () => {
  const r = calculateBid(typical());
  // hours: trip 1.4 + 12 mi x 0.035 = 1.82; units 2 x 4.5 = 9; cut 2 x 1.6 = 3.2;
  // framing 2 x 1.4 = 2.8; roof 2 x 0.6 = 1.2; shafts 2 x 2.8 = 5.6;
  // ice 2 x 0.7 = 1.4; paint 2 shafts x 1.1 = 2.2; site 1 -> 28.22 h
  near(r.totalHours, 28.22);
  // labour 28.22 h x $42 x 1.30 = $1,540.812
  near(r.laborCost, 1540.812);
  // material 2x720 + 2x140 + 2x95 + 2x45 + 2x55 + 12 mi x 2.8 = 2,143.60
  near(r.materialCost, 2143.6);
  // direct 1,540.812 + 2,143.60 + 75 = 3,759.412; +15% = 4,323.3238; / 0.8
  near(r.totalCost, 4323.3238);
  near(r.price, 5404.15475);
});

test('story hours scale with units: three units up a second story is 2.4 h, not 0.8', () => {
  near(calculateBid({ ...special(), units: 3, stories: 2 }).hoursStories, 2.4);
});

test('shaft paint is per shaft, not per unit', () => {
  const r = calculateBid({ ...special(), units: 3, shafts: 1, includePaint: true });
  near(r.hoursPaint, 1.1);
  assert.equal(r.paintMaterial, 55);
});

test('laminated glass is charged on every unit', () => {
  const r = calculateBid({ ...special(), units: 3, includeLaminated: true });
  assert.equal(r.laminatedMaterial, 540);
  near(r.hoursLaminated, 0.9);
});

test('a price above cost but below the target price is not a losing bid', () => {
  const r = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: (r.totalCost + r.price) / 2 });
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(scored.proposed.profit > 0);
});

// Audit defect 1: Number('') is 0, so a cleared field priced the job silently.
test('a blank field is an error that names the field, not a silent zero', () => {
  assert.throws(() => calculateBid({ ...special(), hourlyWage: '' }), /Hourly wage is blank/);
  assert.throws(() => calculateBid({ ...special(), units: '  ' }), /Units is blank/);
  assert.equal(calculateBid({ ...special(), otherCost: '0' }).softCost, 75);
});

test('units, shafts and stories must be whole numbers', () => {
  assert.throws(() => calculateBid({ ...special(), units: 2.5 }), /Units must be a whole number/);
  assert.throws(() => calculateBid({ ...special(), shafts: '1.5' }), /Shafts must be a whole number/);
  assert.throws(() => calculateBid({ ...special(), stories: 1.5 }), /Stories must be a whole number/);
});

// Audit defect 2: a tube passes between rafters and is its own shaft.
test('a tubular cut-in has no framing, and glass cut-ins keep theirs', () => {
  assert.deepEqual(suggestedScopeKit('new-cut-in', 'tubular'),
    { cutHoursPerUnit: 1.2, pullHoursPerUnit: 0, framingHoursPerUnit: 0 });
  assert.equal(suggestedScopeKit('new-cut-in', 'fixed').framingHoursPerUnit, 1.4);
  assert.equal(suggestedScopeKit('new-cut-in').framingHoursPerUnit, 1.4);
  assert.equal(suggestedScopeKit('replace-existing', 'tubular').framingHoursPerUnit, 0.3);
});

test('the comparison prices the tube row without drywall shafts or framing', () => {
  const rows = compareType(typical());
  const tube = rows.find((row) => row.type === 'tubular');
  // 2 tubes, cut-in: trip 1.82 + units 2 x 2.5 + cut 2 x 1.2 + roof 1.2 + ice 1.4 + site 1 = 12.82 h
  near(tube.totalHours, 12.82);
  near(rows.find((row) => row.type === 'fixed').totalHours, 28.22);
  assert.ok(rows.every((row) => Number.isFinite(row.extraShare)));
});

test('a tube with drywall shafts is priced as typed but flagged', () => {
  const r = calculateBid({ ...special(), shafts: 1 });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /its own light shaft/);
  assert.deepEqual(calculateBid(special()).warnings, []);
});

// Audit defect 8: the FAQ's dollar and hour figures are prose; tie them to the engine.
test('the index FAQ figures match the engine on the page defaults', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const r = calculateBid(special());
  const fmt = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const kit = suggestedTypeKit('tubular');
  for (const figure of [fmt(r.price), fmt(r.travelInvoice), `${r.hoursTravel.toFixed(2)} hours`,
    `${r.totalHours.toFixed(2)} hours`, `$${kit.flashingInvoice} of flashing`, `$${kit.unitInvoice} unit`]) {
    assert.ok(html.includes(figure), `FAQ is missing ${figure}`);
  }
});
