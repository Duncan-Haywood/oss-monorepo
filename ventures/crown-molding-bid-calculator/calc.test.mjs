import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareProfile,
  formatBidSummary,
  travelHours,
  suggestedProfileKit,
  suggestedGradeKit,
  suggestedCeilingKit,
  suggestedHeightKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedProfileKit('simple-cove'),
    ...suggestedGradeKit('paint-grade'),
    ...suggestedCeilingKit('flat'),
    ...suggestedHeightKit('standard-8'),
    ...suggestedExtraKit(),
  };
  return {
    linearFeet: 80,
    insideCorners: 8,
    outsideCorners: 0,
    rooms: 1,
    travelMiles: 8,
    grade: 'paint-grade',
    profile: 'simple-cove',
    ceiling: 'flat',
    height: 'standard-8',
    includeDemo: false,
    includeBlocking: false,
    includeLedCove: false,
    includeCasingMatch: false,
    hourlyWage: 42,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 65,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedProfileKit('built-up'),
    ...suggestedGradeKit('stain-grade'),
    ...suggestedCeilingKit('cathedral'),
    ...suggestedHeightKit('two-story-foyer'),
    ...suggestedExtraKit(),
  };
  return {
    linearFeet: 80,
    insideCorners: 14,
    outsideCorners: 4,
    rooms: 1,
    travelMiles: 18,
    grade: 'stain-grade',
    profile: 'built-up',
    ceiling: 'cathedral',
    height: 'two-story-foyer',
    includeDemo: true,
    includeBlocking: true,
    includeLedCove: true,
    includeCasingMatch: true,
    hourlyWage: 42,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 140,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.1, 8, 0.032) - (1.1 + 0.256)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.032), /must be a number/);
});

test('the cheap special is paint-grade cove on a flat 8-ft room, not a foyer', () => {
  const result = calculateBid(special());
  assert.equal(result.linearFeet, 80);
  assert.equal(result.hoursAccess, 0);
  assert.equal(result.hoursStacked, 0);
  assert.equal(result.hoursLed, 0);
  assert.equal(result.hoursDemo, 0);
  assert.equal(result.ledMaterial, 0);
  assert.ok(result.hoursRun > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursInside > 0);
  assert.ok(result.shares.run + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerLf > 6 && result.pricePerLf < 28);
});

test('a stain-grade foyer is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.linearFeet, 80);
  assert.ok(heavy.hoursRun > cheap.hoursRun);
  assert.ok(heavy.hoursInside > cheap.hoursInside);
  assert.ok(heavy.hoursAccess > 0);
  assert.ok(heavy.hoursStacked > 0);
  assert.ok(heavy.hoursLed > 0);
  assert.ok(heavy.hoursDemo > 0);
  assert.ok(heavy.ledMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerLf * heavy.linearFeet,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.linearFeet > cheap.price / cheap.linearFeet);
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

test('compareProfile prices three profiles on the same run', () => {
  const rows = compareProfile(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const cove = rows.find((row) => row.profile === 'simple-cove');
  const colonial = rows.find((row) => row.profile === 'colonial');
  const built = rows.find((row) => row.profile === 'built-up');
  assert.ok(colonial.price > cove.price);
  assert.ok(built.price > cove.price);
  assert.ok(built.hoursStacked > cove.hoursStacked);
  assert.ok(built.hoursRun > cove.hoursRun);
  assert.ok(built.delta > 0);
});

test('travel miles add hours and invoice without changing the run', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursRun, near.hoursRun);
  assert.equal(far.linearFeet, near.linearFeet);
});

test('more corners and stain-grade buy more labor than the cheap special', () => {
  const eightInside = calculateBid(special());
  const fourteenStain = calculateBid({
    ...special(),
    insideCorners: 14,
    ...suggestedGradeKit('stain-grade'),
    grade: 'stain-grade',
  });
  assert.ok(fourteenStain.hoursInside > eightInside.hoursInside);
  assert.ok(fourteenStain.moldingMaterial > eightInside.moldingMaterial);
  assert.ok(fourteenStain.hoursRun > eightInside.hoursRun);
});

test('billed feet include waste and corner drops', () => {
  const result = calculateBid(special());
  assert.ok(result.billedFeet > result.linearFeet);
  const noWaste = calculateBid({
    ...special(),
    wasteFactor: 0,
    wastePerInside: 0,
    wastePerOutside: 0,
  });
  assert.ok(Math.abs(noWaste.billedFeet - 80) < 1e-9);
});

test('unknown grade, profile, ceiling, height, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), grade: 'mdf-only' }), /Unknown grade/);
  assert.throws(() => calculateBid({ ...special(), profile: 'baseboard' }), /Unknown profile/);
  assert.throws(() => calculateBid({ ...special(), ceiling: 'barrel-vault' }), /Unknown ceiling/);
  assert.throws(() => calculateBid({ ...special(), height: 'attic' }), /Unknown height/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedProfileKit('baseboard'), /Unknown profile/);
  assert.throws(() => suggestedGradeKit('mdf-only'), /Unknown grade/);
  assert.throws(() => suggestedCeilingKit('barrel-vault'), /Unknown ceiling/);
  assert.throws(() => suggestedHeightKit('attic'), /Unknown height/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedProfileKit(preset.profile),
      ...suggestedGradeKit(preset.grade),
      ...suggestedCeilingKit(preset.ceiling),
      ...suggestedHeightKit(preset.height),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 32,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 65,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.linearFeet > 0, preset.label);
  }
});

test('the customer summary names the run and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Paint-grade cove');
  assert.match(text, /CROWN MOLDING BID/);
  assert.match(text, /Paint-grade cove/);
  assert.match(text, /Simple cove/i);
  assert.match(text, /paint-grade/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a millwork shop drawing/i);
});
