import assert from 'node:assert/strict';
import {
  calculateCashFloat,
  calculateIncomeCoverage,
  calculatePlan,
  compareOffer,
  formatIncomeCoverageAdvice,
  DEFAULT_FILL_RATE,
  comparePaymentTerms,
  compareRetainerScenarios,
  compareRetainerUsage,
  compareUnusedHourRollover,
  formatScenarioComparison,
  retainerHourOptions,
  scenarioInsight,
  DRAFT_KEY,
  DISCLAIMER,
  formatArrearsComparison,
  formatCashFloatAdvice,
  formatProposalSummary,
  formatRolloverAdvice,
  loadDraft,
  saveDraft,
} from './app.js';
import { buildShareUrl, decodeInputs, encodeInputs } from './share.mjs';

const plan = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
assert.equal(plan.capacity, 104);
assert.equal(plan.remainingCapacity, 84);
assert.equal(plan.target, 7800);
assert.equal(plan.rate, 75);
assert.equal(plan.retainer, 1725);
assert.equal(plan.retainerHours, 20);
const summary = formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15' }, plan, 'USD');
assert.match(summary, /Monthly price: \$1,725/);
const tenHour = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 10, buffer: 15 });
assert.equal(tenHour.retainer, 862.5);
assert.match(formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '10', buffer: '15' }, tenHour, 'USD'), /Monthly price: \$862\.5/);
assert.match(summary, /Billable utilization: 65%/);
assert.match(summary, /Unpaid extras drop below the floor after: 23 hours/);
assert.ok(summary.includes(DISCLAIMER));
assert.throws(() => calculatePlan({ income: 1, costs: 1, hours: 0, utilization: 50, retainerHours: 1, buffer: 0 }));
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 105, buffer: 15 }), /only 104.0 billable hours/);

const usage = compareRetainerUsage(plan);
assert.equal(usage.breakEvenHours, 23);
assert.equal(usage.bufferHours, 3);
assert.equal(usage.rows.length, 4);
const half = usage.rows[0];
assert.equal(half.hoursUsed, 10);
assert.equal(half.hourlyAtFloor, 750);
assert.equal(half.effectiveRate, 172.5);
assert.equal(half.freelancerDelta, 975);
assert.equal(half.coversFloor, true);
assert.equal(half.unusedHours, 10);
const full = usage.rows[2];
assert.equal(full.hoursUsed, 20);
assert.equal(full.hourlyAtFloor, 1500);
assert.equal(full.effectiveRate, 86.25);
assert.equal(full.coversFloor, true);
const over = usage.rows[3];
assert.equal(over.hoursUsed, 25);
assert.equal(over.effectiveRate, 69);
assert.equal(over.coversFloor, false);
assert.equal(over.overageHours, 5);
assert.equal(over.withOverageRevenue, 2100);
assert.equal(over.withOverageEffectiveRate, 84);
assert.equal(over.withOverageCoversFloor, true);
assert.match(usage.recommendation, /23 hours/);
assert.match(usage.recommendation, /25 hours/);
assert.match(usage.recommendation, /10 hours/);
assert.throws(() => compareRetainerUsage({ rate: 0, retainer: 100, retainerHours: 10 }));
assert.throws(() => compareRetainerUsage(plan, { fractions: [0] }));
const custom = compareRetainerUsage(plan, { fractions: [1] });
assert.equal(custom.rows.length, 1);
assert.equal(custom.rows[0].hoursUsed, 20);
const thin = compareRetainerUsage({ rate: 100, retainer: 1800, retainerHours: 20 });
assert.equal(thin.bufferHours, -2);
assert.match(thin.recommendation, /already sits below your hourly floor/);

const prepaid = calculateCashFloat(plan.target, 'prepaid');
assert.equal(prepaid.days, 0);
assert.equal(prepaid.cashToFloat, 0);
assert.equal(prepaid.prepaid, true);
assert.match(formatCashFloatAdvice(prepaid, 'USD'), /do not float/);

const net15 = calculateCashFloat(plan.target, 'net15');
assert.equal(net15.days, 15);
assert.equal(net15.cashToFloat, 3900);

const net30 = calculateCashFloat(plan.target, 'net30');
assert.equal(net30.days, 30);
assert.equal(net30.cashToFloat, 7800);

const arrears30 = calculateCashFloat(plan.target, 'arrears30');
assert.equal(arrears30.days, 60);
assert.equal(arrears30.cashToFloat, 15600);
assert.match(formatCashFloatAdvice(arrears30, 'EUR'), /€15,600/);
assert.match(formatArrearsComparison(plan.target, 'USD'), /\$15,600/);
assert.throws(() => calculateCashFloat(Number.NaN, 'prepaid'), /revenue target/);

const terms = comparePaymentTerms(plan.target);
assert.equal(terms.length, 5);
assert.deepEqual(terms.map((row) => row.cashToFloat), [0, 3900, 7800, 11700, 15600]);

const floatSummary = formatProposalSummary({
  income: '6000',
  costs: '1800',
  hours: '160',
  utilization: '65',
  retainerHours: '20',
  buffer: '15',
  paymentTerms: 'arrears30',
}, plan, 'USD');
assert.match(floatSummary, /Invoice at month-end, Net 30/);
assert.match(floatSummary, /\$15,600/);
assert.match(floatSummary, /Unpaid extras drop below the floor after: 23 hours/);
assert.match(floatSummary, /Unused-hour rollover:/);
assert.match(floatSummary, /\$750/);

const rollover = compareUnusedHourRollover(plan);
assert.equal(rollover.month1Hours, 10);
assert.equal(rollover.unusedHours, 10);
assert.equal(rollover.month2NewHours, 20);
assert.equal(rollover.bufferHours, 3);
assert.equal(rollover.clauses.length, 3);
const expire = rollover.clauses[0];
assert.equal(expire.key, 'expire');
assert.equal(expire.rolledHours, 0);
assert.equal(expire.month2Hours, 20);
assert.equal(expire.month2Effective, 86.25);
assert.equal(expire.month2CoversFloor, true);
assert.equal(expire.giftedCash, 0);
const cap = rollover.clauses[1];
assert.equal(cap.key, 'cap-buffer');
assert.equal(cap.rolledHours, 3);
assert.equal(cap.month2Hours, 23);
assert.equal(cap.month2Effective, 75);
assert.equal(cap.month2CoversFloor, true);
assert.equal(cap.giftedCash, 225);
const unlimited = rollover.clauses[2];
assert.equal(unlimited.key, 'unlimited');
assert.equal(unlimited.rolledHours, 10);
assert.equal(unlimited.month2Hours, 30);
assert.equal(unlimited.month2Effective, 57.5);
assert.equal(unlimited.month2CoversFloor, false);
assert.equal(unlimited.giftedHours, 10);
assert.equal(unlimited.giftedCash, 750);
assert.equal(unlimited.twoMonthHours, 40);
assert.equal(unlimited.twoMonthRevenue, 3450);
assert.equal(unlimited.twoMonthEffective, 86.25);
assert.match(rollover.recommendation, /30 hours/);
assert.match(rollover.recommendation, /57.5\/hr/);
assert.match(rollover.recommendation, /3-hour buffer/);
assert.match(formatRolloverAdvice(rollover, 'USD'), /\$750/);
assert.match(formatRolloverAdvice(rollover, 'EUR'), /€750/);

const fullUseRoll = compareUnusedHourRollover(plan, { month1Fraction: 1, month2Fraction: 1 });
assert.equal(fullUseRoll.unusedHours, 0);
assert.equal(fullUseRoll.clauses[2].rolledHours, 0);
assert.match(fullUseRoll.recommendation, /nothing to roll/);

const thinRoll = compareUnusedHourRollover({ rate: 100, retainer: 1800, retainerHours: 20 });
assert.equal(thinRoll.bufferHours, 0);
assert.equal(thinRoll.clauses[1].rolledHours, 0);
assert.match(thinRoll.recommendation, /Expire unused hours/);

const idleFirst = compareUnusedHourRollover(plan, { month1Fraction: 0, month2Fraction: 1 });
assert.equal(idleFirst.month1Hours, 0);
assert.equal(idleFirst.unusedHours, 20);
assert.equal(idleFirst.clauses[2].month2Hours, 40);
assert.equal(idleFirst.clauses[2].giftedCash, 1500);

assert.throws(() => compareUnusedHourRollover({ rate: 0, retainer: 100, retainerHours: 10 }));
assert.throws(() => compareUnusedHourRollover(plan, { month1Fraction: -1 }), /percentage from 0 to 200/);
assert.throws(() => compareUnusedHourRollover(plan, { month2Fraction: 3 }), /percentage from 0 to 200/);

const data = new Map();
const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
const draft = {
  income: '5000',
  costs: '900',
  hours: '140',
  utilization: '70',
  retainerHours: '16',
  buffer: '10',
  otherRevenue: '3000',
  otherHours: '40',
  fillRate: '60',
  offeredPrice: '1400',
  currency: 'EUR',
  paymentTerms: 'net30',
};
assert.equal(saveDraft(draft, storage), true);
assert.deepEqual(loadDraft(storage), draft);
assert.equal(loadDraft({ getItem: () => '{broken' }), null);
assert.equal(data.has(DRAFT_KEY), true);

const legacy = new Map([[DRAFT_KEY, JSON.stringify({
  income: '5000',
  costs: '900',
  hours: '140',
  utilization: '70',
  retainerHours: '16',
  buffer: '10',
})]]);
// A draft saved before the month-level inputs existed must still restore. The
// missing keys come back as '', which the form leaves at its own defaults.
assert.deepEqual(loadDraft({ getItem: (key) => legacy.get(key) || null }), {
  income: '5000',
  costs: '900',
  hours: '140',
  utilization: '70',
  retainerHours: '16',
  buffer: '10',
  otherRevenue: '',
  otherHours: '',
  fillRate: '',
  offeredPrice: '',
  currency: '',
  paymentTerms: '',
});

assert.equal(saveDraft({ ...draft, currency: 'XXX', paymentTerms: 'wire' }, storage), true);
assert.equal(loadDraft(storage).currency, '');
assert.equal(loadDraft(storage).paymentTerms, '');

// --- Income goal coverage -------------------------------------------------
// The floor is `target / capacity`, which only reaches the goal if the whole
// month sells. These check that the tool now says so.

// Defaults reproduce the tool's previous implicit assumption exactly: no other
// commitments, 100% fill. If this ever stops holding, the new block has
// silently changed the advice the old page gave.
const fullFill = calculateIncomeCoverage(plan);
assert.equal(fullFill.fillRatePercent, DEFAULT_FILL_RATE);
assert.equal(fullFill.committedRevenue, 1725);
assert.equal(fullFill.unsoldHours, 84);
assert.equal(fullFill.expectedOtherRevenue, 6300); // 84 h x $75
assert.equal(fullFill.expectedRevenue, 8025);      // retainer carries its buffer
assert.equal(fullFill.coversTarget, true);
assert.equal(fullFill.surplus, 225);               // the 15% scope buffer, banked
assert.equal(fullFill.shortfall, 0);

// The finding: clearing the floor is not reaching the goal. At a 60% fill the
// same retainer, unchanged and still above the floor, misses by thousands.
const realistic = calculateIncomeCoverage(plan, { fillRatePercent: 60 });
assert.equal(realistic.expectedFillHours, 50.4);
assert.equal(realistic.expectedRevenue, 5505);
assert.equal(realistic.shortfall, 2295);
assert.equal(realistic.coversTarget, false);
// Cross-check the break-even against the forward calculation rather than
// restating the formula: filling exactly `requiredFillRate` must land on the
// target, and it must be reachable inside the capacity that exists.
assert.equal(realistic.reachableWithinCapacity, true);
const atRequired = calculateIncomeCoverage(plan, { fillRatePercent: realistic.requiredFillRate });
assert.ok(Math.abs(atRequired.expectedRevenue - plan.target) < 1, `expected ${plan.target}, got ${atRequired.expectedRequired ?? atRequired.expectedRevenue}`);
// And the other branch of the same decision: pricing the retainer at
// `retainerPriceToCloseGap` closes the gap without selling one more hour.
assert.equal(realistic.retainerPriceToCloseGap, round2ForTest(plan.retainer + 2295));

// Other committed work counts toward the goal and consumes capacity.
const withOther = calculateIncomeCoverage(plan, { otherRevenue: 3000, otherHours: 40, fillRatePercent: 60 });
assert.equal(withOther.committedRevenue, 4725);
assert.equal(withOther.committedHours, 60);
assert.equal(withOther.unsoldHours, 44);
assert.equal(withOther.expectedRevenue, 6705); // 4725 + 26.4 h x 75
assert.equal(withOther.shortfall, 1095);
assert.match(withOther.recommendation, /does not reach the goal/);

// The verdict is prose a human reads, so its money must carry the chosen
// symbol rather than a bare number. Currency is display-only: the numeric
// fields must be identical either way.
const inEuros = calculateIncomeCoverage(plan, { fillRatePercent: 60, currency: 'EUR' });
assert.match(inEuros.recommendation, /€5,505 of €7,800, €2,295 short/);
assert.match(realistic.recommendation, /\$5,505 of \$7,800, \$2,295 short/);
assert.equal(inEuros.shortfall, realistic.shortfall);
assert.equal(inEuros.requiredFillRate, realistic.requiredFillRate);

// A goal no amount of selling can reach must say so instead of printing a
// fill rate above 100 as if it were a plan.
const impossible = calculateIncomeCoverage(
  { ...plan, target: 40000, rate: plan.rate, capacity: plan.capacity, retainer: plan.retainer, retainerHours: plan.retainerHours },
);
assert.equal(impossible.reachableWithinCapacity, false);
assert.ok(impossible.requiredFillRate > 100);
assert.match(impossible.recommendation, /No fill rate closes it/);
assert.match(formatIncomeCoverageAdvice(impossible), /Unreachable by selling/);

// No unsold hours left: the gap can only move on price or capacity, and the
// division that would produce the fill rate must not run.
const soldOut = calculateIncomeCoverage(plan, { otherHours: 84, otherRevenue: 100 });
assert.equal(soldOut.unsoldHours, 0);
assert.equal(soldOut.requiredFillRate, null);
assert.equal(soldOut.coversTarget, false);
assert.match(soldOut.recommendation, /no unsold hours left/i);

// Committing more hours than the plan has is an error, not a negative number.
assert.throws(() => calculateIncomeCoverage(plan, { otherHours: 90 }), /only 104.0 billable hours/);
assert.throws(() => calculateIncomeCoverage(plan, { fillRatePercent: 140 }), /percentage from 0 to 100/);
assert.throws(() => calculateIncomeCoverage(plan, { otherRevenue: -5 }), /zero or more/);

// The proposal summary is copied into a client-facing document. What other
// clients pay this freelancer must never appear in it.
const summaryWithOtherClients = formatProposalSummary(
  { income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15', otherRevenue: '3000', otherHours: '40', fillRate: '60' },
  plan,
  'USD',
);
assert.ok(!summaryWithOtherClients.includes('3,000'), 'proposal summary leaked other-client revenue');
assert.ok(!summaryWithOtherClients.includes('Other committed'), 'proposal summary leaked other-client wording');
assert.ok(!/fill rate/i.test(summaryWithOtherClients), 'proposal summary leaked the fill-rate assumption');

assert.equal(compareOffer(plan, ''), null);
assert.equal(compareOffer(plan, null), null);
const below = compareOffer(plan, '1500');
assert.equal(below.offeredPrice, 1500);
assert.equal(below.gap, -225);
assert.equal(below.belowFloor, true);
assert.equal(below.effectiveIncluded, 75);
assert.equal(below.hoursAtFloor, 17.4);
const above = compareOffer(plan, '1800');
assert.equal(above.gap, 75);
assert.equal(above.belowFloor, false);
assert.throws(() => compareOffer(plan, 'nope'), /valid offered monthly price/);
assert.throws(() => compareOffer(plan, '-10'), /valid offered monthly price/);

function round2ForTest(value) {
  return Math.round(value * 100) / 100;
}

const shared = {
  income: 6000,
  costs: 1800,
  hours: 160,
  utilization: 65,
  retainerHours: 20,
  buffer: 15,
  otherRevenue: 3000,
  otherHours: 40,
  fillRate: 60,
  offeredPrice: 1500,
  currency: 'USD',
  paymentTerms: 'arrears30',
};
const restored = decodeInputs(encodeInputs(shared));
assert.deepEqual(calculatePlan(restored), plan);
assert.equal(restored.otherRevenue, 3000);
assert.equal(restored.otherHours, 40);
assert.equal(restored.fillRate, 60);
assert.equal(restored.offeredPrice, 1500);
assert.equal(restored.paymentTerms, 'arrears30');
assert.match(buildShareUrl('https://example.test/app/', shared), /#income=6000/);
assert.match(encodeInputs(shared), /otherRevenue=3000/);
assert.match(encodeInputs(shared), /paymentTerms=arrears30/);

const values = { income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 };
assert.deepEqual(retainerHourOptions(20), [10, 15, 20, 25, 30]);
assert.deepEqual(retainerHourOptions(18), [10, 15, 18, 20, 25, 30]);
const scenarios = compareRetainerScenarios(values);
assert.equal(scenarios.length, 5);
assert.equal(scenarios[0].retainerHours, 10);
assert.equal(scenarios[0].ok, true);
assert.equal(scenarios[0].retainer, 862.5);
assert.equal(scenarios[0].effectiveRate, 86.25);
assert.equal(scenarios[2].selected, true);
assert.equal(scenarios[2].retainer, 1725);
assert.equal(scenarios[2].shareOfCapacity, 20 / 104);
const overflow = compareRetainerScenarios({ ...values, retainerHours: 110 });
assert.equal(overflow.find((row) => row.retainerHours === 110).ok, false);
assert.equal(overflow.find((row) => row.retainerHours === 20).ok, true);
const comparison = formatScenarioComparison(scenarios, 'USD');
assert.match(comparison, /20 hours — \$1,725 \/ month — 84\.0 hours left  ← this proposal/);
assert.match(comparison, /10 hours — \$863 \/ month/);
assert.match(scenarioInsight(scenarios), /19% of your billable capacity/);
assert.match(scenarioInsight(overflow), /largest size that does is 30 hours/);
const heavy = compareRetainerScenarios({ ...values, retainerHours: 60 });
assert.match(scenarioInsight(heavy), /more than half your month/);

console.log('freelance retainer calculator tests passed');
