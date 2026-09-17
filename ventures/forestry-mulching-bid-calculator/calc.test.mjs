// Tests for the production-rate and pricing arithmetic.
//
// The ones that earn their place are the invariants an operator would be hurt
// by if they broke quietly: that a blank cost field cannot become a zero cost,
// that margin is taken on price rather than added to cost, that mobilization
// does not scale with acreage, and that the density comparison actually
// re-prices the job rather than re-labelling it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DENSITY_CLASSES,
  SQ_FT_PER_ACRE,
  acresPerHourFrom,
  advanceSpeedForAcresPerHour,
  compareDensities,
  machineCostPerHour,
  money,
  priceJob,
  reviewJob,
} from './calc.mjs';

/** The exact job the page ships with. Mirrored in page.test.mjs from markup. */
function shippedJob(overrides = {}) {
  return {
    acres: 3,
    headWidthFt: 6,
    advanceFtPerMin: 42,
    passes: 1,
    cuttingEfficiencyPct: 80,
    terrainFactorPct: 85,
    workHoursPerDay: 8,
    mobilizationTrips: 1,
    mobilizationHoursEach: 2.5,
    mobilizationMilesEach: 70,
    truckCostPerMile: 1.35,
    operatorWagePerHour: 45,
    fuelGallonsPerHour: 5,
    fuelPricePerGallon: 3.9,
    toothSetCost: 1800,
    toothSetLifeHours: 250,
    maintenancePerHour: 12,
    machinePaymentMonthly: 2400,
    insuranceAnnual: 4800,
    billableHoursPerMonth: 70,
    otherCosts: 0,
    targetMarginPct: 35,
    largestStemInches: 8,
    headRatedStemInches: 8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// money()
// ---------------------------------------------------------------------------

test('money puts the sign outside the symbol and never prints negative zero', () => {
  assert.equal(money(1234.5), '$1,234.50');
  assert.equal(money(-9.236), '-$9.24');
  assert.equal(money(-0.001), '$0.00');
  assert.equal(money(0), '$0.00');
});

// ---------------------------------------------------------------------------
// The production rate, which is the whole argument of the product.
// ---------------------------------------------------------------------------

test('the production rate is the swath geometry and nothing else', () => {
  // 6 ft head, 60 ft/min, one pass, 100% of the hour cutting, flat ground:
  // 6 x 60 x 60 = 21,600 sq ft an hour.
  const rate = acresPerHourFrom({
    headWidthFt: 6,
    advanceFtPerMin: 60,
    passes: 1,
    cuttingEfficiencyPct: 100,
    terrainFactorPct: 100,
  });
  assert.equal(rate, 21600 / SQ_FT_PER_ACRE);
});

test('a second pass over the same ground halves the acres an hour', () => {
  const base = { headWidthFt: 6, advanceFtPerMin: 40, cuttingEfficiencyPct: 80, terrainFactorPct: 100 };
  const one = acresPerHourFrom({ ...base, passes: 1 });
  const two = acresPerHourFrom({ ...base, passes: 2 });
  assert.ok(Math.abs(one / two - 2) < 1e-12);
});

test('terrain and cutting efficiency both scale the rate linearly', () => {
  const base = { headWidthFt: 6, advanceFtPerMin: 50, passes: 1, cuttingEfficiencyPct: 100, terrainFactorPct: 100 };
  const full = acresPerHourFrom(base);
  assert.ok(Math.abs(acresPerHourFrom({ ...base, terrainFactorPct: 50 }) / full - 0.5) < 1e-12);
  assert.ok(Math.abs(acresPerHourFrom({ ...base, cuttingEfficiencyPct: 50 }) / full - 0.5) < 1e-12);
});

test('advanceSpeedForAcresPerHour inverts acresPerHourFrom exactly', () => {
  const shape = { headWidthFt: 8, passes: 2, cuttingEfficiencyPct: 75, terrainFactorPct: 60 };
  const speed = advanceSpeedForAcresPerHour({ ...shape, acresPerHour: 0.17 });
  const back = acresPerHourFrom({ ...shape, advanceFtPerMin: speed });
  assert.ok(Math.abs(back - 0.17) < 1e-12, `round trip drifted: ${back}`);
});

test('every shipped density class is slower than the one above it', () => {
  const shape = { headWidthFt: 6, cuttingEfficiencyPct: 80, terrainFactorPct: 85 };
  const rates = Object.values(DENSITY_CLASSES).map((density) =>
    acresPerHourFrom({ ...shape, advanceFtPerMin: density.advanceFtPerMin, passes: density.passes }),
  );
  for (let i = 1; i < rates.length; i += 1) {
    assert.ok(rates[i] < rates[i - 1], `class ${i} is not slower than class ${i - 1}`);
  }
  // And the spread across the four is large enough that a single per-acre
  // price cannot cover them, which is the claim the page makes in its
  // headline. If this ever fell below about 4x the headline would be wrong.
  assert.ok(rates[0] / rates[3] > 4, 'the light-to-heavy spread collapsed');
});

// ---------------------------------------------------------------------------
// Cost per machine hour.
// ---------------------------------------------------------------------------

test('the hourly cost is the five lines added, with teeth and ownership spread', () => {
  const rate = machineCostPerHour(shippedJob());
  assert.equal(rate.operator, 45);
  assert.equal(rate.fuel, 5 * 3.9);
  assert.equal(rate.teeth, 1800 / 250);
  assert.equal(rate.maintenance, 12);
  assert.equal(rate.ownership, (2400 + 4800 / 12) / 70);
  assert.equal(
    rate.total,
    rate.operator + rate.fuel + rate.teeth + rate.maintenance + rate.ownership,
  );
});

test('halving the billable hours doubles the ownership burden per hour', () => {
  const busy = machineCostPerHour(shippedJob({ billableHoursPerMonth: 140 }));
  const quiet = machineCostPerHour(shippedJob({ billableHoursPerMonth: 70 }));
  assert.ok(Math.abs(quiet.ownership / busy.ownership - 2) < 1e-12);
  // And it moves the total by more than a dollar-a-gallon fuel swing does,
  // which is the point of showing it as its own line.
  const fuelSwing = machineCostPerHour(shippedJob({ fuelPricePerGallon: 4.9 })).total
    - machineCostPerHour(shippedJob()).total;
  assert.ok(quiet.total - busy.total > fuelSwing);
});

// ---------------------------------------------------------------------------
// The job.
// ---------------------------------------------------------------------------

test('the shipped example prices to the figures the pages quote', () => {
  const r = priceJob(shippedJob());
  assert.equal(r.acresPerHour.toFixed(3), '0.236');
  assert.equal(r.machineHours.toFixed(1), '12.7');
  assert.equal(r.daysOnSite.toFixed(1), '1.6');
  assert.equal(money(r.ratePerHour.total), '$123.70');
  assert.equal(money(r.totalCost), '$1,779.24');
  assert.equal(money(r.price), '$2,737.29');
  assert.equal(money(r.pricePerAcre), '$912.43');
  assert.equal(money(r.breakEvenPerAcre), '$593.08');
});

test('margin is taken on the price, not added to the cost', () => {
  const r = priceJob(shippedJob({ targetMarginPct: 40 }));
  assert.ok(Math.abs(r.price - r.totalCost / 0.6) < 1e-9);
  assert.ok(Math.abs(r.profit / r.price - 0.4) < 1e-9);
  // The markup reading of the same number is materially lower, which is the
  // confusion the FAQ answers.
  assert.ok(r.price > r.totalCost * 1.4);
});

test('a zero-margin job prices exactly at cost', () => {
  const r = priceJob(shippedJob({ targetMarginPct: 0 }));
  assert.equal(r.price, r.totalCost);
  assert.equal(r.profit, 0);
  assert.equal(r.pricePerAcre, r.breakEvenPerAcre);
});

test('mobilization does not scale with acreage, which is why small jobs lose', () => {
  const small = priceJob(shippedJob({ acres: 0.5 }));
  const big = priceJob(shippedJob({ acres: 10 }));
  assert.equal(money(small.mobilizationCost), money(big.mobilizationCost));
  assert.ok(small.mobilizationShareOfPrice > big.mobilizationShareOfPrice * 5);
  // And so the per-acre price is far higher on the small lot for the same work
  // rate -- the number a flat per-acre quote cannot express.
  assert.ok(small.pricePerAcre > big.pricePerAcre * 1.5);
});

test('machine hours scale linearly with acreage at a fixed production rate', () => {
  const one = priceJob(shippedJob({ acres: 1 }));
  const four = priceJob(shippedJob({ acres: 4 }));
  assert.ok(Math.abs(four.machineHours / one.machineHours - 4) < 1e-9);
});

test('mobilization labour is charged at the operator rate, not the machine rate', () => {
  const r = priceJob(shippedJob());
  assert.equal(r.mobilizationLabor, 1 * 2.5 * 45);
  assert.equal(r.mobilizationTravel, 1 * 70 * 1.35);
  assert.ok(r.ratePerHour.total > r.ratePerHour.operator, 'the two rates must differ for this to mean anything');
});

test('a second trailer trip adds exactly one trip of cost', () => {
  const one = priceJob(shippedJob({ mobilizationTrips: 1 }));
  const two = priceJob(shippedJob({ mobilizationTrips: 2 }));
  assert.ok(Math.abs(two.mobilizationCost - one.mobilizationCost * 2) < 1e-9);
  assert.ok(Math.abs(two.totalCost - one.totalCost - one.mobilizationCost) < 1e-9);
});

// ---------------------------------------------------------------------------
// Validation. These are the tests that stop a blank field pricing work at
// nothing.
// ---------------------------------------------------------------------------

test('an absent figure is refused rather than silently read as zero', () => {
  for (const field of [
    'operatorWagePerHour',
    'fuelPricePerGallon',
    'toothSetCost',
    'maintenancePerHour',
    'machinePaymentMonthly',
    'otherCosts',
    'targetMarginPct',
    'mobilizationMilesEach',
  ]) {
    for (const blank of [null, undefined, '']) {
      assert.throws(
        () => priceJob(shippedJob({ [field]: blank })),
        RangeError,
        `${field} = ${JSON.stringify(blank)} was accepted`,
      );
    }
  }
});

test('every thrown message names the field a visitor can see', () => {
  const cases = [
    ['acres', 0, /Acres to clear/],
    ['headWidthFt', 0, /Mulching head width/],
    ['advanceFtPerMin', 0, /Advance speed/],
    ['passes', 0, /Passes over the ground/],
    ['cuttingEfficiencyPct', 1, /Share of the hour cutting/],
    ['terrainFactorPct', 1, /Terrain factor/],
    ['workHoursPerDay', 0, /Machine hours a day/],
    ['operatorWagePerHour', -1, /Operator cost/],
    ['fuelGallonsPerHour', -1, /Fuel burn/],
    ['toothSetLifeHours', 0, /Hours a set of teeth lasts/],
    ['billableHoursPerMonth', 0, /Billable hours a month/],
    ['targetMarginPct', 99, /Target margin/],
  ];
  for (const [field, value, pattern] of cases) {
    assert.throws(() => priceJob(shippedJob({ [field]: value })), pattern, `${field}`);
  }
});

test('a fractional trip count is refused, because half a trailer trip is not a thing', () => {
  assert.throws(() => priceJob(shippedJob({ mobilizationTrips: 1.5 })), /whole number/);
});

test('a margin of 100% is refused, because the price would be infinite', () => {
  assert.throws(() => priceJob(shippedJob({ targetMarginPct: 100 })), /at most 95/);
  const r = priceJob(shippedJob({ targetMarginPct: 95 }));
  assert.ok(Number.isFinite(r.price));
});

test('text where a number belongs is refused rather than becoming NaN', () => {
  assert.throws(() => priceJob(shippedJob({ acres: 'three' })), /must be a number/);
});

// ---------------------------------------------------------------------------
// The density comparison.
// ---------------------------------------------------------------------------

test('one flat per-acre quote earns on light brush and loses on heavy', () => {
  const rows = compareDensities(shippedJob(), 1000);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].id, 'light-brush');
  assert.equal(rows[3].id, 'heavy-timber');

  assert.ok(rows[0].profit > 0, 'light brush must clear at this quote');
  assert.ok(rows[3].profit < 0, 'heavy understory must not');

  // The headline figure: the spread between best and worst on identical
  // acreage at an identical quote.
  assert.equal(money(rows[0].profit), '$2,059.29');
  assert.equal(money(rows[3].profit), '-$3,810.40');
  assert.equal(money(rows[0].profit - rows[3].profit), '$5,869.69');
});

test('the comparison re-prices the job rather than re-labelling it', () => {
  const rows = compareDensities(shippedJob(), 1000);
  const hours = rows.map((row) => row.machineHours);
  assert.equal(new Set(hours.map((h) => h.toFixed(4))).size, 4, 'two classes produced the same hours');
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].breakEvenPerAcre > rows[i - 1].breakEvenPerAcre);
  }
});

test('revenue in the comparison is the quote times the acreage, unchanged across rows', () => {
  const rows = compareDensities(shippedJob({ acres: 2.5 }), 1200);
  for (const row of rows) assert.equal(row.revenue, 3000);
});

test('margin percent in the comparison agrees with its own profit and revenue', () => {
  for (const row of compareDensities(shippedJob(), 1500)) {
    assert.ok(Math.abs(row.marginPct - (row.profit / row.revenue) * 100) < 1e-9);
  }
});

test('a quote of zero is a valid question and returns the loss on every row', () => {
  const rows = compareDensities(shippedJob(), 0);
  for (const row of rows) {
    assert.equal(row.revenue, 0);
    assert.equal(row.profit, -row.totalCost);
    assert.equal(row.marginPct, 0);
  }
});

// ---------------------------------------------------------------------------
// Advisory notes.
// ---------------------------------------------------------------------------

test('a mobilization-dominated job is flagged and an ordinary one is not', () => {
  const tiny = shippedJob({ acres: 0.25, mobilizationMilesEach: 120 });
  const flagged = reviewJob(tiny, priceJob(tiny));
  assert.ok(flagged.some((note) => /Mobilization is most of this job/.test(note.title)));

  const ordinary = shippedJob({ acres: 20 });
  const quiet = reviewJob(ordinary, priceJob(ordinary));
  assert.ok(!quiet.some((note) => /Mobilization is most of this job/.test(note.title)));
});

test('tooth wear left at zero is called out', () => {
  const input = shippedJob({ toothSetCost: 0 });
  const notes = reviewJob(input, priceJob(input));
  assert.ok(notes.some((note) => /No allowance for tooth wear/.test(note.title)));
});

test('an optimistic tooth life is called out, but not alongside the zero note', () => {
  const input = shippedJob({ toothSetLifeHours: 800 });
  const notes = reviewJob(input, priceJob(input));
  assert.ok(notes.some((note) => /tooth life is optimistic/.test(note.title)));
  assert.ok(!notes.some((note) => /No allowance for tooth wear/.test(note.title)));
});

test('low utilisation is reported as utilisation, not as a price to raise', () => {
  const input = shippedJob({ billableHoursPerMonth: 40 });
  const notes = reviewJob(input, priceJob(input));
  const note = notes.find((n) => /payment, not the work/.test(n.title));
  assert.ok(note);
  assert.match(note.detail, /utilisation problem/);
});

test('a machine left on site overnight is surfaced as a decision, not assumed', () => {
  const input = shippedJob({ acres: 10, mobilizationTrips: 1 });
  const notes = reviewJob(input, priceJob(input));
  assert.ok(notes.some((note) => /multi-day job with one trailer trip/.test(note.title)));

  const floated = shippedJob({ acres: 10, mobilizationTrips: 4 });
  assert.ok(!reviewJob(floated, priceJob(floated)).some((n) => /one trailer trip/.test(n.title)));
});

test('stems larger than the head is rated for are scoped out rather than priced in', () => {
  const input = shippedJob({ largestStemInches: 16, headRatedStemInches: 8 });
  const notes = reviewJob(input, priceJob(input));
  const note = notes.find((n) => /larger than the head is rated for/.test(n.title));
  assert.ok(note);
  assert.match(note.detail, /felling job/);
});

test('a zero-margin run is labelled the walk-away number', () => {
  const input = shippedJob({ targetMarginPct: 0 });
  const notes = reviewJob(input, priceJob(input));
  assert.ok(notes.some((note) => /walk-away number/.test(note.title)));
});

test('every note carries a severity, a title and a detail', () => {
  const input = shippedJob({ acres: 0.25, toothSetCost: 0, targetMarginPct: 0, largestStemInches: 20 });
  const notes = reviewJob(input, priceJob(input));
  assert.ok(notes.length >= 3);
  for (const note of notes) {
    assert.ok(note.severity && note.title && note.detail, JSON.stringify(note));
    assert.doesNotMatch(note.detail, /\$-/, 'money rendered with the sign inside the symbol');
    assert.doesNotMatch(note.detail, /NaN|undefined/, JSON.stringify(note));
  }
});

test('a clean job on a well-utilised machine produces no notes at all', () => {
  const input = shippedJob({
    acres: 6,
    billableHoursPerMonth: 160,
    mobilizationTrips: 3,
    toothSetLifeHours: 250,
    workHoursPerDay: 9,
  });
  const result = priceJob(input);
  assert.deepEqual(reviewJob(input, result), [], 'the empty case must really be empty');
});
