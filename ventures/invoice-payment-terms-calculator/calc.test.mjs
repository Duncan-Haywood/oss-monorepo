import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTerms, termsCopy } from './calc.mjs';
import fs from 'node:fs';

const input = { amount: 1200, invoiceDate: '2026-08-24', termsDays: 30, annualLateRate: 18, graceDays: 10, monthlyBurn: 3000, outstanding: 3 };

test('calculates due date, exposure, and late-fee scenarios', () => {
  const result = calculateTerms(input);
  assert.equal(result.dueDate, '2026-09-23');
  assert.equal(result.exposure, 3600);
  assert.equal(result.fees[0].fee, 11.835616438356164);
  assert.equal(result.runwayDays, 36);
});

test('grace period prevents fees during the grace window', () => {
  const result = calculateTerms({ ...input, graceDays: 30 });
  assert.equal(result.fees.find(row => row.days === 30).fee, 0);
});

test('rejects calendar dates that JavaScript would normalize', () => {
  assert.throws(() => calculateTerms({ ...input, invoiceDate: '2026-02-30' }), /valid invoice date/);
});

test('rejects missing invoice details instead of throwing an implementation error', () => {
  assert.throws(() => calculateTerms(), /invoice details/);
});

test('creates transparent copyable terms without claiming compliance', () => {
  assert.match(termsCopy(calculateTerms(input)), /due 2026-09-23/);
  assert.match(termsCopy(calculateTerms(input)), /18% annual interest/);
});

test('does not ship a stale hardcoded invoice date', () => {
  const page = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /id="invoiceDate"[^>]*value="\d{4}-\d{2}-\d{2}"/);
  assert.match(page, /invoiceDate.*new Date\(\)\.toISOString\(\)/s);
});
