import assert from 'node:assert/strict';
import {
  calculateCashFloat,
  calculatePlan,
  comparePaymentTerms,
  compareRetainerUsage,
  DRAFT_KEY,
  DISCLAIMER,
  formatArrearsComparison,
  formatCashFloatAdvice,
  formatProposalSummary,
  loadDraft,
  saveDraft,
} from './app.js';

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

const data = new Map();
const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
const draft = {
  income: '5000',
  costs: '900',
  hours: '140',
  utilization: '70',
  retainerHours: '16',
  buffer: '10',
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
assert.deepEqual(loadDraft({ getItem: (key) => legacy.get(key) || null }), {
  income: '5000',
  costs: '900',
  hours: '140',
  utilization: '70',
  retainerHours: '16',
  buffer: '10',
  currency: '',
  paymentTerms: '',
});

assert.equal(saveDraft({ ...draft, currency: 'XXX', paymentTerms: 'wire' }, storage), true);
assert.equal(loadDraft(storage).currency, '');
assert.equal(loadDraft(storage).paymentTerms, '');

console.log('freelance retainer calculator tests passed');
