import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRates, notes, ALL_INPUT_IDS, REQUIRED_INPUT_IDS, OSHA_BASE_RATE_HOURS } from './calc.mjs';

const near = (actual, expected, tolerance = 0.001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

/** A 60-person contractor, one full year, textbook OSHA worked example. */
const BASE = {
  recordableCases: 6,
  dartCases: 2,
  totalHoursWorked: 120000,
  targetTrir: 3.0,
  avgHoursPerMonth: '',
};

test('OSHA_BASE_RATE_HOURS is the documented 100-employee base rate', () => {
  assert.equal(OSHA_BASE_RATE_HOURS, 200000);
});

test('TRIR and DART rate match the OSHA formula directly', () => {
  const result = calculateRates(BASE);
  assert.equal(result.ok, true);
  near(result.trir, (6 * 200000) / 120000); // 10
  near(result.dartRate, (2 * 200000) / 120000); // 3.333...
  assert.equal(result.nonDartRecordableCases, 4);
});

test('zero recordable cases gives a zero rate, not an error', () => {
  const result = calculateRates({ ...BASE, recordableCases: 0, dartCases: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.trir, 0);
  assert.equal(result.dartRate, 0);
  assert.match(result.notes[0], /Zero recordable cases/);
});

test('DART cases cannot exceed recordable cases', () => {
  const result = calculateRates({ ...BASE, recordableCases: 1, dartCases: 2 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.id === 'dartCases'));
});

test('total hours worked must be positive', () => {
  const result = calculateRates({ ...BASE, totalHoursWorked: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.id === 'totalHoursWorked'));
});

test('case counts must be whole numbers', () => {
  const result = calculateRates({ ...BASE, recordableCases: 2.5 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.id === 'recordableCases' && /whole number/.test(e.message)));
});

test('a rate at or below target needs no dilution figure', () => {
  const result = calculateRates({ ...BASE, recordableCases: 3, targetTrir: 5 }); // trir = 5, exactly on target
  assert.equal(result.ok, true);
  assert.equal(result.onTarget, true);
  assert.equal(result.extraHoursToTarget, null);
});

test('a rate above target computes the additional injury-free hours to dilute it there', () => {
  // trir = 10 with target 5: solve 6*200000/(120000+h) = 5 -> h = 120000
  const result = calculateRates({ ...BASE, targetTrir: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.onTarget, false);
  near(result.extraHoursToTarget, 120000);
  assert.equal(result.monthsToTarget, null); // no monthly-hours input given
});

test('supplying average monthly hours converts the dilution figure into months', () => {
  const result = calculateRates({ ...BASE, targetTrir: 5, avgHoursPerMonth: 10000 });
  assert.equal(result.ok, true);
  near(result.extraHoursToTarget, 120000);
  near(result.monthsToTarget, 12);
});

test('zero recordable cases above a zero target has nothing to dilute', () => {
  const result = calculateRates({ ...BASE, recordableCases: 0, dartCases: 0, targetTrir: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.trir, 0);
  assert.equal(result.onTarget, true); // 0 <= 0
});

test('a nonzero rate against a zero target has no finite dilution figure', () => {
  const result = calculateRates({ ...BASE, targetTrir: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.onTarget, false);
  assert.equal(result.extraHoursToTarget, null);
});

test('ALL_INPUT_IDS includes every REQUIRED_INPUT_IDS entry', () => {
  for (const id of REQUIRED_INPUT_IDS) assert.ok(ALL_INPUT_IDS.includes(id));
});

test('notes never claims a compliance or recordability determination', () => {
  const result = calculateRates(BASE);
  const text = result.notes.join(' ');
  assert.doesNotMatch(text, /compliant|you are recordable|this case (is|is not) recordable/i);
});
