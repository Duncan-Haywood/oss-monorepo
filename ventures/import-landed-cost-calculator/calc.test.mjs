import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDED_COST_DEFAULTS,
  MPF_FORMAL_MIN,
  MPF_FORMAL_MAX,
  MPF_INFORMAL_FLAT,
  calculateLandedCost,
  calculateMpf,
  calculateHmf,
  breakdownRows,
} from './calc.mjs';

test('the worked example ($5,000 / $800 freight / 500 units / 4.5% duty / 25% supplemental / formal ocean) matches by hand', () => {
  const result = calculateLandedCost(LANDED_COST_DEFAULTS);
  assert.equal(result.customsValue, 5800);
  assert.equal(result.fees.duty, 261);
  assert.equal(result.fees.supplementalTariff, 1450);
  // 0.3464% of 5800 = 20.0912, below the $32.71 floor, so the floor applies.
  assert.equal(Number(result.fees.mpf.toFixed(4)), 32.71);
  // 0.125% of 5800 = 7.25
  assert.equal(result.fees.hmf, 7.25);
  assert.equal(result.fees.brokerFee, 125);
  assert.equal(Number(result.totalLandedCost.toFixed(2)), 7675.96);
  assert.equal(Number(result.perUnitLandedCost.toFixed(5)), 15.35192);
  assert.equal(Number(result.effectiveTariffBurdenPct.toFixed(4)), 35.0192);
});

test('breakdownRows lists every line item ending in the total', () => {
  const result = calculateLandedCost(LANDED_COST_DEFAULTS);
  const rows = breakdownRows(result);
  assert.deepEqual(rows.map(([label]) => label), [
    'Item cost',
    'Freight to port',
    'Insurance',
    'Duty',
    'Supplemental / Section 301 tariff',
    'Merchandise Processing Fee',
    'Harbor Maintenance Fee',
    'Customs broker / entry fee',
    'Total landed cost',
  ]);
  const [, total] = rows[rows.length - 1];
  assert.equal(Number(total.toFixed(2)), Number(result.totalLandedCost.toFixed(2)));
});

test('zero freight prices customs value from item cost alone', () => {
  const result = calculateLandedCost({ ...LANDED_COST_DEFAULTS, freightCost: 0 });
  assert.equal(result.customsValue, 5000);
  assert.equal(result.fees.duty, 225);
  assert.equal(result.fees.supplementalTariff, 1250);
});

test('zero quantity is rejected rather than producing a divide-by-zero', () => {
  assert.throws(
    () => calculateLandedCost({ ...LANDED_COST_DEFAULTS, quantity: 0 }),
    /at least 1 unit/,
  );
  assert.throws(
    () => calculateLandedCost({ ...LANDED_COST_DEFAULTS, quantity: -3 }),
    /non-negative|at least 1 unit/,
  );
});

test('a fractional quantity is rejected', () => {
  assert.throws(
    () => calculateLandedCost({ ...LANDED_COST_DEFAULTS, quantity: 2.5 }),
    /whole number/,
  );
});

test('quantity defaults to 1 unit when omitted', () => {
  const result = calculateLandedCost({ ...LANDED_COST_DEFAULTS, quantity: undefined });
  assert.equal(result.quantity, 1);
  assert.equal(Number(result.perUnitLandedCost.toFixed(2)), Number(result.totalLandedCost.toFixed(2)));
});

test('formal entry MPF is floored at the statutory minimum on a small shipment', () => {
  const mpf = calculateMpf(1000, 'formal');
  assert.equal(mpf, MPF_FORMAL_MIN);
});

test('formal entry MPF is capped at the statutory maximum on a large shipment', () => {
  // 0.3464% of $500,000 would be $1,732 -- well above the $634.62 ceiling.
  const mpf = calculateMpf(500000, 'formal');
  assert.equal(mpf, MPF_FORMAL_MAX);
});

test('formal entry MPF floats between the floor and ceiling on a mid-size shipment', () => {
  // Customs value where 0.3464% lands clear of both the floor and the
  // ceiling: 0.3464% of 100000 = 346.40.
  const mpf = calculateMpf(100000, 'formal');
  assert.equal(Number(mpf.toFixed(2)), 346.40);
  assert.ok(mpf > MPF_FORMAL_MIN && mpf < MPF_FORMAL_MAX);
});

test('informal entry MPF is a flat fee regardless of customs value', () => {
  assert.equal(calculateMpf(100, 'informal'), MPF_INFORMAL_FLAT);
  assert.equal(calculateMpf(2000, 'informal'), MPF_INFORMAL_FLAT);
  assert.equal(calculateMpf(500000, 'informal'), MPF_INFORMAL_FLAT);
});

test('informal entry in the full calculation uses the flat MPF, not the percentage schedule', () => {
  const result = calculateLandedCost({ ...LANDED_COST_DEFAULTS, entryType: 'informal' });
  assert.equal(result.fees.mpf, MPF_INFORMAL_FLAT);
});

test('HMF is zero unless the ocean checkbox is set', () => {
  assert.equal(calculateHmf(10000, false), 0);
  assert.equal(calculateHmf(10000, true), 12.5);
});

test('HMF is charged on formal or informal ocean entries alike', () => {
  const formal = calculateLandedCost({ ...LANDED_COST_DEFAULTS, entryType: 'formal', oceanFreight: true });
  const informal = calculateLandedCost({ ...LANDED_COST_DEFAULTS, entryType: 'informal', oceanFreight: true });
  assert.equal(formal.fees.hmf, 7.25);
  assert.equal(informal.fees.hmf, 7.25);
});

test('unchecking ocean freight drops the Harbor Maintenance Fee from the total', () => {
  const withOcean = calculateLandedCost(LANDED_COST_DEFAULTS);
  const withoutOcean = calculateLandedCost({ ...LANDED_COST_DEFAULTS, oceanFreight: false });
  assert.equal(withoutOcean.fees.hmf, 0);
  assert.equal(
    Number((withOcean.totalLandedCost - withoutOcean.totalLandedCost).toFixed(2)),
    7.25,
  );
});

test('rejects a negative item cost, freight, insurance, duty rate, or broker fee', () => {
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, itemCost: -1 }), /non-negative/);
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, freightCost: -1 }), /non-negative/);
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, insuranceCost: -1 }), /non-negative/);
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, dutyRatePct: -1 }), /non-negative/);
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, supplementalRatePct: -1 }), /non-negative/);
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, brokerFee: -1 }), /non-negative/);
});

test('rejects a non-numeric field', () => {
  assert.throws(() => calculateLandedCost({ ...LANDED_COST_DEFAULTS, itemCost: 'nope' }), /non-negative/);
});

test('rejects an entry type outside formal/informal', () => {
  assert.throws(
    () => calculateLandedCost({ ...LANDED_COST_DEFAULTS, entryType: 'express' }),
    /formal, informal/,
  );
});

test('entry type defaults to formal when omitted', () => {
  const result = calculateLandedCost({ ...LANDED_COST_DEFAULTS, entryType: undefined });
  assert.equal(result.entryType, 'formal');
});

test('a zero duty and supplemental rate still prices freight, insurance, MPF, HMF and broker fee', () => {
  const result = calculateLandedCost({
    ...LANDED_COST_DEFAULTS,
    dutyRatePct: 0,
    supplementalRatePct: 0,
  });
  assert.equal(result.fees.duty, 0);
  assert.equal(result.fees.supplementalTariff, 0);
  assert.ok(result.fees.mpf > 0);
  assert.ok(result.fees.hmf > 0);
  assert.equal(
    Number(result.effectiveTariffBurdenPct.toFixed(6)),
    Number((result.fees.mpf / result.itemCost * 100 + result.fees.hmf / result.itemCost * 100).toFixed(6)),
  );
});

test('effective tariff burden is 0% when item cost is 0, rather than dividing by zero', () => {
  const result = calculateLandedCost({ ...LANDED_COST_DEFAULTS, itemCost: 0 });
  assert.equal(result.effectiveTariffBurdenPct, 0);
  assert.ok(Number.isFinite(result.effectiveTariffBurdenPct));
});

test('insurance adds straight to total landed cost without affecting customs value or duty', () => {
  const base = calculateLandedCost(LANDED_COST_DEFAULTS);
  const withInsurance = calculateLandedCost({ ...LANDED_COST_DEFAULTS, insuranceCost: 200 });
  assert.equal(withInsurance.customsValue, base.customsValue);
  assert.equal(withInsurance.fees.duty, base.fees.duty);
  assert.equal(
    Number((withInsurance.totalLandedCost - base.totalLandedCost).toFixed(2)),
    200,
  );
});

test('pricing: margin at a selling price and minimum price for a target margin', async () => {
  const { calculateLandedCost } = await import('./calc.mjs');
  const r = calculateLandedCost({ sellPricePerUnit: 24, targetMarginPct: 30 });
  const unit = r.perUnitLandedCost;
  assert.ok(Math.abs(r.pricing.profitPerUnit - (24 - unit)) < 1e-9);
  assert.ok(Math.abs(r.pricing.marginPct - (24 - unit) / 24 * 100) < 1e-9);
  assert.ok(Math.abs(r.pricing.minPriceForTarget * 0.7 - unit) < 1e-9);
  assert.equal(r.pricing.breakEvenPrice, unit);
  const blank = calculateLandedCost({ sellPricePerUnit: '' });
  assert.equal(blank.pricing.profitPerUnit, null);
  assert.equal(blank.pricing.marginPct, null);
  assert.throws(() => calculateLandedCost({ targetMarginPct: 100 }), /under 100/);
});

import { calculateEntry } from './calc.mjs';

test('a one-line entry matches the single-shipment calculation', () => {
  const d = LANDED_COST_DEFAULTS;
  const single = calculateLandedCost(d);
  const entry = calculateEntry(
    [{ itemCost: d.itemCost, quantity: d.quantity, dutyRatePct: d.dutyRatePct, supplementalRatePct: d.supplementalRatePct }],
    d,
  );
  assert.ok(Math.abs(entry.totalLandedCost - single.totalLandedCost) < 1e-9);
  assert.ok(Math.abs(entry.lines[0].perUnitLandedCost - single.perUnitLandedCost) < 1e-9);
});

test('MPF is charged once on the combined entry, not per line', () => {
  // Two $10,000 lines: combined customs value $20,000 -> 0.3464% = $69.28.
  // Per-line MPF would be 2 x $34.64; here it is one fee on $20,000.
  const e = calculateEntry(
    [
      { name: 'A', itemCost: 10000, quantity: 100, dutyRatePct: 0, supplementalRatePct: 0 },
      { name: 'B', itemCost: 10000, quantity: 100, dutyRatePct: 0, supplementalRatePct: 0 },
    ],
    { brokerFee: 0, entryType: 'formal', oceanFreight: false },
  );
  assert.equal(Number(e.fees.mpf.toFixed(2)), 69.28);
  assert.equal(Number(e.lines[0].entryFees.toFixed(2)), 34.64);
});

test('three small lines share one MPF floor instead of paying it three times', () => {
  const lines = [1, 2, 3].map(n => ({ itemCost: 1000, quantity: 10, dutyRatePct: 0, supplementalRatePct: 0 }));
  const e = calculateEntry(lines, { brokerFee: 0, entryType: 'formal' });
  assert.equal(e.fees.mpf, MPF_FORMAL_MIN); // $3,000 -> 10.39 raw, floor 32.71 once
});

test('freight splits by item cost and each line uses its own rates', () => {
  const e = calculateEntry(
    [
      { itemCost: 3000, quantity: 1, dutyRatePct: 10, supplementalRatePct: 0 },
      { itemCost: 1000, quantity: 1, dutyRatePct: 0, supplementalRatePct: 25 },
    ],
    { freightCost: 400, brokerFee: 0, entryType: 'informal' },
  );
  assert.equal(e.lines[0].freight, 300);
  assert.equal(e.lines[1].freight, 100);
  assert.equal(e.lines[0].duty, 330); // 10% of 3,300
  assert.equal(e.lines[1].supplementalTariff, 275); // 25% of 1,100
  const sum = e.lines.reduce((s, l) => s + l.totalLandedCost, 0);
  assert.ok(Math.abs(sum - e.totalLandedCost) < 1e-9);
});

test('calculateEntry rejects empty entries and fractional quantities', () => {
  assert.throws(() => calculateEntry([]), /at least one/);
  assert.throws(() => calculateEntry([{ itemCost: 10, quantity: 1.5 }]), /whole number/);
});
