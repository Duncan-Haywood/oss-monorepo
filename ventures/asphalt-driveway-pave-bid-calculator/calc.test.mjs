import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareMethods,
  formatBidSummary,
  gravelTons,
  JOB_PRESETS,
  METHOD_PRESETS,
  mixTons,
  suggestedMethodKit,
} from './calc.mjs';

const COSTS = {
  hoursTrip: 1.5,
  siteHours: 0.75,
  permitFee: 125,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 425,
  overheadRate: 16,
  targetMargin: 28,
};

function bid(overrides = {}) {
  const method = overrides.method ?? 'overlay';
  return calculateBid({
    ...COSTS,
    ...suggestedMethodKit(method),
    method,
    drivewaySqFt: 800,
    thicknessIn: 2,
    apronSqFt: 0,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 20,
    millDepthIn: method === 'mill-overlay' ? 1.5 : 0,
    existingDepthIn: 2,
    fabric: false,
    ...overrides,
  });
}

test('mix tons come from area × thickness × 145 lb/ft³, not a flat per-foot special', () => {
  // 800 sq ft × 2 in × 145 / 12 / 2000 = 9.666...
  assert.ok(Math.abs(mixTons(800, 2) - 800 * (2 / 12) * 145 / 2000) < 1e-9);
  const result = bid();
  assert.ok(Math.abs(result.drivewayTons - mixTons(800, 2)) < 1e-9);
  assert.equal(result.apronTons, 0);
  assert.ok(result.newMixTons > 9 && result.newMixTons < 10);
});

test('the same 1,000 sq ft at 3 in is a different mix ticket from 2 in', () => {
  const two = bid({ drivewaySqFt: 1000, thicknessIn: 2 });
  const three = bid({ drivewaySqFt: 1000, thicknessIn: 3 });
  assert.ok(Math.abs(three.newMixTons - two.newMixTons * 1.5) < 1e-9);
  assert.ok(three.mixMaterial > two.mixMaterial * 1.4);
  assert.ok(three.price > two.price);
});

test('a 4-inch street apron is extra tons and extra hours, not a blended adder', () => {
  const plain = bid({ drivewaySqFt: 1200, apronSqFt: 0 });
  const withApron = bid({ drivewaySqFt: 1200, apronSqFt: 80, apronThicknessIn: 4 });
  assert.ok(Math.abs(withApron.apronTons - mixTons(80, 4)) < 1e-9);
  assert.ok(withApron.newMixTons > plain.newMixTons);
  assert.ok(withApron.hoursApron > 0);
  assert.ok(withApron.price > plain.price + 200);
});

test('failed base is gravel tons and hours the overlay special never sees', () => {
  const sound = bid({
    method: 'full-depth',
    drivewaySqFt: 1000,
    thicknessIn: 3,
    failedBaseSqFt: 0,
    sawcutLf: 60,
    existingDepthIn: 2.5,
    ...suggestedMethodKit('full-depth'),
  });
  const failed = bid({
    method: 'full-depth',
    drivewaySqFt: 1000,
    thicknessIn: 3,
    failedBaseSqFt: 200,
    sawcutLf: 60,
    existingDepthIn: 2.5,
    ...suggestedMethodKit('full-depth'),
  });
  assert.ok(Math.abs(failed.baseTons - gravelTons(200, 4)) < 1e-9);
  assert.ok(failed.hoursBase > 0);
  assert.equal(sound.hoursBase, 0);
  assert.ok(failed.gravelMaterial > 0);
  assert.ok(failed.price > sound.price + 150);
});

test('price stacks burden, mix, dump, overhead, then margin as a share of price', () => {
  const result = bid();
  assert.equal(result.loadedWage, 38 * 1.32);
  const direct = result.laborCost + result.materialCost + result.travelAndEquipment;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = bid({ targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(bid().proposed, null);
  assert.equal(bid({ proposedPrice: '' }).proposed, null);
  assert.equal(bid({ proposedPrice: null }).proposed, null);
  assert.equal(bid({ proposedPrice: 0 }).proposed.price, 0);
});

test('a proposed price at the bid is scored against the same cost base', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('mill-and-overlay hauls millings; overlay does not', () => {
  const overlay = bid({ method: 'overlay', drivewaySqFt: 1200, millDepthIn: 0 });
  const milled = bid({
    method: 'mill-overlay',
    drivewaySqFt: 1200,
    millDepthIn: 1.5,
    ...suggestedMethodKit('mill-overlay'),
  });
  assert.equal(overlay.millTons, 0);
  assert.equal(overlay.hoursMill, 0);
  assert.ok(milled.millTons > 0);
  assert.ok(milled.hoursMill > 0);
  assert.ok(milled.dumpCost > 0);
  assert.ok(milled.price > overlay.price);
});

test('full-depth demos the existing mat and skips tack on a new base', () => {
  const full = bid({
    method: 'full-depth',
    drivewaySqFt: 1000,
    thicknessIn: 3,
    failedBaseSqFt: 200,
    sawcutLf: 60,
    existingDepthIn: 2.5,
    ...suggestedMethodKit('full-depth'),
  });
  assert.ok(full.demoTons > 0);
  assert.ok(full.hoursDemo > 0);
  assert.equal(full.hoursTack, 0);
  assert.equal(full.tackMaterial, 0);
  assert.ok(full.demoDump > 0);
});

test('compareMethods still prices mill-and-overlay when the current job has zero mill depth', () => {
  const rows = compareMethods({
    ...COSTS,
    drivewaySqFt: 800,
    thicknessIn: 2,
    apronSqFt: 0,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 20,
    millDepthIn: 0,
    existingDepthIn: 2,
    fabric: false,
  });
  assert.equal(rows.length, 3);
  const milled = rows.find((row) => row.method === 'mill-overlay');
  assert.ok(milled.price > 0);
});

test('compareMethods shows overlay beating full-depth on a sound 800 sq ft refresh', () => {
  const rows = compareMethods({
    ...COSTS,
    drivewaySqFt: 800,
    thicknessIn: 2,
    apronSqFt: 0,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 20,
    millDepthIn: 1.5,
    existingDepthIn: 2,
    fabric: false,
  });
  assert.equal(rows.length, 3);
  const overlay = rows.find((row) => row.method === 'overlay');
  const full = rows.find((row) => row.method === 'full-depth');
  assert.ok(overlay.price < full.price);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  assert.equal(rows[0].delta, 0);
});

test('compareMethods shows full-depth extra cost jumping when the base has failed', () => {
  const sound = compareMethods({
    ...COSTS,
    drivewaySqFt: 1000,
    thicknessIn: 3,
    apronSqFt: 80,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 60,
    millDepthIn: 1.5,
    existingDepthIn: 2.5,
    fabric: false,
  });
  const failed = compareMethods({
    ...COSTS,
    drivewaySqFt: 1000,
    thicknessIn: 3,
    apronSqFt: 80,
    apronThicknessIn: 4,
    failedBaseSqFt: 400,
    sawcutLf: 60,
    millDepthIn: 1.5,
    existingDepthIn: 2.5,
    fabric: false,
  });
  const soundFull = sound.find((row) => row.method === 'full-depth');
  const failedFull = failed.find((row) => row.method === 'full-depth');
  assert.ok(failedFull.extraCost > soundFull.extraCost);
  assert.ok(failedFull.price > soundFull.price);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(bid(), '800 sq ft overlay, 2 in');
  assert.match(text, /ASPHALT DRIVEWAY PAVING BID/);
  assert.match(text, /800 sq ft driveway at 2 in/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
  assert.match(text, /not a paving specification/);
});

test('job presets cover the three methods and the failed-base contrast', () => {
  assert.equal(JOB_PRESETS.length, 4);
  const methods = new Set(JOB_PRESETS.map((job) => job.method));
  assert.deepEqual([...methods].sort(), ['full-depth', 'mill-overlay', 'overlay']);
  assert.ok(JOB_PRESETS.some((job) => job.failedBaseSqFt > 0 && job.method === 'full-depth'));
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => bid({ drivewaySqFt: 0 }), /Driveway square feet must be greater than zero/);
  assert.throws(() => bid({ failedBaseSqFt: 900, drivewaySqFt: 800, apronSqFt: 0 }), /cannot exceed the paved area/);
  assert.throws(() => bid({ method: 'chip-seal' }), /Unknown paving method/);
  assert.throws(() => bid({ thicknessIn: 0 }), /Pave thickness must be greater than zero/);
  assert.throws(() => bid({ hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => bid({ targetMargin: 100 }), /less than 100/);
  assert.throws(() => bid({ overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => suggestedMethodKit('chip-seal'), /Unknown paving method/);
});

test('presets are usable positive figures', () => {
  assert.ok(METHOD_PRESETS.length === 3);
  for (const method of METHOD_PRESETS) {
    const kit = suggestedMethodKit(method.id);
    for (const value of Object.values(kit)) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
  }
});

test('fabric is billed only when the shop turns it on', () => {
  const without = bid({ fabric: false, drivewaySqFt: 2000 });
  const withFabric = bid({ fabric: true, drivewaySqFt: 2000 });
  assert.equal(without.fabricMaterial, 0);
  assert.ok(withFabric.fabricMaterial > 0);
  assert.ok(withFabric.price > without.price);
});
