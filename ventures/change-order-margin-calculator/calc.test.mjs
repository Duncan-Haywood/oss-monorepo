import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateChangeOrder, summaryText } from './calc.mjs';

test('loads labor, direct costs, overhead, and target margin correctly', () => {
  const result = calculateChangeOrder({ hours: 10, wage: 20, burdenPercent: 25, materials: 100, subcontractor: 50, overheadPercent: 10, targetMarginPercent: 20 });
  assert.equal(result.loadedLabor, 250);
  assert.equal(result.walkAwayPrice, 440);
  assert.equal(result.targetPrice, 550);
});

test('flags a proposed price below the cost floor', () => {
  const result = calculateChangeOrder({ hours: 8, wage: 25, proposedPrice: 100 });
  assert.equal(result.belowCost, true);
  assert.equal(result.targetMet, false);
});

test('summary is proposal-ready and contains no hidden input data', () => {
  const input = { title: 'Extra outlets', hours: 2, wage: 30, proposedPrice: 100 };
  const text = summaryText(input, calculateChangeOrder(input));
  assert.match(text, /Extra outlets/);
  assert.match(text, /Target change-order price/);
});

test('summary reports the direct cost, not a second copy of the walk-away price', () => {
  // Regression test: the "Estimated added cost" line used to print
  // result.walkAwayPrice a second time under a different label, so the
  // customer-facing summary silently omitted the actual direct cost
  // (labor + materials + subcontractor, before overhead markup) and
  // instead showed the walk-away price twice.
  const input = { hours: 10, wage: 20, burdenPercent: 25, materials: 100, subcontractor: 50, overheadPercent: 10, targetMarginPercent: 20 };
  const result = calculateChangeOrder(input);
  assert.equal(result.directCost, 400);
  assert.equal(result.walkAwayPrice, 440);
  assert.notEqual(result.directCost, result.walkAwayPrice);
  const text = summaryText(input, result);
  assert.match(text, /Estimated added cost \(labor, materials, subcontractor, schedule\): \$400\.00/);
  assert.match(text, /Walk-away price \(added cost \+ overhead\): \$440\.00/);
});

test('treats non-finite and negative numeric input as zero', () => {
  const result = calculateChangeOrder({
    hours: 'Infinity',
    wage: -40,
    materials: 'not a number',
    targetMarginPercent: 'NaN',
  });
  assert.equal(result.loadedLabor, 0);
  assert.equal(result.walkAwayPrice, 0);
  assert.equal(result.targetPrice, 0);
});

// The scenario the page ships with and how-to-price-a-change-order.html works
// through: $280 loaded labor, $350 materials, $630 direct, $63 overhead,
// $693 walk-away, $866.25 target.
const DEFAULTS = { hours: 8, wage: 28, burdenPercent: 25, materials: 350, subcontractor: 0, overheadPercent: 10, targetMarginPercent: 20 };

test('the schedule and cap fields are neutral at their defaults', () => {
  const result = calculateChangeOrder(DEFAULTS);
  assert.equal(result.delayCost, 0);
  assert.equal(result.directCost, 630);
  assert.equal(result.walkAwayPrice, 693);
  assert.equal(result.targetPrice, 866.25);
  assert.equal(result.cappedPrice, null, 'no cap entered means no cap applied');
  assert.equal(result.marginAtCap, null);
  assert.equal(result.capBlocksTarget, false);
  assert.equal(result.capBelowCost, false);
});

test('extended general conditions are a direct cost, so overhead and margin carry on them', () => {
  const result = calculateChangeOrder({ ...DEFAULTS, daysAdded: 3, dailyGeneralConditions: 450 });
  assert.equal(result.delayCost, 1350);
  assert.equal(result.directCost, 1980, 'the delay more than doubles a $630 change order');
  assert.equal(result.walkAwayPrice, 2178);
  assert.equal(result.targetPrice, 2722.5);
});

test('a markup cap equal to the overhead rate leaves exactly nothing', () => {
  // The case the field exists for: 10% cap on cost, 10% overhead out of the
  // same allowance. The contractor is working the change order for free and
  // the target margin is unreachable.
  const result = calculateChangeOrder({ ...DEFAULTS, markupCapPercent: 10 });
  assert.equal(result.cappedPrice, 693);
  assert.equal(result.marginAtCap, 0);
  assert.equal(result.capBlocksTarget, true);
  assert.equal(result.capBelowCost, false, 'break-even is not below cost');
});

test('a cap under the overhead rate makes every change order a loss', () => {
  const result = calculateChangeOrder({ ...DEFAULTS, markupCapPercent: 5 });
  assert.equal(result.cappedPrice, 661.5);
  assert.ok(result.marginAtCap < 0, `expected a negative margin, got ${result.marginAtCap}`);
  assert.equal(result.capBelowCost, true);
});

test('a cap generous enough to clear the target does not flag', () => {
  const result = calculateChangeOrder({ ...DEFAULTS, markupCapPercent: 50 });
  assert.equal(result.cappedPrice, 945);
  assert.equal(result.capBlocksTarget, false, '$945 clears the $866.25 target');
  assert.equal(result.capBelowCost, false);
});

test('the summary carries delay and cap lines only when they apply', () => {
  const plain = summaryText({}, calculateChangeOrder(DEFAULTS));
  assert.doesNotMatch(plain, /Extended general conditions/);
  assert.doesNotMatch(plain, /Contract markup cap/);

  const full = summaryText({ title: 'Add two circuits' }, calculateChangeOrder({ ...DEFAULTS, daysAdded: 3, dailyGeneralConditions: 450, markupCapPercent: 15 }));
  assert.match(full, /Extended general conditions: 3 day\(s\) at \$450\.00\/day = \$1350\.00/);
  assert.match(full, /Contract markup cap 15%: most billable is \$2277\.00, leaving 4\.3% after overhead/);
});
