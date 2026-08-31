import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  ROOF_PRESETS,
  ELECTRICAL_PRESETS,
  SYSTEM_PRESETS,
} from './calc.mjs';

const easyTenKw = () => ({
  moduleCount: 26,
  wattsPerModule: 390,
  moduleCostEach: 140,
  inverterCost: 1800,
  rackingPerModule: 45,
  bosPerWatt: 0.18,
  roofFactor: 1.0,
  laborHoursPerKw: 10,
  hourlyWage: 38,
  burdenRate: 30,
  electricalHours: 0,
  electricalMaterial: 0,
  batteryHours: 0,
  batteryMaterial: 0,
  permitAndInterconnection: 850,
  designEngineering: 400,
  travelDumpsterLift: 250,
  overheadRate: 15,
  targetMargin: 20,
});

test('system size is module count times watts, not a rounded marketing kW', () => {
  const result = calculateBid(easyTenKw());
  assert.equal(result.dcWatts, 26 * 390);
  assert.ok(Math.abs(result.dcKw - 10.14) < 1e-9);
});

test('array labor scales with kW and then with the roof factor', () => {
  const easy = calculateBid(easyTenKw());
  const tile = calculateBid({ ...easyTenKw(), roofFactor: 1.45 });
  assert.ok(Math.abs(easy.arrayHours - 10.14 * 10) < 1e-9);
  assert.ok(Math.abs(tile.arrayHours - easy.arrayHours * 1.45) < 1e-9);
  assert.ok(tile.laborCost > easy.laborCost);
  assert.ok(tile.price > easy.price);
});

test('a panel upgrade does not scale with array size', () => {
  const small = calculateBid({
    ...easyTenKw(),
    moduleCount: 16,
    electricalHours: 8,
    electricalMaterial: 1800,
  });
  const large = calculateBid({
    ...easyTenKw(),
    moduleCount: 31,
    electricalHours: 8,
    electricalMaterial: 1800,
  });
  assert.equal(small.electricalHours, large.electricalHours);
  assert.equal(small.electricalMaterial, large.electricalMaterial);
  // The extra is the same dollar amount; it is a larger share of the small job.
  assert.ok(small.shares.extras > large.shares.extras);
});

test('tile plus a 100-to-200 upgrade is not the same job as an easy 10 kW', () => {
  const easy = calculateBid(easyTenKw());
  const hard = calculateBid({
    ...easyTenKw(),
    roofFactor: 1.45,
    electricalHours: 8,
    electricalMaterial: 1800,
  });
  const extra = hard.price - easy.price;
  // The extras are thousands, not a rounding error on a per-watt rule.
  assert.ok(extra > 3000, `hard job only added $${extra.toFixed(0)}`);
  assert.ok(hard.pricePerWatt > easy.pricePerWatt);
});

test('price stacks burden, equipment, extras, overhead, then margin as a share of price', () => {
  const result = calculateBid(easyTenKw());
  assert.equal(result.loadedWage, 38 * 1.3);
  assert.equal(result.moduleCost, 26 * 140);
  assert.equal(result.rackingCost, 26 * 45);
  assert.ok(Math.abs(result.bosCost - 26 * 390 * 0.18) < 1e-9);
  assert.equal(result.equipmentCost, result.moduleCost + 1800 + result.rackingCost + result.bosCost);
  assert.equal(result.softCost, 850 + 400 + 250);

  const direct = result.laborCost + result.equipmentCost + result.extraMaterial + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...easyTenKw(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(easyTenKw());
  const scored = calculateBid({ ...easyTenKw(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.perWatt - bid.pricePerWatt) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(easyTenKw());
  const scored = calculateBid({ ...easyTenKw(), proposedPrice: bid.totalCost - 500 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(easyTenKw()).proposed, null);
  assert.equal(calculateBid({ ...easyTenKw(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...easyTenKw(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...easyTenKw(), proposedPrice: 0 }).proposed.price, 0);
});

test('battery hours and material sit outside array labor', () => {
  const none = calculateBid(easyTenKw());
  const withBattery = calculateBid({
    ...easyTenKw(),
    batteryHours: 6,
    batteryMaterial: 9000,
  });
  assert.ok(Math.abs(withBattery.totalHours - (none.totalHours + 6)) < 1e-9);
  assert.equal(withBattery.batteryMaterial, 9000);
  assert.ok(withBattery.price > none.price + 9000);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...easyTenKw(), moduleCount: 0 }), /Module count must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTenKw(), wattsPerModule: 0 }), /Watts per module must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTenKw(), laborHoursPerKw: 0 }), /Labor hours per kW must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTenKw(), roofFactor: 0 }), /Roof factor must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTenKw(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...easyTenKw(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...easyTenKw(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateBid({ ...easyTenKw(), moduleCount: -2 }), /Module count must be at least 0/);
});

test('roof, electrical, and system presets are usable positive numbers', () => {
  assert.ok(ROOF_PRESETS.length >= 6);
  for (const preset of ROOF_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
  }
  assert.ok(ELECTRICAL_PRESETS.length >= 5);
  for (const preset of ELECTRICAL_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.hours) && preset.hours >= 0);
    assert.ok(Number.isFinite(preset.material) && preset.material >= 0);
  }
  assert.ok(SYSTEM_PRESETS.length >= 3);
  for (const preset of SYSTEM_PRESETS) {
    assert.ok(preset.moduleCount > 0 && preset.wattsPerModule > 0);
  }
});

test('bid summary is customer-facing and omits wages and costs', () => {
  const result = calculateBid(easyTenKw());
  const text = formatBidSummary(result);
  assert.match(text, /10\.14 kW DC/);
  assert.match(text, /26 modules/);
  assert.match(text, /Proposed install price/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('battery line appears in the summary only when a battery is priced', () => {
  const none = formatBidSummary(calculateBid(easyTenKw()));
  const withBattery = formatBidSummary(calculateBid({
    ...easyTenKw(),
    batteryHours: 4,
    batteryMaterial: 8000,
  }));
  assert.doesNotMatch(none, /Battery/);
  assert.match(withBattery, /Battery \/ backup/);
});
