import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePourCost, costPerOz, notes, ALL_INPUT_IDS, REQUIRED_INGREDIENT_IDS } from './calc.mjs';

/** A well vodka soda: spirit and mixer, no modifier, priced at a common $9 well price. */
const BASE = {
  primaryBottleCost: 18,
  primaryBottleSizeOz: 59.2, // a 1.75L bottle
  primaryOzUsed: 1.5,
  modifierBottleCost: '',
  modifierBottleSizeOz: '',
  modifierOzUsed: '',
  mixerBottleCost: 4,
  mixerBottleSizeOz: 33.8, // a 1L soda water bottle
  mixerOzUsed: 4,
  menuPrice: 9,
  targetPourCostPercent: 20,
  drinksPerWeek: 250,
  overPourOzPerDrink: 0.25,
};

const near = (actual, expected, tolerance = 0.001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('costPerOz divides bottle cost by bottle size', () => {
  assert.equal(costPerOz(18, 59.2), 18 / 59.2);
  assert.equal(costPerOz(10, 10), 1);
});

test('a spirit-and-mixer recipe prices from both ingredients, not just the spirit', () => {
  const result = calculatePourCost(BASE);
  assert.equal(result.ok, true);

  const primaryCost = (18 / 59.2) * 1.5;
  const mixerCost = (4 / 33.8) * 4;
  near(result.recipeCost, primaryCost + mixerCost);
  assert.equal(result.ingredients.modifier, null);
  near(result.ingredients.mixer.cost, mixerCost);
});

test('pour cost percent is recipe cost over menu price, times 100', () => {
  const result = calculatePourCost(BASE);
  near(result.pourCostPercent, (result.recipeCost / 9) * 100);
  near(result.grossProfitPercent, 100 - result.pourCostPercent);
  near(result.grossProfitPerDrink, 9 - result.recipeCost);
});

test('a blank modifier is not used and is not an error', () => {
  const result = calculatePourCost(BASE);
  assert.equal(result.ok, true);
  assert.equal(result.ingredients.modifier, null);
});

test('a three-ingredient recipe (spirit, modifier, mixer) sums all three', () => {
  const result = calculatePourCost({
    ...BASE,
    modifierBottleCost: 22,
    modifierBottleSizeOz: 25.4,
    modifierOzUsed: 0.75,
  });
  assert.equal(result.ok, true);
  const primaryCost = (18 / 59.2) * 1.5;
  const modifierCost = (22 / 25.4) * 0.75;
  const mixerCost = (4 / 33.8) * 4;
  near(result.recipeCost, primaryCost + modifierCost + mixerCost);
  assert.ok(result.ingredients.modifier);
  near(result.ingredients.modifier.cost, modifierCost);
});

test('a partially filled optional ingredient is an error, not a skip', () => {
  // Typing a modifier cost but not its bottle size is a form left half-done,
  // not a decision to skip the modifier — leaving it out silently would price
  // a recipe that is missing an ingredient.
  const result = calculatePourCost({ ...BASE, modifierBottleCost: 22 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.id === 'modifierBottleSizeOz'));
  assert.ok(result.errors.some(e => e.id === 'modifierOzUsed'));
  assert.match(result.errors[0].message, /leave all three blank to skip/);
});

test('a primary ingredient field is required, never optional', () => {
  for (const id of REQUIRED_INGREDIENT_IDS) {
    const result = calculatePourCost({ ...BASE, [id]: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.id === id));
  }
});

test('the target price is what this exact recipe would need to sell for to hit the target', () => {
  const result = calculatePourCost(BASE);
  near(result.targetMenuPrice, result.recipeCost / 0.2);
  near(result.priceGapVsTarget, result.menuPrice - result.targetMenuPrice);
});

test('a recipe priced right at the target is read as on-target within tolerance', () => {
  const result = calculatePourCost(BASE);
  const onTargetPrice = result.recipeCost / (result.targetPourCostPercent / 100);
  const atTarget = calculatePourCost({ ...BASE, menuPrice: onTargetPrice });
  assert.equal(atTarget.onTarget, true);
  near(atTarget.pourCostPercent, result.targetPourCostPercent, 1e-6);
});

test('a recipe priced well above target pour cost is flagged, not silently accepted', () => {
  const result = calculatePourCost({ ...BASE, menuPrice: 3 });
  assert.equal(result.onTarget, false);
  assert.ok(result.pourCostPercent > result.targetPourCostPercent);
});

test('the over-pour cost is the extra ounces at the primary spirit cost per ounce', () => {
  const result = calculatePourCost(BASE);
  const primaryCostPerOz = 18 / 59.2;
  near(result.overPourCostPerDrink, 0.25 * primaryCostPerOz);
  near(result.pourCostPercentWithOverpour, ((result.recipeCost + result.overPourCostPerDrink) / 9) * 100);
  assert.ok(result.pourCostPercentWithOverpour > result.pourCostPercent);
});

test('the annual over-pour cost multiplies the weekly figure by 52 weeks', () => {
  const result = calculatePourCost(BASE);
  near(result.overPourCostPerWeek, result.overPourCostPerDrink * 250);
  near(result.overPourCostPerYear, result.overPourCostPerWeek * 52);
});

test('zero drinks a week means zero over-pour cost, not an error', () => {
  const result = calculatePourCost({ ...BASE, drinksPerWeek: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.overPourCostPerWeek, 0);
  assert.equal(result.overPourCostPerYear, 0);
});

test('zero over-pour ounces means zero over-pour cost, and pour cost is unchanged', () => {
  const result = calculatePourCost({ ...BASE, overPourOzPerDrink: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.overPourCostPerDrink, 0);
  near(result.pourCostPercentWithOverpour, result.pourCostPercent);
});

test('annual revenue, cost, and gross profit close over the recipe alone', () => {
  const result = calculatePourCost(BASE);
  near(result.annualRecipeRevenue, 9 * 250 * 52);
  near(result.annualRecipeCost, result.recipeCost * 250 * 52);
  near(result.annualGrossProfit, result.annualRecipeRevenue - result.annualRecipeCost);
});

test('a blank required field is an error, never a zero', () => {
  const result = calculatePourCost({ ...BASE, menuPrice: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'menuPrice');
  assert.match(result.errors[0].message, /needed/);
});

test('a non-numeric entry is refused rather than coerced', () => {
  const result = calculatePourCost({ ...BASE, drinksPerWeek: 'about a lot' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'drinksPerWeek');
});

test('every error is reported at once, so the form is fixed in one pass', () => {
  const result = calculatePourCost({ ...BASE, primaryBottleCost: '', menuPrice: '', targetPourCostPercent: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map(e => e.id).sort(),
    ['menuPrice', 'primaryBottleCost', 'targetPourCostPercent'],
  );
});

test('a menu price of zero is refused rather than dividing by zero', () => {
  const result = calculatePourCost({ ...BASE, menuPrice: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'menuPrice');
});

test('a recipe costing at or above the menu price is called out, not left implicit', () => {
  const result = calculatePourCost({ ...BASE, menuPrice: 0.5 });
  assert.equal(result.ok, true);
  assert.ok(result.recipeCost >= result.menuPrice);
  assert.match(notes(result).join(' '), /no gross profit left/);
});

test('nothing is returned for a missing input object', () => {
  const result = calculatePourCost();
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('every input id the arithmetic reads is accounted for', () => {
  // Sanity check on the module's own exported shape, so a page that reads
  // ALL_INPUT_IDS never silently drops a field this module expects.
  assert.ok(ALL_INPUT_IDS.includes('primaryBottleCost'));
  assert.ok(ALL_INPUT_IDS.includes('overPourOzPerDrink'));
  assert.equal(new Set(ALL_INPUT_IDS).size, ALL_INPUT_IDS.length, 'no duplicate field ids');
});

test('the over-pour note names the exact dollar figures it computes', () => {
  const result = calculatePourCost(BASE);
  const text = notes(result).join(' ');
  assert.ok(text.includes(`$${result.overPourCostPerWeek.toFixed(2)}`), text);
  assert.ok(text.includes(`$${Math.round(result.overPourCostPerYear).toLocaleString('en-US')}`), text);
});
