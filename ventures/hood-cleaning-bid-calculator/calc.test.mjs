import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, COMPONENT_PRESETS, GREASE_LOADS, ACCESS_PRESETS } from './calc.mjs';

const steakhouse = () => ({
  components: [
    { name: 'Canopy hood (listed sq ft)', quantity: 40, minutesPerUnit: 4, accessMultiplier: 1.0 },
    { name: 'Hood filters (each)', quantity: 6, minutesPerUnit: 4, accessMultiplier: 1.0 },
    { name: 'Horizontal duct (linear ft)', quantity: 12, minutesPerUnit: 8, accessMultiplier: 1.2 },
    { name: 'Vertical duct (linear ft)', quantity: 20, minutesPerUnit: 15, accessMultiplier: 1.7 },
    { name: 'Rooftop exhaust fan (each)', quantity: 1, minutesPerUnit: 60, accessMultiplier: 1.7 },
  ],
  greaseMultiplier: 1.6,
  hourlyWage: 28,
  burdenRate: 32,
  crewSize: 2,
  travelHours: 1,
  travelTechs: 2,
  afterHoursPremium: 25,
  consumablesPerJob: 45,
  consumablesPerHoodSqFt: 0.4,
  disposalFee: 35,
  otherJobCost: 0,
  overheadRate: 15,
  targetMargin: 25,
  cleansPerYear: 4,
});

test('labor hours come from the system, not the hood count', () => {
  const result = calculateBid(steakhouse());
  // Canopy 40*4 + filters 6*4 = 184 min * 1.0 access * 1.6 grease = 294.4
  // Horizontal 12*8 = 96 * 1.2 * 1.6 = 184.32
  // Vertical 20*15 = 300 * 1.7 * 1.6 = 816
  // Fan 60 * 1.7 * 1.6 = 163.2
  // Production minutes = 1457.92 → 24.2986... hours
  assert.ok(Math.abs(result.productionHours - 1457.92 / 60) < 1e-9);
  assert.equal(result.hoodCount, 1);
  assert.ok(result.hoursByKind.duct > result.hoursByKind.hood);
  assert.ok(result.kindShare.duct > 50);
});

test('a short horizontal duct is a different job from a vertical rooftop run', () => {
  const easy = calculateBid({
    ...steakhouse(),
    components: [
      { name: 'Canopy hood (listed sq ft)', quantity: 40, minutesPerUnit: 4, accessMultiplier: 1 },
      { name: 'Hood filters (each)', quantity: 6, minutesPerUnit: 4, accessMultiplier: 1 },
      { name: 'Horizontal duct (linear ft)', quantity: 8, minutesPerUnit: 8, accessMultiplier: 1 },
    ],
    greaseMultiplier: 1,
    afterHoursPremium: 0,
    travelHours: 0,
    travelTechs: 0,
  });
  const hard = calculateBid(steakhouse());
  assert.ok(hard.jobPrice > easy.jobPrice * 2, 'vertical duct + rooftop fan more than doubles the easy hood');
  assert.ok(hard.systemPremium > 0);
  assert.ok(easy.systemPremium < hard.systemPremium);
});

test('price stacks burden, after-hours, consumables, overhead, then margin as a share of price', () => {
  const result = calculateBid(steakhouse());
  assert.equal(result.loadedWage, 28 * 1.32);
  assert.ok(Math.abs(result.consumables - (45 + 0.4 * 40)) < 1e-9);
  assert.ok(Math.abs(result.afterHoursLaborCost - result.onSiteLaborCost * 0.25) < 1e-9);
  assert.ok(Math.abs(result.travelLaborCost - 1 * 2 * result.loadedWage) < 1e-9);

  const direct = result.laborCost + result.consumables + 35;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.jobProfit / result.jobPrice * 100 - 25) < 1e-9);
  assert.ok(Math.abs(result.annualPrice - result.jobPrice * 4) < 1e-9);
  assert.ok(Math.abs(result.monthlyEquivalent - result.annualPrice / 12) < 1e-9);
});

test('wall-clock hours divide production by crew size; travel stays off the clock display', () => {
  const result = calculateBid(steakhouse());
  assert.ok(Math.abs(result.wallClockHours - result.productionHours / 2) < 1e-9);
  assert.equal(result.travelLaborHours, 2);
  assert.ok(result.laborHours > result.productionHours);
});

test('a hood-only bid understates the system price', () => {
  const result = calculateBid(steakhouse());
  assert.ok(result.hoodOnlyPrice < result.jobPrice);
  assert.ok(Math.abs(result.systemPremium - (result.jobPrice - result.hoodOnlyPrice)) < 1e-9);
  assert.ok(result.pricePerHood === result.jobPrice);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...steakhouse(), targetMargin: 0 });
  assert.ok(Math.abs(result.jobPrice - result.jobCost) < 1e-9);
  assert.ok(Math.abs(result.jobProfit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(steakhouse());
  const scored = calculateBid({ ...steakhouse(), proposedPrice: bid.jobPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(steakhouse());
  const scored = calculateBid({ ...steakhouse(), proposedPrice: bid.jobCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(steakhouse()).proposed, null);
  assert.equal(calculateBid({ ...steakhouse(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...steakhouse(), proposedPrice: 0 }).proposed.price, 0);
});

test('a nameless component still reports under a stable label', () => {
  const result = calculateBid({
    ...steakhouse(),
    components: [{ quantity: 10, minutesPerUnit: 4, accessMultiplier: 1 }, { name: '   ', quantity: 2, minutesPerUnit: 4, accessMultiplier: 1 }],
  });
  assert.equal(result.components[0].name, 'Component 1');
  assert.equal(result.components[1].name, 'Component 2');
  assert.equal(result.hoodCount, 0);
  assert.equal(result.pricePerHood, null);
});

test('zero production still prices travel, chemicals, and disposal', () => {
  const result = calculateBid({
    ...steakhouse(),
    components: [{ name: 'Canopy hood (listed sq ft)', quantity: 0, minutesPerUnit: 4, accessMultiplier: 1 }],
  });
  assert.equal(result.productionHours, 0);
  assert.equal(result.effectiveHourlyRate, result.laborHours === 0 ? null : result.jobPrice / result.laborHours);
  assert.ok(result.jobPrice > 45);
  assert.equal(result.kindShare.hood, 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...steakhouse(), components: [] }), /at least one system component/);
  assert.throws(
    () => calculateBid({
      ...steakhouse(),
      components: [{ name: 'Vertical duct (linear ft)', quantity: 10, minutesPerUnit: 0, accessMultiplier: 1 }],
    }),
    /Vertical duct \(linear ft\): minutes per unit must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({
      ...steakhouse(),
      components: [{ name: 'Vertical duct (linear ft)', quantity: -1, minutesPerUnit: 15, accessMultiplier: 1 }],
    }),
    /quantity must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...steakhouse(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...steakhouse(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...steakhouse(), greaseMultiplier: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...steakhouse(), crewSize: 0 }), /Crew size must be at least 1/);
});

test('presets are usable positive numbers with kinds', () => {
  assert.ok(COMPONENT_PRESETS.length >= 6);
  for (const preset of COMPONENT_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.minutesPerUnit) && preset.minutesPerUnit > 0);
    assert.ok(['hood', 'duct', 'fan'].includes(preset.kind));
  }
  for (const load of GREASE_LOADS) {
    assert.ok(load.multiplier >= 1);
    assert.ok(load.suggestedCleansPerYear >= 1);
  }
  for (const access of ACCESS_PRESETS) {
    assert.ok(access.multiplier >= 1);
  }
});
