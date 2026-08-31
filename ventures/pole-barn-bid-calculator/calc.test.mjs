import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareFloor,
  formatBidSummary,
  buildingAreaSqFt,
  wallAreaSqFt,
  roofAreaSqFt,
  bayCount,
  postCount,
  trussCount,
  cubicYards,
  leanToAreaSqFt,
  heightFactor,
  suggestedFloorKit,
  suggestedShellKit,
  suggestedInsulationKit,
  suggestedElectricalKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedShellKit(),
    ...suggestedFloorKit('gravel'),
    ...suggestedInsulationKit('none'),
    ...suggestedElectricalKit('none'),
  };
  return {
    lengthFt: 40,
    widthFt: 30,
    eaveHeightFt: 10,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'gravel',
    insulation: 'none',
    electrical: 'none',
    overheadDoors: 0,
    walkDoors: 2,
    leanToWidthFt: 0,
    wainscot: false,
    hourlyWage: 28,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 180,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedShellKit(),
    ...suggestedFloorKit('slab6'),
    ...suggestedInsulationKit('full'),
    ...suggestedElectricalKit('shop'),
  };
  return {
    lengthFt: 60,
    widthFt: 40,
    eaveHeightFt: 16,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'slab6',
    insulation: 'full',
    electrical: 'shop',
    overheadDoors: 2,
    walkDoors: 2,
    leanToWidthFt: 12,
    wainscot: true,
    hourlyWage: 28,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 320,
    otherCost: 0,
    ...kit,
  };
}

test('area, walls, roof, bays, posts, and yards stack in that order', () => {
  assert.equal(buildingAreaSqFt(40, 30), 1200);
  assert.equal(wallAreaSqFt(40, 30, 10), 1400);
  const roof = roofAreaSqFt(40, 30, 4, 1.5);
  assert.ok(roof > 40 * 30);
  // Overhang extends the roof past the building on all four sides: both the
  // rake edges (length) and the eave edges (width) grow by 2x overhang
  // before the pitch factor projects the footprint onto the sloped surface.
  assert.ok(Math.abs(roof - 43 * 33 * Math.sqrt(1 + (4 / 12) ** 2)) < 1e-9);
  assert.equal(bayCount(40, 8), 5);
  assert.equal(postCount(40, 8, 2), 14);
  assert.equal(trussCount(40, 8), 6);
  assert.ok(Math.abs(cubicYards(1200, 4) - 1200 * (4 / 12) / 27) < 1e-9);
  assert.equal(leanToAreaSqFt(60, 12), 720);
  assert.throws(() => bayCount(40, 0), /greater than zero/);
});

test('roof overhang extends both the rake and eave edges, not just one', () => {
  // A version of roofAreaSqFt that only extended `length` reported 1359.78
  // sq ft here (43 * 30 * 1.054093...) instead of the correct 1495.76 sq ft
  // (43 * 33 * 1.054093...) -- a 9% undercount on roof steel and roof labor
  // that would have hit every job at the calculator's own default overhang.
  const factor = Math.sqrt(1 + (4 / 12) ** 2);
  assert.ok(Math.abs(roofAreaSqFt(40, 30, 4, 1.5) - 43 * 33 * factor) < 1e-9);
  // Zero overhang must fall back to the plain footprint times the pitch
  // factor, with no extension on either edge.
  assert.ok(Math.abs(roofAreaSqFt(40, 30, 4, 0) - 40 * 30 * factor) < 1e-9);
});

test('height factor is 8% per foot above the included eave', () => {
  assert.equal(heightFactor(10, 10), 1);
  assert.ok(Math.abs(heightFactor(16, 10) - 1.48) < 1e-9);
  assert.equal(heightFactor(8, 10), 1);
  assert.throws(() => heightFactor(12, 0), /greater than zero/);
});

test('the cheap special is a 10-foot gravel shell, not a slab shop', () => {
  const result = calculateBid(special());
  assert.equal(result.areaSqFt, 1200);
  assert.equal(result.bays, 5);
  assert.equal(result.posts, 14);
  assert.equal(result.trusses, 6);
  assert.equal(result.extraHeight, 0);
  assert.equal(result.eaveFactor, 1);
  assert.equal(result.hoursDoors > 0, true);
  assert.equal(result.hoursFloor > 0, true);
  assert.equal(result.slabCy, 0);
  assert.ok(result.gravelCy > 0);
  assert.ok(result.shares.shell > result.shares.extra);
  assert.ok(result.pricePerSqFt > 15 && result.pricePerSqFt < 45);
});

test('a 16-foot shop slab is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.areaSqFt, 2400);
  assert.equal(heavy.leanToSqFt, 720);
  assert.ok(heavy.extraHeight > 0);
  assert.ok(heavy.eaveFactor > cheap.eaveFactor);
  assert.ok(heavy.hoursFrame > cheap.hoursFrame);
  assert.ok(heavy.hoursFloor > cheap.hoursFloor);
  assert.ok(heavy.slabCy > 0);
  assert.equal(heavy.gravelCy, 0);
  assert.ok(heavy.doorMaterial > cheap.doorMaterial);
  assert.ok(heavy.insulationMaterial > 0);
  assert.ok(heavy.electricalPackage > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSqFt * heavy.areaSqFt,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.areaSqFt > cheap.price / cheap.areaSqFt);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 28 * 1.28);
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

test('compareFloor prices three floors on the same barn', () => {
  const rows = compareFloor(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const gravel = rows.find((row) => row.floor === 'gravel');
  const slab6 = rows.find((row) => row.floor === 'slab6');
  assert.ok(slab6.price > gravel.price);
  assert.ok(slab6.floorMaterial > gravel.floorMaterial);
  assert.ok(slab6.delta > 0);
});

test('extra eave adds 8% per foot only to frame hours, not trip or site', () => {
  const ten = calculateBid({ ...special(), eaveHeightFt: 10 });
  const sixteen = calculateBid({ ...special(), eaveHeightFt: 16 });
  assert.ok(Math.abs(sixteen.hoursFrame / ten.hoursFrame - 1.48) < 1e-9);
  assert.equal(sixteen.hoursTrip, ten.hoursTrip);
  assert.equal(sixteen.siteHours, ten.siteHours);
  assert.ok(sixteen.wallsSqFt > ten.wallsSqFt);
});

test('unknown floor, insulation, electrical, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), floor: 'epoxy' }), /Unknown floor/);
  assert.throws(() => calculateBid({ ...special(), insulation: 'spray' }), /Unknown insulation/);
  assert.throws(() => calculateBid({ ...special(), electrical: 'solar' }), /Unknown electrical/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedFloorKit('epoxy'), /Unknown floor/);
  assert.throws(() => suggestedInsulationKit('spray'), /Unknown insulation/);
  assert.throws(() => suggestedElectricalKit('solar'), /Unknown electrical/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedShellKit(),
      ...suggestedFloorKit(preset.floor),
      ...suggestedInsulationKit(preset.insulation),
      ...suggestedElectricalKit(preset.electrical),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 28,
      burdenRate: 28,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 180,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.posts > 0, preset.label);
  }
});

test('the customer summary names the barn and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ag barn');
  assert.match(text, /POLE BARN \/ POST-FRAME BID/);
  assert.match(text, /Ag barn/);
  assert.match(text, /gravel/i);
  assert.match(text, /10 ft eave/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a structural specification/i);
});
