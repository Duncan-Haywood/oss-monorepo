import test from 'node:test';
import assert from 'node:assert/strict';

import { checkPool, isEligible, round2, CATEGORIES } from './calc.mjs';

const EXAMPLE_ROWS = [
  { name: 'Servers', category: 'front', inPool: true, hoursPerWeek: 30, headcount: 6 },
  { name: 'Bartenders', category: 'front', inPool: true, hoursPerWeek: 25, headcount: 2 },
  { name: 'Dishwashers', category: 'back', inPool: true, hoursPerWeek: 35, headcount: 2 },
  { name: 'Shift manager', category: 'manager', inPool: true, hoursPerWeek: 40, headcount: 1 },
];

test('round2 rounds money half away from zero', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-1.005), -1.01);
  assert.equal(round2(2.345), 2.35);
});

test('isEligible: a manager is never eligible, regardless of tip-credit status', () => {
  assert.equal(isEligible('manager', true), false);
  assert.equal(isEligible('manager', false), false);
});

test('isEligible: back-of-house is eligible only when no tip credit is taken', () => {
  assert.equal(isEligible('back', true), false);
  assert.equal(isEligible('back', false), true);
});

test('isEligible: front-of-house is always eligible either way', () => {
  assert.equal(isEligible('front', true), true);
  assert.equal(isEligible('front', false), true);
});

test('the worked example: a manager and a back-of-house role both improperly pooled while a tip credit is taken', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: EXAMPLE_ROWS,
  });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 2);
  assert.equal(result.managerViolations.length, 1);
  assert.equal(result.managerViolations[0].name, 'Shift manager');
  assert.equal(result.backOfHouseViolations.length, 1);
  assert.equal(result.backOfHouseViolations[0].name, 'Dishwashers');
  // 6*30 + 2*25 = 230 front-of-house hours/week
  assert.equal(result.frontHoursPerWeek, 230);
  assert.equal(result.clawbackApplies, true);
  assert.equal(result.weeklyExposure, 1177.6);
  assert.equal(result.totalExposure, 4710.4);
});

test('no tip credit taken: back-of-house is fine, a manager is still a violation, and there is no clawback figure', () => {
  const result = checkPool({
    tipCreditTaken: false,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: EXAMPLE_ROWS,
  });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].name, 'Shift manager');
  assert.equal(result.backOfHouseViolations.length, 0);
  assert.equal(result.clawbackApplies, false);
  assert.equal(result.weeklyExposure, 0);
  assert.equal(result.totalExposure, 0);
});

test('a fully compliant pool: front-of-house only, tip credit taken', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [
      { name: 'Servers', category: 'front', inPool: true, hoursPerWeek: 30, headcount: 6 },
      { name: 'Bartenders', category: 'front', inPool: true, hoursPerWeek: 25, headcount: 2 },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.warnings.some((w) => w.code === 'compliant'), true);
});

test('a role not marked as in the pool is never a violation, whatever its category', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [
      { name: 'Line cooks', category: 'back', inPool: false, hoursPerWeek: 35, headcount: 3 },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test('an unused row (no name, no headcount) is skipped rather than treated as a role', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [
      { name: 'Servers', category: 'front', inPool: true, hoursPerWeek: 30, headcount: 6 },
      { name: '', category: 'front', inPool: false, hoursPerWeek: '', headcount: '' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.roles.length, 1);
});

test('rejects when there are no usable roles at all', () => {
  const result = checkPool({ tipCreditTaken: true, tipCreditPerHour: '5.12', weeksExposed: '4', rows: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /at least one role/);
});

test('rejects an out-of-range hours/week', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [{ name: 'Servers', category: 'front', inPool: true, hoursPerWeek: 200, headcount: 1 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /Hours\/week/);
});

test('rejects a non-numeric tip credit', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: 'lots',
    weeksExposed: '4',
    rows: EXAMPLE_ROWS,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /Tip credit per hour/);
});

test('an unrecognised category falls back to front-of-house rather than throwing', () => {
  const result = checkPool({
    tipCreditTaken: true,
    tipCreditPerHour: '5.12',
    weeksExposed: '4',
    rows: [{ name: 'Mystery role', category: 'nonsense', inPool: true, hoursPerWeek: 10, headcount: 1 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.roles[0].category, 'front');
  assert.equal(result.violations.length, 0);
});

test('CATEGORIES names exactly the three the page offers', () => {
  assert.deepEqual([...CATEGORIES].sort(), ['back', 'front', 'manager']);
});
