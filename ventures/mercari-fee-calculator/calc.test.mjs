import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSale, compareSchedules, feeFor, priceForTargetPayout,
  SELLING_FEE_RATE, LEGACY_SELLING_FEE_RATE, LEGACY_PROCESSING_RATE,
  LEGACY_PROCESSING_FIXED, BUYER_PROTECTION_RATE,
} from './calc.mjs';

test('current schedule: 10% on item price alone, no shipping', () => {
  const result = calculateSale({ itemPrice: 50, itemCost: 15, otherCost: 0.5 });
  assert.equal(result.ok, true);
  assert.equal(result.sellingFee, 5);
  assert.equal(result.processingFee, 0);
  assert.equal(result.mercariFee, 5);
  assert.equal(result.payout, 45);
  assert.ok(Math.abs(result.profit - 29.5) < 1e-9);
  assert.equal(result.effectiveRate, 10);
});

test('current schedule: the fee reaches buyer-paid shipping too', () => {
  const result = calculateSale({ itemPrice: 20, buyerShipping: 6 });
  assert.equal(result.ok, true);
  // 10% of (20 + 6) = 2.60, not 10% of 20 = 2.00
  assert.ok(Math.abs(result.sellingFee - 2.6) < 1e-9);
  assert.ok(Math.abs(result.payout - 23.4) < 1e-9);
  assert.match(result.notes.join(' '), /inside the 10% fee base/);
});

test('legacy schedule: selling fee on item price only, plus 2.9% + $0.50 processing on the combined total', () => {
  const result = calculateSale({ itemPrice: 50, legacySchedule: true });
  assert.equal(result.ok, true);
  assert.equal(result.sellingFee, 5);
  assert.ok(Math.abs(result.processingFee - 1.95) < 1e-9); // 50*0.029 + 0.50
  assert.ok(Math.abs(result.mercariFee - 6.95) < 1e-9);
  assert.ok(Math.abs(result.payout - 43.05) < 1e-9);
  assert.match(result.notes.join(' '), /pre-January 6, 2025 schedule/);
});

test('legacy schedule taxes shipping at 2.9%, not the 10% selling rate', () => {
  const result = calculateSale({ itemPrice: 10, buyerShipping: 40, legacySchedule: true });
  // selling fee: 10% of item price only = 1.00
  // processing: 2.9% of 50 + 0.50 = 1.45 + 0.50 = 1.95
  assert.ok(Math.abs(result.sellingFee - 1) < 1e-9);
  assert.ok(Math.abs(result.processingFee - 1.95) < 1e-9);
  assert.ok(Math.abs(result.mercariFee - 2.95) < 1e-9);
});

test('a self-bought shipping label reduces payout but is not counted as a Mercari fee', () => {
  const withLabel = calculateSale({ itemPrice: 50, labelCost: 6 });
  const withoutLabel = calculateSale({ itemPrice: 50, labelCost: 0 });
  assert.ok(Math.abs(withLabel.mercariFee - withoutLabel.mercariFee) < 1e-9);
  assert.ok(Math.abs((withoutLabel.payout - withLabel.payout) - 6) < 1e-9);
});

test('the Buyer Protection Fee is disclosed but never subtracted from seller payout', () => {
  const result = calculateSale({ itemPrice: 50 });
  assert.ok(Math.abs(result.buyerProtectionFee - 50 * (BUYER_PROTECTION_RATE / 100)) < 1e-9);
  // Payout must equal combined minus Mercari's own fee alone.
  assert.ok(Math.abs(result.payout - (50 - result.mercariFee)) < 1e-9);
  assert.match(result.notes.join(' '), /Buyer Protection Fee/);
  assert.match(result.notes.join(' '), /never reduces this payout/);
});

test('required field validation surfaces a field id and message', () => {
  const result = calculateSale({ itemPrice: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'itemPrice');
});

test('a negative item price is rejected', () => {
  const result = calculateSale({ itemPrice: -5 });
  assert.equal(result.ok, false);
});

test('a losing sale is flagged in the notes', () => {
  const result = calculateSale({ itemPrice: 5, itemCost: 20 });
  assert.ok(result.profit < 0);
  assert.match(result.notes.join(' '), /loses money/);
});

test('priceForTargetPayout solves the current schedule exactly', () => {
  const price = priceForTargetPayout(45, { buyerShipping: 0, labelCost: 0, legacySchedule: false });
  // 0.9 * price = 45 -> price = 50
  assert.ok(Math.abs(price - 50) < 1e-9);
  const check = calculateSale({ itemPrice: price });
  assert.ok(Math.abs(check.payout - 45) < 1e-6);
});

test('priceForTargetPayout solves the current schedule with shipping and a label', () => {
  const price = priceForTargetPayout(23.4, { buyerShipping: 6, labelCost: 0, legacySchedule: false });
  assert.ok(Math.abs(price - 20) < 1e-9);
});

test('priceForTargetPayout solves the legacy schedule exactly', () => {
  const price = priceForTargetPayout(43.05, { buyerShipping: 0, labelCost: 0, legacySchedule: true });
  assert.ok(Math.abs(price - 50) < 1e-6);
});

test('calculateSale solves for the item price that hits a target profit', () => {
  const result = calculateSale({ itemPrice: 1, itemCost: 15, otherCost: 0.5, targetProfit: 20 });
  assert.ok(result.priceForTarget !== null);
  const check = calculateSale({ itemPrice: result.priceForTarget, itemCost: 15, otherCost: 0.5 });
  assert.ok(Math.abs(check.profit - 20) < 1e-6);
});

test('feeFor matches calculateSale on both schedules', () => {
  const current = feeFor({ itemPrice: 30, buyerShipping: 5, legacySchedule: false });
  const legacy = feeFor({ itemPrice: 30, buyerShipping: 5, legacySchedule: true });
  const saleCurrent = calculateSale({ itemPrice: 30, buyerShipping: 5 });
  const saleLegacy = calculateSale({ itemPrice: 30, buyerShipping: 5, legacySchedule: true });
  assert.ok(Math.abs(current.mercariFee - saleCurrent.mercariFee) < 1e-9);
  assert.ok(Math.abs(legacy.mercariFee - saleLegacy.mercariFee) < 1e-9);
});

test('compareSchedules: current pays more when the price is mostly item, no shipping', () => {
  const result = compareSchedules({ itemPrice: 50 });
  assert.equal(result.ok, true);
  assert.ok(result.payoutDifference > 0, 'current schedule drops the processing fee entirely here');
  assert.match(result.notes.join(' '), /current schedule pays/);
});

test('compareSchedules: legacy pays more when most of the price is buyer-paid shipping', () => {
  const result = compareSchedules({ itemPrice: 10, buyerShipping: 40 });
  assert.equal(result.ok, true);
  assert.ok(result.payoutDifference < 0, 'legacy only taxes shipping at 2.9%, current taxes it at 10%');
  assert.match(result.notes.join(' '), /legacy schedule pays/);
});

test('compareSchedules surfaces errors from either side', () => {
  const result = compareSchedules({ itemPrice: '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('rate constants are the published figures this module documents', () => {
  assert.equal(SELLING_FEE_RATE, 10);
  assert.equal(LEGACY_SELLING_FEE_RATE, 10);
  assert.equal(LEGACY_PROCESSING_RATE, 2.9);
  assert.equal(LEGACY_PROCESSING_FIXED, 0.50);
  assert.equal(BUYER_PROTECTION_RATE, 3.6);
});
