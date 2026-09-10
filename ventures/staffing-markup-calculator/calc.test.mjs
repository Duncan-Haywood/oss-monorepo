import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_INPUT_IDS,
  DEFAULT_FUTA_PERCENT,
  DEFAULT_FUTA_WAGE_BASE,
  burdenBreakdown,
  calculatePlacement,
  markupForMargin,
  markupToMargin,
  marginToMarkup,
} from './calc.mjs';

/**
 * The worked example the page opens on: a $22/h light-industrial placement,
 * 40 hours a week for 13 weeks, quoted at the 45% markup the trade treats as
 * healthy, in a state with a 3% SUTA on a $12,000 base, on a $6.20/$100 comp
 * code, collected on net-45.
 */
const EXAMPLE = {
  payRate: 22,
  markupPercent: 45,
  hoursPerWeek: 40,
  otHoursPerWeek: 0,
  weeksOnAssignment: 13,
  otPayMultiplier: 1.5,
  otBillMultiplier: 1.5,
  ficaPercent: 7.65,
  futaPercent: DEFAULT_FUTA_PERCENT,
  futaWageBase: DEFAULT_FUTA_WAGE_BASE,
  sutaPercent: 3,
  sutaWageBase: 12000,
  workersCompRate: 6.2,
  ptoPercent: 0,
  benefitsPerHour: 0,
  onboardingCost: 85,
  otherPerHour: 0.35,
  daysToGetPaid: 45,
  costOfCapitalPercent: 12,
  badDebtPercent: 0.5,
  targetMarginPercent: 20,
};

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test('the worked example prices out to hand-checked figures', () => {
  const result = calculatePlacement(EXAMPLE);
  assert.equal(result.ok, true);

  // 40 x 13 = 520 hours, 520 x $22 = $11,440 of wages.
  assert.equal(result.hours.totalHours, 520);
  near(result.wages.totalWages, 11440, 0.001);

  // FICA 7.65% of 11,440 = 875.16
  near(result.burden.items.find((i) => i.key === 'fica').amount, 875.16);
  // FUTA 0.6% of min(11440, 7000) = 42.00 — the whole annual charge, because
  // this assignment alone exhausts the base.
  near(result.burden.items.find((i) => i.key === 'futa').amount, 42);
  // SUTA 3% of min(11440, 12000) = 3% of 11,440 = 343.20
  near(result.burden.items.find((i) => i.key === 'suta').amount, 343.2);
  // Comp 6.2 per $100 of 11,440 = 709.28
  near(result.burden.items.find((i) => i.key === 'workersComp').amount, 709.28);
  // Other 0.35 x 520 = 182.00, plus the one-time 85.
  near(result.burden.items.find((i) => i.key === 'other').amount, 182);
  near(result.burden.items.find((i) => i.key === 'onboarding').amount, 85);

  near(result.burden.total, 875.16 + 42 + 343.2 + 709.28 + 182 + 85);
  near(result.loadedCost, 11440 + result.burden.total, 0.001);

  // Bill rate 22 x 1.45 = 31.90; revenue 31.90 x 520 = 16,588.
  near(result.billRate, 31.9, 0.0001);
  near(result.revenue, 16588, 0.001);
});

test('the 45% markup the trade calls a 31% margin is not one', () => {
  const result = calculatePlacement(EXAMPLE);
  // What a recruiter would quote from the markup alone.
  near(markupToMargin(45), 31.034, 0.01);
  // What the placement actually earns once burden, carry and bad debt land.
  assert.ok(
    result.grossMarginPercent < 20,
    `expected the real margin to fall well short of 31%, got ${result.grossMarginPercent}`,
  );
  assert.ok(result.grossMarginPercent > 0, 'the example should still be profitable, just not by 31%');
});

test('markup and margin convert back and forth', () => {
  near(markupToMargin(0), 0);
  near(marginToMarkup(0), 0);
  near(marginToMarkup(markupToMargin(45)), 45, 0.0001);
  near(markupToMargin(marginToMarkup(30)), 30, 0.0001);
  assert.equal(marginToMarkup(100), null, 'a 100% margin needs an infinite markup');
  assert.equal(marginToMarkup(140), null);
});

test('the break-even markup produces exactly zero profit', () => {
  const result = calculatePlacement(EXAMPLE);
  const atBreakEven = calculatePlacement({
    ...EXAMPLE,
    markupPercent: result.breakEvenMarkupPercent,
  });
  near(atBreakEven.grossProfit, 0, 0.0001);
  near(atBreakEven.grossMarginPercent, 0, 0.0001);
});

test('the target markup produces exactly the target margin', () => {
  const result = calculatePlacement(EXAMPLE);
  const atTarget = calculatePlacement({
    ...EXAMPLE,
    markupPercent: result.targetMarkupPercent,
  });
  near(atTarget.grossMarginPercent, EXAMPLE.targetMarginPercent, 0.0001);
});

test('a target margin the invoice cannot carry returns null rather than a fake number', () => {
  // 99.6% of the invoice claimed by bad debt plus the target leaves nothing.
  const result = calculatePlacement({ ...EXAMPLE, badDebtPercent: 10, targetMarginPercent: 95 });
  assert.equal(result.ok, true);
  assert.equal(result.targetMarkupPercent, null);
  assert.equal(
    markupForMargin({
      loadedCost: 100,
      billableHourEquivalents: 10,
      payRate: 10,
      badDebtFraction: 0.5,
      carryFraction: 0,
      marginFraction: 0.6,
    }),
    null,
  );
});

test('a short assignment carries a heavier per-hour unemployment charge', () => {
  const short = calculatePlacement({ ...EXAMPLE, weeksOnAssignment: 3 });
  const long = calculatePlacement({ ...EXAMPLE, weeksOnAssignment: 50 });

  const perHour = (r, key) => r.burden.items.find((i) => i.key === key).amount / r.hours.totalHours;
  assert.ok(
    perHour(short, 'futa') > perHour(long, 'futa') * 5,
    'a 3-week assignment should carry a far heavier per-hour FUTA charge than a 50-week one',
  );
  assert.ok(perHour(short, 'suta') > perHour(long, 'suta'));
  // And the tool says so in words, not only in the arithmetic.
  assert.ok(short.notes.some((n) => n.includes('wage base')));
  assert.ok(!long.notes.some((n) => n.includes('wage base')));
});

test('the capped taxes stop rising once the wage base is passed', () => {
  const base = { ...EXAMPLE, weeksOnAssignment: 50 };
  const a = calculatePlacement(base);
  const b = calculatePlacement({ ...base, weeksOnAssignment: 52 });
  const futa = (r) => r.burden.items.find((i) => i.key === 'futa').amount;
  const suta = (r) => r.burden.items.find((i) => i.key === 'suta').amount;
  // Both assignments pay past $7,000 and past $12,000, so both charges are flat.
  near(futa(a), futa(b), 0.0001);
  near(suta(a), suta(b), 0.0001);
  // FICA is uncapped here and keeps rising with the hours.
  assert.ok(b.burden.items.find((i) => i.key === 'fica').amount > a.burden.items.find((i) => i.key === 'fica').amount);
});

test("workers' comp excludes the overtime premium by default and includes it on request", () => {
  const withOt = { ...EXAMPLE, otHoursPerWeek: 10 };
  const excluded = calculatePlacement(withOt);
  const included = calculatePlacement({ ...withOt, compExcludesOtPremium: false });

  const comp = (r) => r.burden.items.find((i) => i.key === 'workersComp').amount;
  assert.ok(comp(included) > comp(excluded), 'including the premium must cost more');
  // The difference is exactly the comp rate applied to the premium wages.
  near(comp(included) - comp(excluded), (EXAMPLE.workersCompRate / 100) * excluded.wages.otPremiumWages);
  // And with no overtime there is nothing to exclude, so the flag is inert.
  const noOt = calculatePlacement(EXAMPLE);
  const noOtIncluded = calculatePlacement({ ...EXAMPLE, compExcludesOtPremium: false });
  near(comp(noOt), comp(noOtIncluded), 0.0001);
});

test('overtime billed below what it is paid is flagged and earns less', () => {
  const fair = calculatePlacement({ ...EXAMPLE, otHoursPerWeek: 10, otBillMultiplier: 1.5 });
  const underbilled = calculatePlacement({ ...EXAMPLE, otHoursPerWeek: 10, otBillMultiplier: 1 });

  assert.ok(underbilled.grossProfit < fair.grossProfit);
  assert.ok(underbilled.notes.some((n) => n.includes('lower multiple')));
  assert.ok(!fair.notes.some((n) => n.includes('lower multiple')));
});

test('slower payment costs real money and the carry is charged on the cost, not the invoice', () => {
  const fast = calculatePlacement({ ...EXAMPLE, daysToGetPaid: 0 });
  const slow = calculatePlacement({ ...EXAMPLE, daysToGetPaid: 90 });

  near(fast.carryCost, 0, 0.0001);
  assert.ok(slow.carryCost > 0);
  assert.ok(slow.grossProfit < fast.grossProfit);
  // 12% a year for 90 days on the loaded cost.
  near(slow.carryCost, slow.loadedCost * 0.12 * (90 / 365));
});

test('a loss-making markup is reported as a loss and said out loud', () => {
  const result = calculatePlacement({ ...EXAMPLE, markupPercent: 12 });
  assert.equal(result.ok, true);
  assert.ok(result.grossProfit < 0);
  assert.ok(result.grossMarginPercent < 0);
  assert.ok(result.notes.some((n) => n.includes('loses money')));
});

test('the markup ladder brackets the entered markup and rises monotonically', () => {
  const result = calculatePlacement(EXAMPLE);
  assert.ok(result.ladder.length >= 7);
  const entered = result.ladder.filter((rung) => rung.isEntered);
  assert.equal(entered.length, 1, 'exactly one rung is the entered markup');
  assert.equal(entered[0].markupPercent, 45);
  for (let i = 1; i < result.ladder.length; i += 1) {
    assert.ok(result.ladder[i].markupPercent > result.ladder[i - 1].markupPercent, 'sorted');
    assert.ok(result.ladder[i].grossProfit > result.ladder[i - 1].grossProfit, 'more markup earns more');
  }
  // A rung's margin agrees with a full recalculation at that markup.
  const rung = result.ladder.find((r) => r.markupPercent === 60);
  const full = calculatePlacement({ ...EXAMPLE, markupPercent: 60 });
  near(rung.grossMarginPercent, full.grossMarginPercent, 0.0001);
  near(rung.billRate, full.billRate, 0.0001);
});

test('an unusual entered markup still gets its own rung without duplicating one', () => {
  const result = calculatePlacement({ ...EXAMPLE, markupPercent: 38 });
  const markups = result.ladder.map((r) => r.markupPercent);
  assert.ok(markups.includes(38));
  assert.equal(new Set(markups).size, markups.length, 'no duplicate rungs');
  // An entered markup that lands on an existing rung must not create a second.
  const onRung = calculatePlacement({ ...EXAMPLE, markupPercent: 50 });
  const onRungMarkups = onRung.ladder.map((r) => r.markupPercent);
  assert.equal(new Set(onRungMarkups).size, onRungMarkups.length);
  assert.equal(onRung.ladder.filter((r) => r.isEntered).length, 1);
});

test('every input is validated and all problems are reported at once', () => {
  const result = calculatePlacement({ ...EXAMPLE, payRate: 0, sutaPercent: -4, ficaPercent: 'abc' });
  assert.equal(result.ok, false);
  const fields = result.errors.map((e) => e.field);
  assert.ok(fields.includes('payRate'));
  assert.ok(fields.includes('sutaPercent'));
  assert.ok(fields.includes('ficaPercent'));
  assert.equal(result.errors.length, 3, 'one error per bad field, not one per submit');
  for (const error of result.errors) {
    assert.match(error.message, /\S/);
    assert.ok(ALL_INPUT_IDS.includes(error.field), `${error.field} must be a real input id`);
  }
});

test('a missing field is an error rather than a silent zero', () => {
  const { payRate, ...withoutPayRate } = EXAMPLE;
  const result = calculatePlacement(withoutPayRate);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'payRate'));
});

test('an assignment with no hours at all is rejected', () => {
  const result = calculatePlacement({ ...EXAMPLE, hoursPerWeek: 0, otHoursPerWeek: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('at least some hours')));
});

test('more hours than a week holds is rejected', () => {
  const result = calculatePlacement({ ...EXAMPLE, hoursPerWeek: 120, otHoursPerWeek: 60 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('168')));
});

test('an overtime-only assignment is priced rather than refused', () => {
  const result = calculatePlacement({ ...EXAMPLE, hoursPerWeek: 0, otHoursPerWeek: 12 });
  assert.equal(result.ok, true);
  assert.equal(result.hours.straightHours, 0);
  assert.ok(result.hours.otHours > 0);
  assert.ok(Number.isFinite(result.grossMarginPercent));
});

test('burdenBreakdown itemises without dropping a component', () => {
  const breakdown = burdenBreakdown({
    straightWages: 1000,
    otWages: 0,
    otPremiumWages: 0,
    totalHours: 100,
    ficaPercent: 10,
    futaPercent: 1,
    futaWageBase: 500,
    sutaPercent: 2,
    sutaWageBase: 500,
    workersCompRate: 5,
    ptoPercent: 4,
    benefitsPerHour: 1,
    onboardingCost: 50,
    otherPerHour: 0.5,
  });
  // 100 + 5 + 10 + 50 + 40 + 100 + 50 + 50
  near(breakdown.total, 405);
  assert.equal(breakdown.items.length, 8);
  near(
    breakdown.items.reduce((sum, item) => sum + item.amount, 0),
    breakdown.total,
    0.0001,
  );
  for (const item of breakdown.items) {
    assert.match(item.label, /\S/, 'every line has a label a user can read');
    assert.ok(Number.isFinite(item.amount));
  }
});

test('every declared input id is actually read', () => {
  for (const field of ALL_INPUT_IDS) {
    const broken = { ...EXAMPLE, [field]: 'not a number' };
    const result = calculatePlacement(broken);
    assert.equal(result.ok, false, `${field} is declared but never validated`);
    assert.ok(result.errors.some((e) => e.field === field), `${field} produced no error`);
  }
});

test('the totals reconcile: revenue less every cost is the gross profit', () => {
  const result = calculatePlacement({ ...EXAMPLE, otHoursPerWeek: 6, ptoPercent: 4, benefitsPerHour: 1.1 });
  near(result.grossProfit, result.revenue - result.loadedCost - result.badDebt - result.carryCost, 0.0001);
  near(result.loadedCost, result.wages.totalWages + result.burden.total, 0.0001);
  near(result.loadedCostPerHour * result.hours.totalHours, result.loadedCost, 0.0001);
  near(result.burdenPerHour * result.hours.totalHours, result.burden.total, 0.0001);
  near(result.grossProfitPerHour * result.hours.totalHours, result.grossProfit, 0.0001);
});
