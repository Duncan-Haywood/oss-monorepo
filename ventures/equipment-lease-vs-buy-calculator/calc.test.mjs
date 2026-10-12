import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLeaseVsBuy, loanPayment, impliedLeaseApr, normalizeInputs, toCsv, encodeState, decodeState } from './calc.mjs';

const base = {
  price: 10000, salesTaxPct: 0, downPaymentPct: 100, loanAprPct: 0, loanTermMonths: 12,
  leaseMonthlyPayment: 600, leaseTermMonths: 12, leaseDueAtSigning: 0, leaseEndBuyout: 0,
  resaleValue: 4000, taxRatePct: 0, discountRatePct: 0, depreciation: 'none',
};

test('no tax, no discounting, cash purchase: buy cost is price minus resale', () => {
  const r = compareLeaseVsBuy(base);
  assert.equal(r.buyCost, 6000);
  assert.equal(r.leaseCost, 7200);
  assert.equal(r.advantage, 1200);
  assert.equal(r.winner, 'buy');
});

test('tax: full expensing and taxed resale, hand-counted', () => {
  // buy: 10000 - 25% x 10000 (year-1 deduction) - (4000 - 25% x (4000 - 0 basis)) = 10000 - 2500 - 3000 = 4500
  // lease: 12 x 600 x 75% = 5400
  const r = compareLeaseVsBuy({ ...base, taxRatePct: 25, depreciation: 'expense' });
  assert.equal(r.buyCost, 4500);
  assert.equal(r.leaseCost, 5400);
  assert.equal(r.advantage, 900);
});

test('a zero-rate loan repaid inside the term costs the price', () => {
  const r = compareLeaseVsBuy({ ...base, downPaymentPct: 0, resaleValue: 0 });
  assert.equal(r.buyCost, 10000);
  assert.equal(r.monthlyLoanPayment, 833.33);
});

test('loanPayment matches the standard amortization formula', () => {
  assert.ok(Math.abs(loanPayment(100000, 6, 360) - 599.55) < 0.01);
  assert.equal(loanPayment(0, 6, 12), 0);
  assert.equal(loanPayment(1200, 0, 12), 100);
});

test('break-even resale value makes the two paths equal', () => {
  const inputs = { ...base, taxRatePct: 25, depreciation: 'macrs5', discountRatePct: 6, loanAprPct: 7, downPaymentPct: 20, leaseMonthlyPayment: 520, leaseDueAtSigning: 500 };
  const r = compareLeaseVsBuy(inputs);
  assert.ok(r.breakEvenResale !== null && r.breakEvenResale > 0);
  const again = compareLeaseVsBuy({ ...inputs, resaleValue: r.breakEvenResale });
  assert.ok(Math.abs(again.advantage) < 0.05, `advantage at break-even was ${again.advantage}`);
});

test('buying wins at any resale value gets a note instead of a negative break-even', () => {
  const r = compareLeaseVsBuy({ ...base, leaseMonthlyPayment: 2000 });
  assert.equal(r.breakEvenResale, null);
  assert.match(r.notes.join(' '), /Buying wins even if the equipment is worth nothing/);
});

test('a lease-end buyout adds the buyout and values the kept equipment', () => {
  // no tax, no discount: lease = 7200 + 3000 buyout - 4000 resale = 6200; buy = 6000
  const r = compareLeaseVsBuy({ ...base, leaseEndBuyout: 3000 });
  assert.equal(r.leaseCost, 6200);
  assert.equal(r.advantage, 200);
});

test('a loan longer than the term is settled out of the sale at the end', () => {
  // 12000 financed at 0% over 24 months, 12-month horizon: pay 12 x 500, repay 6000 at month 12, sell for 0 -> 12000
  const r = compareLeaseVsBuy({ ...base, price: 12000, downPaymentPct: 0, loanTermMonths: 24, resaleValue: 0 });
  assert.equal(r.buyCost, 12000);
  assert.match(r.notes.join(' '), /remaining balance is repaid/);
});

test('faster depreciation methods rank above slower ones', () => {
  const r = compareLeaseVsBuy({ ...base, leaseTermMonths: 60, loanTermMonths: 60, taxRatePct: 30, discountRatePct: 8, depreciation: 'expense' });
  const cost = Object.fromEntries(r.methods.map((m) => [m.key, m.buyCost]));
  assert.ok(cost.expense < cost.macrs5 && cost.macrs5 < cost.macrs7 && cost.macrs7 < cost.sl5 && cost.sl5 < cost.none);
});

test('implied lease rate: payments that exactly repay the price at zero interest', () => {
  const n = normalizeInputs({ ...base, leaseMonthlyPayment: 10000 / 12, resaleValue: 0 });
  assert.ok(Math.abs(impliedLeaseApr(n)) < 0.01);
  const priced = normalizeInputs({ ...base, leaseMonthlyPayment: loanPayment(10000, 12, 12), resaleValue: 0 });
  assert.ok(Math.abs(impliedLeaseApr(priced) - 12) < 0.01);
});

test('sensitivity grid has 3 discount rates x 4 resale values and agrees with the headline cell', () => {
  const r = compareLeaseVsBuy({ ...base, discountRatePct: 5, taxRatePct: 21, depreciation: 'macrs7' });
  assert.equal(r.sensitivity.length, 12);
  const mid = r.sensitivity.find((s) => s.discountRatePct === 5 && s.residualMultiplier === 1);
  assert.ok(Math.abs(mid.advantage - r.advantage) < 0.02);
});

test('bad input throws instead of being clamped', () => {
  assert.throws(() => compareLeaseVsBuy({ ...base, price: 0 }), /Equipment price/);
  assert.throws(() => compareLeaseVsBuy({ ...base, price: 'abc' }), /must be a number/);
  assert.throws(() => compareLeaseVsBuy({ ...base, taxRatePct: 99 }), /at most/);
  assert.throws(() => compareLeaseVsBuy({ ...base, loanTermMonths: 12.5 }), /whole number/);
  assert.throws(() => compareLeaseVsBuy({ ...base, depreciation: 'bogus' }), /depreciation/);
  assert.throws(() => compareLeaseVsBuy({ ...base, resaleValue: '' }), /required/);
});

test('CSV neutralises formula cells and state round-trips', () => {
  const csv = toCsv(compareLeaseVsBuy(base));
  assert.match(csv, /^item,value\r\n/);
  assert.ok(!/^[=+@]/m.test(csv));
  const enc = encodeState({ ...base, junk: 'x' });
  assert.ok(!enc.includes('junk'));
  assert.equal(decodeState(enc).price, '10000');
});
