import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareRail,
  compareChair,
  compareOwnerSupply,
  ownerSupplyNote,
  formatBidSummary,
  travelHours,
  suggestedRailKit,
  suggestedChairKit,
  suggestedAttachKit,
  suggestedExtraKit,
  suggestedOwnerCallbackKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedRailKit('straight-one'),
    ...suggestedChairKit('standard'),
    ...suggestedAttachKit('wood'),
    ...suggestedExtraKit(),
  };
  return {
    liftCount: 1,
    rail: 'straight-one',
    chair: 'standard',
    attach: 'wood',
    travelMiles: 8,
    includeFoldingRail: false,
    includeExtraCharge: false,
    includeCircuit: false,
    includeRemoveExisting: false,
    includePermit: false,
    includeWeatherKit: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedRailKit('curved'),
    ...suggestedChairKit('heavy-duty'),
    ...suggestedAttachKit('open-riser'),
    ...suggestedExtraKit(),
  };
  return {
    liftCount: 1,
    rail: 'curved',
    chair: 'heavy-duty',
    attach: 'open-riser',
    travelMiles: 22,
    includeFoldingRail: true,
    includeExtraCharge: true,
    includeCircuit: true,
    includeRemoveExisting: true,
    includePermit: true,
    includeWeatherKit: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 220,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.6, 8, 0.035) - (1.6 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is a straight rail standard chair, not a curved-plus-circuit job', () => {
  const result = calculateBid(special());
  assert.equal(result.liftCount, 1);
  assert.equal(result.hoursFold, 0);
  assert.equal(result.hoursCharge, 0);
  assert.equal(result.hoursCircuit, 0);
  assert.equal(result.hoursRemove, 0);
  assert.equal(result.hoursPermit, 0);
  assert.equal(result.hoursWeather, 0);
  assert.equal(result.foldMaterial, 0);
  assert.ok(result.hoursRail > 0);
  assert.ok(result.hoursChair > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.fixture + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerLift > 3000 && result.pricePerLift < 12000);
});

test('a curved heavy-duty open-riser job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.liftCount, 1);
  assert.ok(heavy.hoursRail > cheap.hoursRail);
  assert.ok(heavy.hoursSet > cheap.hoursSet);
  assert.ok(heavy.hoursChair > cheap.hoursChair);
  assert.ok(heavy.hoursFold > 0);
  assert.ok(heavy.hoursCircuit > 0);
  assert.ok(heavy.hoursRemove > 0);
  assert.ok(heavy.railMaterial > cheap.railMaterial);
  assert.ok(heavy.foldMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerLift * heavy.liftCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.liftCount > cheap.price / cheap.liftCount);
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

test('compareRail prices four rails on the same stair', () => {
  const rows = compareRail(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const straight = rows.find((row) => row.rail === 'straight-one');
  const landing = rows.find((row) => row.rail === 'straight-landing');
  const curved = rows.find((row) => row.rail === 'curved');
  const outdoor = rows.find((row) => row.rail === 'outdoor-straight');
  assert.ok(straight);
  assert.ok(outdoor);
  assert.ok(landing.price > straight.price);
  assert.ok(curved.price > landing.price);
  assert.ok(curved.hoursSet > straight.hoursSet);
  assert.ok(curved.delta > 0);
});

test('compareChair prices five chairs on the same stair', () => {
  const rows = compareChair(special());
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const standard = rows.find((row) => row.chair === 'standard');
  const swivel = rows.find((row) => row.chair === 'power-swivel');
  const heavy = rows.find((row) => row.chair === 'heavy-duty');
  assert.ok(standard);
  assert.ok(swivel.price > standard.price);
  assert.ok(heavy.price > standard.price);
  assert.ok(swivel.upgradeFromStandard > 0);
  assert.equal(standard.upgradeFromStandard, 0);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), rail: 'nope' }), /Unknown rail/);
  assert.throws(() => calculateBid({ ...special(), chair: 'nope' }), /Unknown chair/);
  assert.throws(() => calculateBid({ ...special(), attach: 'nope' }), /Unknown attach/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedRailKit('nope'), /Unknown rail/);
  assert.throws(() => suggestedChairKit('nope'), /Unknown chair/);
  assert.throws(() => suggestedAttachKit('nope'), /Unknown attach/);
});

test('job presets cover the cheap special and the losing curved job', () => {
  assert.ok(JOB_PRESETS.some((job) => job.rail === 'straight-one' && job.chair === 'standard'));
  assert.ok(JOB_PRESETS.some((job) => job.rail === 'curved' && job.chair === 'heavy-duty'));
  assert.ok(JOB_PRESETS.some((job) => job.liftCount === 2));
});

test('compareOwnerSupply zeros the rail and chair invoices and keeps the set hours', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(contractor);
  assert.ok(fits);
  assert.ok(wrong);
  assert.equal(fits.cheapest, true);
  assert.ok(fits.price < contractor.price);
  assert.ok(fits.fixtureMaterial < contractor.fixtureMaterial);
  assert.equal(fits.totalHours, contractor.totalHours);
  assert.ok(wrong.totalHours > fits.totalHours);
  assert.ok(wrong.price > fits.price);
  assert.ok(wrong.attachMaterial > fits.attachMaterial);
  assert.ok(wrong.hoursTravel > fits.hoursTravel);
  assert.ok(wrong.hoursAttach > fits.hoursAttach);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special()).find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...special(),
    railInvoice: 9999,
    chairInvoice: 4500,
  }).find((row) => row.supply === 'owner-fits');
  assert.ok(baseline);
  assert.ok(overridden);
  assert.equal(overridden.fixtureMaterial, baseline.fixtureMaterial);
  assert.ok(Math.abs(overridden.price - baseline.price) < 1e-9);
});

test('compareOwnerSupply scores a $795 install-only special against each cost base', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 795 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(fits.breakEvenPrice > 795);
  const note = ownerSupplyNote(rows);
  assert.match(note, /\$795\.00/);
  assert.match(note, /lose money even when they bought the lift/i);
  assert.match(note, /walk-away/i);
});

test('ownerSupplyNote names the bid drop when no install-only price is set', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the rail and chair invoices drops the bid/i);
  assert.match(note, /wrong-rail callback/i);
});

test('ownerSupplyNote names the path that covers when only the owner-supplied set holds', () => {
  const rows = compareOwnerSupply(special());
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const between = Math.round((fits.breakEvenPrice + rows.find((row) => row.supply === 'contractor-supplied').breakEvenPrice) / 2);
  const scored = compareOwnerSupply(special(), { installOnlyPrice: between });
  assert.match(ownerSupplyNote(scored), /covers the set if their lift actually fits/i);
});

test('ownerSupplyNote uses proposedPrice when installOnlyPrice is omitted', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 795 });
  assert.equal(rows[0].installOnlyPrice, 795);
  assert.match(ownerSupplyNote(rows), /\$795\.00/);
});

test('ownerSupplyNote rejects a short row list', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'contractor-supplied' }]), /missing rows/);
});

test('suggestedOwnerCallbackKit is a second trip plus missing hardware', () => {
  const kit = suggestedOwnerCallbackKit();
  assert.equal(kit.hoursCallbackTrip, suggestedExtraKit().hoursTrip);
  assert.ok(kit.hoursMissingHardwareEach > 0);
  assert.ok(kit.missingHardwareEach > 0);
});

test('formatBidSummary is a customer-facing draft without wages', () => {
  const text = formatBidSummary(calculateBid(losingJob()), 'Losing curved');
  assert.match(text, /STAIR LIFT INSTALL BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /Losing curved/);
  assert.match(text, /heavy-duty|350/i);
  assert.match(text, /curved/i);
  assert.doesNotMatch(text, /hourly wage/i);
  assert.doesNotMatch(text, /\$42/);
});

test('flag helpers accept common form values', () => {
  const on = calculateBid({ ...special(), includeFoldingRail: '1' });
  const off = calculateBid({ ...special(), includeFoldingRail: '0' });
  assert.ok(on.hoursFold > 0);
  assert.equal(off.hoursFold, 0);
});
