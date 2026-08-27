import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  MINUTES_PER_ZONE,
  MINUTES_PER_BACKFLOW,
  SYSTEM_PRESETS,
} from './calc.mjs';

const house = () => ({
  systems: [
    {
      name: 'Typical residential',
      sprayZones: 6,
      rotorZones: 2,
      dripZones: 2,
    },
  ],
  sprayMinutes: MINUTES_PER_ZONE.spray,
  rotorMinutes: MINUTES_PER_ZONE.rotor,
  dripMinutes: MINUTES_PER_ZONE.drip,
  backflows: 1,
  backflowMinutes: MINUTES_PER_BACKFLOW,
  freezeWarning: false,
  afterHoursPremium: 50,
  hourlyWage: 26,
  burdenRate: 30,
  milesOneWay: 10,
  speedMph: 35,
  setupHours: 0.35,
  minOnSiteHours: 1,
  tripFee: 25,
  compressorCost: 12,
  fittingsCost: 4,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 30,
});

test('hours come from zone type, not a flat per-zone guess', () => {
  const result = calculateBid(house());
  // 6×4 + 2×5 + 2×8 = 24 + 10 + 16 = 50 minutes of blowout
  assert.ok(Math.abs(result.blowoutHours - 50 / 60) < 1e-9);
  assert.equal(result.totalZones, 10);
  assert.ok(Math.abs(result.sprayHours - 24 / 60) < 1e-9);
  assert.ok(Math.abs(result.dripHours - 16 / 60) < 1e-9);
});

test('drip zones consume time out of all proportion to their count', () => {
  const result = calculateBid(house());
  const dripShareOfZones = 2 / 10;
  const dripShareOfHours = result.dripHours / result.blowoutHours;
  assert.ok(dripShareOfZones < 0.25);
  assert.ok(dripShareOfHours > 0.3, `drip is ${ (dripShareOfHours * 100).toFixed(1) }% of blowout hours`);
});

test('backflow winterization is a second job the $8-a-zone special cannot see', () => {
  const withBackflow = calculateBid(house());
  const without = calculateBid({ ...house(), backflows: 0 });
  assert.ok(Math.abs(withBackflow.backflowHours - 15 / 60) < 1e-9);
  assert.equal(without.backflowHours, 0);
  assert.ok(withBackflow.price > without.price);
  assert.ok(withBackflow.onSiteHours > without.onSiteHours);
});

test('the drive is a second job and the minimum holds a tiny yard up', () => {
  const result = calculateBid(house());
  assert.ok(Math.abs(result.travelHours - (20 / 35)) < 1e-9);
  const tiny = calculateBid({
    ...house(),
    systems: [{ name: 'Front bed', sprayZones: 2, rotorZones: 0, dripZones: 0 }],
    backflows: 0,
    setupHours: 0.25,
    minOnSiteHours: 1,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.onSiteHours, 1);
});

test('price stacks burden, compressor, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 26 * 1.3);
  assert.ok(Math.abs(result.materials - 16) < 1e-9);
  const direct = result.laborCost + result.materials + 25;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
});

test('a neighborhood $75 blowout on this house is underwater', () => {
  const bid = calculateBid(house());
  const special = calculateBid({ ...house(), proposedPrice: 75 });
  assert.equal(special.proposed.belowBreakEven, true);
  assert.ok(special.proposed.profit < 0);
  assert.ok(bid.breakEvenPrice > 75);
  assert.ok(bid.pricePerZone > 12);
});

test('a proposed price at the calculated bid keeps the target margin', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('a freeze-warning call bills a premium on labor, not on the compressor', () => {
  const daytime = calculateBid(house());
  const freeze = calculateBid({ ...house(), freezeWarning: true, afterHoursPremium: 50 });
  assert.equal(daytime.premiumLabor, 0);
  assert.ok(Math.abs(freeze.premiumLabor - daytime.baseLabor * 0.5) < 1e-9);
  assert.equal(freeze.compressorCost, daytime.compressorCost);
  assert.ok(freeze.price > daytime.price);
});

test('a commercial system is not priced like a house with the same zone count', () => {
  const commercial = calculateBid({
    ...house(),
    systems: [{ name: 'Small commercial / HOA', sprayZones: 2, rotorZones: 6, dripZones: 2 }],
  });
  const houseSameZones = calculateBid(house());
  assert.equal(commercial.totalZones, houseSameZones.totalZones);
  // More rotors and the same drip count still shift time because rotors > spray.
  assert.ok(commercial.blowoutHours > houseSameZones.blowoutHours);
  assert.ok(commercial.price > houseSameZones.price);
});

test('zero-margin bid prices at cost and empty proposed price is no comparison', () => {
  const atCost = calculateBid({ ...house(), targetMargin: 0 });
  assert.ok(Math.abs(atCost.price - atCost.totalCost) < 1e-9);
  assert.ok(Math.abs(atCost.profit) < 1e-9);
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('rejects empty systems, zero minutes, and a 100% margin', () => {
  assert.throws(() => calculateBid({ ...house(), systems: [] }), /at least one system/i);
  assert.throws(() => calculateBid({ ...house(), sprayMinutes: 0 }), /Spray minutes/i);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/i);
  assert.throws(() => calculateBid({ ...house(), speedMph: 0 }), /Travel speed/i);
  assert.throws(() => calculateBid({
    ...house(),
    systems: [{ name: 'Bad', sprayZones: -1, rotorZones: 0, dripZones: 0 }],
  }), /spray zones/i);
});

test('system presets are usable positive zone counts', () => {
  assert.ok(SYSTEM_PRESETS.length >= 4);
  for (const preset of SYSTEM_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.sprayZones + preset.rotorZones + preset.dripZones > 0);
  }
});

test('a nameless system still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    systems: [{ sprayZones: 3, rotorZones: 0, dripZones: 0 }, { name: '   ', sprayZones: 1, rotorZones: 0, dripZones: 0 }],
  });
  assert.equal(result.systems[0].name, 'System 1');
  assert.equal(result.systems[1].name, 'System 2');
});
