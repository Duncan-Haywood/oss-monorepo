import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, plan, touchupFullPrice, touchupNote, policyDraft } from './touchup.mjs';

const money = (n) => `$${n.toFixed(2)}`;

test('parseInputs rejects a non-positive session price', () => {
  const result = parseInputs({ price: 0, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 1, pricingMode: 'percent', touchupPercent: 25 });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /session price/);
});

test('parseInputs defaults an unrecognised pricing mode to percent', () => {
  const result = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 1, pricingMode: 'bogus', touchupPercent: 25 });
  assert.equal(result.values.pricingMode, 'percent');
});

test('parseInputs requires hourly-mode fields only in hourly mode', () => {
  const percentOnly = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 1, pricingMode: 'percent', touchupPercent: 25 });
  assert.equal(percentOnly.ok, true);

  const missingHourly = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 1, pricingMode: 'hourly' });
  assert.equal(missingHourly.ok, false);
  assert.match(missingHourly.errors.join(' '), /Hourly rate/);
  assert.match(missingHourly.errors.join(' '), /touch-up hours/);
});

test('touchupFullPrice: percent mode is a share of the original price', () => {
  const price = touchupFullPrice({ pricingMode: 'percent', price: 200, touchupPercent: 25 });
  assert.equal(price, 50);
});

test('touchupFullPrice: flat mode ignores the original price', () => {
  const price = touchupFullPrice({ pricingMode: 'flat', price: 200, touchupFlat: 40 });
  assert.equal(price, 40);
});

test('touchupFullPrice: hourly mode multiplies rate by estimated hours', () => {
  const price = touchupFullPrice({ pricingMode: 'hourly', hourlyRate: 150, touchupHours: 0.5 });
  assert.equal(price, 75);
});

test('plan: deposit and balance mirror the deposit-calculator formula', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 1, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  assert.equal(modeled.deposit, 50);
  assert.equal(modeled.balance, 150);
});

test('plan: inside the free window nothing is due, even though the full price is still reported', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 3, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  assert.equal(modeled.withinFreeWindow, true);
  assert.equal(modeled.amountDue, 0);
  assert.equal(modeled.touchupFullPrice, 50);
  assert.equal(modeled.monthsRemaining, 3);
});

test('plan: past the free window the full price is due', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 9, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  assert.equal(modeled.withinFreeWindow, false);
  assert.equal(modeled.amountDue, 50);
  assert.equal(modeled.monthsRemaining, 0);
});

test('plan: exactly at the window boundary still counts as free', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 6, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  assert.equal(modeled.withinFreeWindow, true);
  assert.equal(modeled.amountDue, 0);
});

test('touchupNote states nothing due when inside the window, and never recommends a window length', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 2, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  const note = touchupNote(values, modeled, money);
  assert.match(note, /nothing is due/);
  assert.doesNotMatch(note, /should offer|recommended window|you should charge/i);
});

test('touchupNote states the price once the window has passed', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 9, pricingMode: 'percent', touchupPercent: 25 });
  const modeled = plan(values);
  const note = touchupNote(values, modeled, money);
  assert.match(note, /\$50\.00/);
});

test('policyDraft includes the deposit, balance, free window, and pricing rule without recommending amounts', () => {
  const { values } = parseInputs({ price: 200, depositPercent: 25, freeWindowMonths: 6, monthsSinceSession: 2, pricingMode: 'hourly', hourlyRate: 150, touchupHours: 0.5, businessName: 'Northside Ink', artistName: 'Jess' });
  const modeled = plan(values);
  const draft = policyDraft(values, modeled, money);
  assert.match(draft, /Northside Ink/);
  assert.match(draft, /\$50\.00 deposit/);
  assert.match(draft, /\$150\.00 is due/);
  assert.match(draft, /complimentary within 6 month/);
  assert.match(draft, /\$150\.00\/hour, estimated at 0\.5 hour\(s\) \(\$75\.00\)/);
  assert.doesNotMatch(draft, /you should charge|recommended deposit/i);
});
