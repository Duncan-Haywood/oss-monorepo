import assert from 'node:assert/strict';
import {
  calculateCashFloat,
  calculatePlan,
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

const prepaid = calculateCashFloat(plan.target, 'prepaid');
assert.equal(prepaid.days, 0);
assert.equal(prepaid.cashToFloat, 0);
assert.equal(prepaid.prepaid, true);
assert.match(formatCashFloatAdvice(prepaid, 'USD'), /do not float/);

const net15 = calculateCashFloat(plan.target, 'net15');
assert.equal(net15.days, 15);
assert.equal(net15.cashToFloat, 3900);

const arrears30 = calculateCashFloat(plan.target, 'arrears30');
assert.equal(arrears30.days, 60);
assert.equal(arrears30.cashToFloat, 15600);
assert.match(formatCashFloatAdvice(arrears30, 'EUR'), /€15,600/);
assert.match(formatArrearsComparison(plan.target, 'USD'), /\$15,600/);
assert.throws(() => calculateCashFloat(Number.NaN, 'prepaid'), /revenue target/);

const summary = formatProposalSummary({
  income: '6000',
  costs: '1800',
  hours: '160',
  utilization: '65',
  retainerHours: '20',
  buffer: '15',
  paymentTerms: 'arrears30',
}, plan, 'USD');
assert.match(summary, /Monthly price: \$1,725/);
assert.match(summary, /Billable utilization: 65%/);
assert.match(summary, /Invoice at month-end, Net 30/);
assert.match(summary, /\$15,600/);
assert.ok(summary.includes(DISCLAIMER));

assert.throws(() => calculatePlan({ income: 1, costs: 1, hours: 0, utilization: 50, retainerHours: 1, buffer: 0 }));
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 105, buffer: 15 }), /only 104.0 billable hours/);

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
