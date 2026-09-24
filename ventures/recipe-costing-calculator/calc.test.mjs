import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecipe, epCostPerUnit, INGREDIENT_COUNT, INPUT_IDS, TEXT_IDS } from './calc.mjs';

test('epCostPerUnit: a 75% yield raises the effective cost per unit', () => {
  const cost = epCostPerUnit(3.5, 75);
  assert.ok(Math.abs(cost - 3.5 / 0.75) < 1e-9);
  assert.ok(cost > 3.5);
});

test('epCostPerUnit: a 100% yield leaves the cost unchanged', () => {
  assert.ok(Math.abs(epCostPerUnit(2, 100) - 2) < 1e-9);
});

test('epCostPerUnit: a yield over 100% lowers the effective cost per unit', () => {
  const cost = epCostPerUnit(1, 250);
  assert.ok(Math.abs(cost - 0.4) < 1e-9);
  assert.ok(cost < 1);
});

test('epCostPerUnit: a zero or negative yield is undefined, not a divide-by-zero result', () => {
  assert.equal(epCostPerUnit(3, 0), null);
  assert.equal(epCostPerUnit(3, -5), null);
});

test('calculateRecipe rejects a missing portions count', () => {
  const result = calculateRecipe({});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.id === 'portions'));
});

test('calculateRecipe: one ingredient, no yield loss, matches hand arithmetic', () => {
  const result = calculateRecipe({ portions: '4', ing1ApCost: '8', ing1Yield: '100', ing1Qty: '2' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.ingredientsCost - 16) < 1e-9);
  assert.ok(Math.abs(result.plateCost - 4) < 1e-9);
});

test('calculateRecipe: yield loss raises the line cost proportionally', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '10', ing1Yield: '50', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.lines[0].unitCost - 20) < 1e-9);
  assert.ok(Math.abs(result.ingredientsCost - 20) < 1e-9);
});

test('calculateRecipe: a blank yield defaults to 100%, not zero', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '5', ing1Qty: '2' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.lines[0].unitCost - 5) < 1e-9);
});

test('calculateRecipe: multiple ingredients sum, plus a flat per-batch cost', () => {
  const result = calculateRecipe({
    portions: '10',
    otherCost: '5',
    ing1ApCost: '4', ing1Yield: '100', ing1Qty: '3',
    ing2ApCost: '6', ing2Yield: '80', ing2Qty: '2',
  });
  assert.equal(result.ok, true);
  const expectedIngredients = 4 * 3 + (6 / 0.8) * 2;
  assert.ok(Math.abs(result.ingredientsCost - expectedIngredients) < 1e-9);
  assert.ok(Math.abs(result.totalRecipeCost - (expectedIngredients + 5)) < 1e-9);
  assert.ok(Math.abs(result.plateCost - (expectedIngredients + 5) / 10) < 1e-9);
});

test('calculateRecipe: an unused ingredient row (no price, no quantity) contributes nothing', () => {
  const result = calculateRecipe({ portions: '2', ing1ApCost: '10', ing1Yield: '100', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.equal(result.lines[1].used, false);
  assert.equal(result.lines[1].lineCost, 0);
});

test('calculateRecipe: suggested price solves back to the target food-cost percentage', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '6', ing1Qty: '1', targetFoodCostPct: '30' });
  assert.equal(result.ok, true);
  const impliedPct = (result.plateCost / result.suggestedPrice) * 100;
  assert.ok(Math.abs(impliedPct - 30) < 1e-9);
});

test('calculateRecipe: a missing target food-cost percentage defaults to 30%', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '3', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.targetFoodCostPct - 30) < 1e-9);
});

test('calculateRecipe: actual food-cost percentage compares the plate cost to a supplied current price', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '5', ing1Qty: '1', currentPrice: '20' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.actualFoodCostPct - 25) < 1e-9);
});

test('calculateRecipe: no current price leaves actual food-cost percentage null rather than zero', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '5', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.equal(result.actualFoodCostPct, null);
});

test('calculateRecipe notes a yield over 100% rather than flagging it as an error', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '2', ing1Yield: '150', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.ok(result.notes.some((n) => n.includes('gains weight')));
});

test('calculateRecipe notes the gap between actual and target food-cost percentage when it is material', () => {
  const result = calculateRecipe({ portions: '1', ing1ApCost: '15', ing1Qty: '1', currentPrice: '20', targetFoodCostPct: '30' });
  assert.equal(result.ok, true);
  assert.ok(result.notes.some((n) => n.includes('above your 30.0% target')));
});

test('an ingredient name is carried through for display and trimmed', () => {
  const result = calculateRecipe({ portions: '1', ing1Name: '  Chicken breast  ', ing1ApCost: '4', ing1Qty: '1' });
  assert.equal(result.ok, true);
  assert.equal(result.lines[0].name, 'Chicken breast');
});

test('a blank ingredient name falls back to a numbered placeholder', () => {
  const result = calculateRecipe({ portions: '1' });
  assert.equal(result.ok, true);
  assert.equal(result.lines[2].name, 'Ingredient 3');
});

test('INPUT_IDS and TEXT_IDS cover every ingredient row', () => {
  for (let i = 1; i <= INGREDIENT_COUNT; i += 1) {
    assert.ok(INPUT_IDS.includes(`ing${i}ApCost`));
    assert.ok(INPUT_IDS.includes(`ing${i}Yield`));
    assert.ok(INPUT_IDS.includes(`ing${i}Qty`));
    assert.ok(TEXT_IDS.includes(`ing${i}Name`));
  }
});
