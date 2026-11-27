import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateQuote,
  suggestFleet,
  psaiRestrooms,
  UNIT_PRESETS,
  PSAI_SPECIAL_EVENT_CHART,
} from './calc.mjs';
import { readFileSync } from 'node:fs';

const wedding = () => ({
  units: [
    { name: 'Standard portable restroom', quantity: 4, rentPerDay: 18, serviceEach: 28 },
    { name: 'Wheelchair-accessible unit', quantity: 1, rentPerDay: 40, serviceEach: 38 },
  ],
  daysOnSite: 2,
  serviceVisits: 1,
  deliveryFee: 85,
  pickupFee: 85,
  milesOneWay: 18,
  ratePerMile: 3.5,
  weekendPremiumPct: 0,
  consumablesPerUnit: 8,
  otherCost: 0,
  overheadRate: 12,
  targetMargin: 25,
});

test('rent is charged for every day the box sits, not the event day alone', () => {
  const twoDays = calculateQuote(wedding());
  const oneDay = calculateQuote({ ...wedding(), daysOnSite: 1 });
  // 4×18 + 1×40 = 112 per day
  assert.equal(twoDays.rentalCost, 224);
  assert.equal(oneDay.rentalCost, 112);
  assert.ok(twoDays.price > oneDay.price);
});

test('mileage is two round trips — drop and pickup — not a one-way hop', () => {
  const result = calculateQuote(wedding());
  // 4 × 18 × 3.50 = 252
  assert.equal(result.mileageCost, 252);
  assert.equal(result.haulCost, 85 + 85 + 252);
});

test('a weekend premium marks up haul only, never rent or pump-outs', () => {
  const plain = calculateQuote(wedding());
  const weekend = calculateQuote({ ...wedding(), weekendPremiumPct: 20 });
  assert.ok(Math.abs(weekend.weekendPremium - plain.haulCost * 0.2) < 1e-9);
  assert.equal(weekend.rentalCost, plain.rentalCost);
  assert.equal(weekend.serviceCost, plain.serviceCost);
  assert.ok(weekend.haulCost > plain.haulCost);
});

test('pump-outs scale with units and visits, independent of days on site', () => {
  const once = calculateQuote(wedding());
  const twice = calculateQuote({ ...wedding(), serviceVisits: 2 });
  // 4×28 + 1×38 = 150 per visit
  assert.equal(once.serviceCost, 150);
  assert.equal(twice.serviceCost, 300);
  const longerSit = calculateQuote({ ...wedding(), daysOnSite: 4 });
  assert.equal(longerSit.serviceCost, once.serviceCost);
});

test('price stacks overhead then margin as a share of price', () => {
  const result = calculateQuote(wedding());
  const rental = 224;
  const service = 150;
  const haul = 85 + 85 + 252;
  const consumables = 5 * 8;
  const direct = rental + service + haul + consumables;
  assert.equal(result.directCost, direct);
  assert.ok(Math.abs(result.overhead - direct * 0.12) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.12) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a Saturday-special that ignores extra days and miles goes underwater', () => {
  const real = calculateQuote(wedding());
  const saturdaySpecial = 5 * 125;
  const scored = calculateQuote({ ...wedding(), proposedPrice: saturdaySpecial });
  assert.ok(saturdaySpecial < real.totalCost, 'the special is below cost');
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('a zero-margin quote prices at cost', () => {
  const result = calculateQuote({ ...wedding(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('price per unit-day is the yard sanity check, and zero days reports n/a', () => {
  const result = calculateQuote(wedding());
  assert.equal(result.unitDays, 10);
  assert.ok(Math.abs(result.pricePerUnitDay - result.price / 10) < 1e-9);
  const parked = calculateQuote({ ...wedding(), daysOnSite: 0, serviceVisits: 0 });
  assert.equal(parked.pricePerUnitDay, null);
  assert.equal(parked.rentalCost, 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateQuote(wedding()).proposed, null);
  assert.equal(calculateQuote({ ...wedding(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateQuote({ ...wedding(), proposedPrice: 0 }).proposed.price, 0);
});

test('a proposed price at the computed quote keeps the target margin', () => {
  const bid = calculateQuote(wedding());
  const scored = calculateQuote({ ...wedding(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('a nameless unit type still reports under a stable label', () => {
  const result = calculateQuote({
    ...wedding(),
    units: [{ quantity: 2, rentPerDay: 18, serviceEach: 28 }, { name: '   ', quantity: 1, rentPerDay: 18, serviceEach: 28 }],
  });
  assert.equal(result.units[0].name, 'Unit type 1');
  assert.equal(result.units[1].name, 'Unit type 2');
  assert.equal(result.totalUnits, 3);
});

// Cells read off the PSAI Special Event Chart PDF (Extended Breakdown, no
// pumping service; henniker.org copy), not off calc.mjs. The first six are the
// quality round 109 audit's recomputation, which the old uncited table missed
// by 2x to 4x (10 / 17 / 20 / 34 / 200 / 334).
const PSAI_CELLS = [
  [500, 4, 5], [500, 8, 9], [1000, 4, 8], [1000, 8, 12], [10000, 4, 50], [10000, 8, 100],
  [500, 1, 2], [2000, 3, 9], [5000, 10, 63], [25000, 1, 38], [55000, 7, 486], [100000, 10, 1251],
];

test('fleet estimate reproduces the PSAI Special Event Chart cells', () => {
  for (const [attendees, eventHours, expected] of PSAI_CELLS) {
    assert.equal(suggestFleet({ attendees, eventHours }).restroomUnits, expected, `${attendees} x ${eventHours} h`);
    assert.equal(psaiRestrooms({ attendees, eventHours }).withinChart, true);
  }
});

test('chart shape: 25 crowd rows from 500 to 100,000, ten hourly columns, never fewer units for more people or hours', () => {
  assert.equal(PSAI_SPECIAL_EVENT_CHART.length, 25);
  assert.equal(PSAI_SPECIAL_EVENT_CHART[0].crowd, 500);
  assert.equal(PSAI_SPECIAL_EVENT_CHART.at(-1).crowd, 100000);
  PSAI_SPECIAL_EVENT_CHART.forEach((row, i) => {
    assert.equal(row.units.length, 10);
    row.units.forEach((u, h) => {
      if (h > 0) assert.ok(u >= row.units[h - 1], `${row.crowd} row falls at ${h + 1} h`);
      if (i > 0) assert.ok(u >= PSAI_SPECIAL_EVENT_CHART[i - 1].units[h], `${row.crowd} below previous row at ${h + 1} h`);
    });
  });
});

test('between rows, below 500, past 10 hours and with alcohol the estimate interpolates, scales and rounds up', () => {
  // 750 x 4 h: halfway between 5 and 8 -> 6.5 -> 7
  assert.deepEqual(psaiRestrooms({ attendees: 750, eventHours: 4 }), { restroomUnits: 7, withinChart: true });
  // 4.2 h reads the 5-hour column (rounds up, not to nearest): 1,000 x 5 h = 9
  assert.equal(psaiRestrooms({ attendees: 1000, eventHours: 4.2 }).restroomUnits, 9);
  // 200 x 8 h: 9 x 200/500 = 3.6 -> 4, flagged outside the chart
  assert.deepEqual(psaiRestrooms({ attendees: 200, eventHours: 8 }), { restroomUnits: 4, withinChart: false });
  // 1,000 x 12 h: 13 x 12/10 = 15.6 -> 16
  assert.deepEqual(psaiRestrooms({ attendees: 1000, eventHours: 12 }), { restroomUnits: 16, withinChart: false });
  // alcohol +20%: 1,000 x 8 h = 12 x 1.2 = 14.4 -> 15; 500 x 8 h = 9 x 1.2 = 10.8 -> 11
  assert.equal(psaiRestrooms({ attendees: 1000, eventHours: 8, alcohol: true }).restroomUnits, 15);
  assert.equal(psaiRestrooms({ attendees: 500, eventHours: 8, alcohol: true }).restroomUnits, 11);
  // exact products stay exact: 200 x 4 h = 5 x 0.4 = 2, not 3
  assert.equal(psaiRestrooms({ attendees: 200, eventHours: 4 }).restroomUnits, 2);
  // a tiny crowd still gets one unit
  assert.equal(psaiRestrooms({ attendees: 10, eventHours: 2 }).restroomUnits, 1);
});

test('suggested fleet splits accessible units out and adds handwash only when food is served', () => {
  const dry = suggestFleet({ attendees: 1000, eventHours: 8, alcohol: true, foodService: false });
  // 12 x 1.2 = 14.4 -> 15 restrooms; 5% of 15 rounds up to 1 accessible
  assert.equal(dry.restroomUnits, 15);
  assert.equal(dry.ada, 1);
  assert.equal(dry.standard, 14);
  assert.equal(dry.handwash, 0);
  assert.equal(dry.peoplePerUnit, 67);

  const catering = suggestFleet({ attendees: 1000, eventHours: 8, alcohol: true, foodService: true });
  assert.equal(catering.handwash, 4);
});

test('the 200-person SEO page table matches the engine', () => {
  const html = readFileSync(new URL('./how-many.html', import.meta.url), 'utf8');
  const rows = [...html.matchAll(/<tr><td>(?:Up to (\d+)|\d+–(\d+)) hours<\/td><td>(\d+) restrooms<\/td><td>(\d+) restrooms<\/td><\/tr>/g)];
  assert.equal(rows.length, 5);
  for (const m of rows) {
    const hours = Number(m[1] ?? m[2]);
    assert.equal(suggestFleet({ attendees: 200, eventHours: hours }).restroomUnits, Number(m[3]), `${hours} h`);
    assert.equal(suggestFleet({ attendees: 200, eventHours: hours, alcohol: true }).restroomUnits, Number(m[4]), `${hours} h alcohol`);
  }
  assert.match(html, /PSAI/);
  assert.doesNotMatch(html, /not a published standard/);
});

test('zero attendees suggests an empty fleet rather than a free unit', () => {
  const empty = suggestFleet({ attendees: 0, eventHours: 8 });
  assert.equal(empty.restroomUnits, 0);
  assert.equal(empty.standard, 0);
  assert.equal(empty.ada, 0);
});

test('a quoted fleet lighter than the starting estimate is flagged, not forbidden', () => {
  const light = calculateQuote({
    ...wedding(),
    attendees: 500,
    eventHours: 8,
    alcohol: true,
  });
  assert.equal(light.quotedRestrooms, 5);
  assert.ok(light.suggestion.restroomUnits > 5);
  assert.equal(light.restroomsLookLight, true);
  assert.ok(light.pricePerAttendee > 0);
});

test('a fleet sized to the PSAI chart is not flagged light', () => {
  const result = calculateQuote({
    ...wedding(),
    units: [{ name: 'Standard portable restroom', quantity: 12, rentPerDay: 18, serviceEach: 28 }],
    attendees: 1000,
    eventHours: 8,
  });
  assert.equal(result.suggestion.restroomUnits, 12);
  assert.equal(result.restroomsLookLight, false);
});

test('handwash and trailer rows do not count as restrooms in the light-fleet check', () => {
  const result = calculateQuote({
    ...wedding(),
    units: [
      { name: 'Standard portable restroom', quantity: 9, rentPerDay: 18, serviceEach: 28 },
      { name: 'Handwash / sanitizer station', quantity: 4, rentPerDay: 22, serviceEach: 22 },
    ],
    attendees: 200,
    eventHours: 8,
    alcohol: true,
  });
  assert.equal(result.quotedRestrooms, 9);
  assert.equal(result.restroomsLookLight, false);
  assert.equal(result.totalUnits, 13);
});

test('inputs that would silently produce a nonsense quote are rejected', () => {
  assert.throws(() => calculateQuote({ ...wedding(), units: [] }), /at least one unit type/);
  assert.throws(() => calculateQuote({ ...wedding(), daysOnSite: -1 }), /Days on site must be at least 0/);
  assert.throws(() => calculateQuote({ ...wedding(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateQuote({ ...wedding(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateQuote({ ...wedding(), milesOneWay: 'far' }), /Miles one way must be a number/);
  assert.throws(
    () => calculateQuote({
      ...wedding(),
      units: [{ name: 'Standard', quantity: -2, rentPerDay: 18, serviceEach: 28 }],
    }),
    /Standard: quantity must be at least 0/,
  );
});

test('unit presets are usable positive numbers', () => {
  assert.ok(UNIT_PRESETS.length >= 4);
  for (const preset of UNIT_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.rentPerDay > 0);
    assert.ok(preset.serviceEach > 0);
  }
});

test('the hire terms the customer agrees to are returned, not just consumed', () => {
  // `daysOnSite` and `serviceVisits` were validated and then used only to
  // derive costs. The customer proposal drafts its scope from the result
  // alone, and these two are the terms the customer is actually agreeing to —
  // how long the units stay and how often they are serviced. Without them the
  // drafted scope silently drops both lines (`scopeLines` omits a line whose
  // placeholder is missing), so the sheet would describe a hire with no
  // duration and no service schedule.
  const result = calculateQuote({
    units: [{ name: 'Standard', quantity: 4, rentPerDay: 12, serviceEach: 9 }],
    daysOnSite: 3,
    serviceVisits: 2,
  });
  assert.equal(result.daysOnSite, 3);
  assert.equal(result.serviceVisits, 2);
  assert.equal(result.unitDays, result.totalUnits * result.daysOnSite);
});
