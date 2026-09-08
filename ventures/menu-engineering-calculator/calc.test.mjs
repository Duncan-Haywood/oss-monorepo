import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMenu, notes, POPULARITY_FACTOR, MAX_ITEMS, CLASSES } from './calc.mjs';

/**
 * A four-item menu built so that each item lands in a different quadrant, and
 * so the arithmetic is checkable by hand:
 *
 *   total covers 1000, total revenue $16,000, total food cost $5,100,
 *   total contribution margin $10,900, average CM $10.90 a cover.
 *   Equal share is 25%, so the popularity bar is 25 * 0.7 = 17.5%.
 *
 *   burger  500 covers (50.0%, popular)   CM $14 - $5   = $9.00  -> below avg -> plowhorse
 *   steak   100 covers (10.0%, not)       CM $34 - $14  = $20.00 -> above avg -> puzzle
 *   salad   300 covers (30.0%, popular)   CM $16 - $3   = $13.00 -> above avg -> star
 *   soup    100 covers (10.0%, not)       CM $8  - $3   = $5.00  -> below avg -> dog
 */
const MENU = {
  items: [
    { name: 'Burger', unitsSold: 500, foodCost: 5, menuPrice: 14 },
    { name: 'Steak', unitsSold: 100, foodCost: 14, menuPrice: 34 },
    { name: 'Salad', unitsSold: 300, foodCost: 3, menuPrice: 16 },
    { name: 'Soup', unitsSold: 100, foodCost: 3, menuPrice: 8 },
  ],
  periodWeeks: 4,
  targetFoodCostPercent: 30,
  priceIncrease: 1,
};

const bySlug = (result, name) => result.items.find(item => item.name === name);

test('the menu totals are the sum of the item lines', () => {
  const r = calculateMenu(MENU);
  assert.equal(r.ok, true);
  assert.equal(r.totalUnits, 1000);
  assert.ok(Math.abs(r.totalRevenue - 16_000) < 1e-9);
  assert.ok(Math.abs(r.totalFoodCost - 5_100) < 1e-9);
  assert.ok(Math.abs(r.totalContributionMargin - 10_900) < 1e-9);
});

test('the contribution-margin bar is weighted by covers, not an average of the items', () => {
  const r = calculateMenu(MENU);
  // Weighted: 10,900 / 1,000 = 10.90. The unweighted mean of the four item
  // margins is (9 + 20 + 13 + 5) / 4 = 11.75 — a bar the salad's $13 still
  // clears but by less than half as much, set by two items that between them
  // sold a fifth of the covers. This is the distinction the file is about.
  assert.ok(Math.abs(r.averageContributionMargin - 10.9) < 1e-9);
  const unweighted = (9 + 20 + 13 + 5) / 4;
  assert.notEqual(r.averageContributionMargin, unweighted);
});

test('the popularity bar is 70% of an equal share of the menu', () => {
  const r = calculateMenu(MENU);
  assert.ok(Math.abs(r.popularityThresholdPercent - (100 / 4) * POPULARITY_FACTOR) < 1e-9);
  assert.ok(Math.abs(r.popularityThresholdPercent - 17.5) < 1e-9);
});

test('each quadrant gets the item the hand-worked example puts there', () => {
  const r = calculateMenu(MENU);
  assert.equal(bySlug(r, 'Burger').classification, 'plowhorse');
  assert.equal(bySlug(r, 'Steak').classification, 'puzzle');
  assert.equal(bySlug(r, 'Salad').classification, 'star');
  assert.equal(bySlug(r, 'Soup').classification, 'dog');
  assert.deepEqual(r.counts, { star: 1, plowhorse: 1, puzzle: 1, dog: 1 });
});

test('a plate with a lower food cost percentage can still be the weaker contributor', () => {
  const r = calculateMenu(MENU);
  const burger = bySlug(r, 'Burger');
  const steak = bySlug(r, 'Steak');
  // The burger runs a far better food cost percentage and contributes $11 a
  // plate less. Ranking this menu by percentage inverts the two.
  assert.ok(burger.foodCostPercent < steak.foodCostPercent);
  assert.ok(burger.contributionMargin < steak.contributionMargin);
});

test('menu mix percentages are each item’s share of covers and total 100', () => {
  const r = calculateMenu(MENU);
  assert.ok(Math.abs(bySlug(r, 'Burger').menuMixPercent - 50) < 1e-9);
  const total = r.items.reduce((sum, item) => sum + item.menuMixPercent, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('the price move is sized on plowhorse covers only, and annualises by the period', () => {
  const r = calculateMenu(MENU);
  // Only the burger is a plowhorse: 500 covers x $1.
  assert.equal(r.plowhorseUnits, 500);
  assert.ok(Math.abs(r.priceMoveGainPerPeriod - 500) < 1e-9);
  // Four weeks reported, so the year is 13 such periods.
  assert.ok(Math.abs(r.annualFactor - 13) < 1e-9);
  assert.ok(Math.abs(r.priceMoveGainPerYear - 6_500) < 1e-9);
});

test('a zero price increase sizes no gain but still classifies the menu', () => {
  const r = calculateMenu({ ...MENU, priceIncrease: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.priceMoveGainPerYear, 0);
  assert.equal(r.counts.plowhorse, 1);
});

test('overall food cost percentage is measured against the target', () => {
  const r = calculateMenu(MENU);
  // 5,100 / 16,000 = 31.875%
  assert.ok(Math.abs(r.overallFoodCostPercent - 31.875) < 1e-9);
  assert.ok(Math.abs(r.foodCostGapPoints - (r.overallFoodCostPercent - 30)) < 1e-9);
});

test('blank rows are skipped rather than counted as items', () => {
  const r = calculateMenu({
    ...MENU,
    items: [...MENU.items, { name: '', unitsSold: '', foodCost: '', menuPrice: '' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.itemCount, 4);
  // The popularity bar must come from the four real items, not five rows.
  assert.ok(Math.abs(r.popularityThresholdPercent - 17.5) < 1e-9);
});

test('a half-filled row is an error against that row, not a silent drop', () => {
  const r = calculateMenu({
    ...MENU,
    items: [...MENU.items, { name: 'Special', unitsSold: '40', foodCost: '', menuPrice: '' }],
  });
  assert.equal(r.ok, false);
  const ids = r.errors.map(e => e.id);
  assert.ok(ids.includes('item4_foodCost'));
  assert.ok(ids.includes('item4_menuPrice'));
  // The error names the row the operator can see, so it is findable on a long menu.
  assert.ok(r.errors.some(e => e.message.includes('Special')));
});

test('a row with numbers but no name still computes, under a fallback label', () => {
  const r = calculateMenu({
    items: [
      { name: '', unitsSold: 10, foodCost: 2, menuPrice: 9 },
      { name: 'Named', unitsSold: 10, foodCost: 2, menuPrice: 9 },
    ],
    periodWeeks: 1,
    targetFoodCostPercent: 30,
    priceIncrease: 0,
  });
  assert.equal(r.ok, true);
  assert.equal(r.items[0].name, 'Item 1');
});

test('one item alone is refused, because a matrix has nothing to compare it to', () => {
  const r = calculateMenu({ ...MENU, items: [MENU.items[0]] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.id === 'items'));
});

test('a menu where nothing sold is refused rather than dividing by zero', () => {
  const r = calculateMenu({
    ...MENU,
    items: MENU.items.map(item => ({ ...item, unitsSold: 0 })),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.message.includes('units-sold')));
  assert.ok(r.errors.every(e => Number.isFinite(0)));
});

test('a free item is refused on price, since a menu price of zero has no mix to read', () => {
  const r = calculateMenu({
    ...MENU,
    items: [{ ...MENU.items[0], menuPrice: 0 }, ...MENU.items.slice(1)],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.id === 'item0_menuPrice'));
});

test('an item costing more to plate than it sells for is flagged, not rejected', () => {
  const r = calculateMenu({
    ...MENU,
    items: [{ name: 'Lobster', unitsSold: 20, foodCost: 30, menuPrice: 28 }, ...MENU.items.slice(1)],
  });
  assert.equal(r.ok, true);
  assert.equal(bySlug(r, 'Lobster').losesMoney, true);
  assert.ok(bySlug(r, 'Lobster').contributionMargin < 0);
  assert.ok(r.notes.some(note => note.includes('Lobster')));
});

test('rows beyond the cap are ignored rather than silently changing the thresholds', () => {
  const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({
    name: `Item ${i + 1}`, unitsSold: 10, foodCost: 2, menuPrice: 9,
  }));
  const r = calculateMenu({ ...MENU, items: many });
  assert.equal(r.ok, true);
  assert.equal(r.itemCount, MAX_ITEMS);
});

test('every item lands in exactly one of the four quadrants', () => {
  const r = calculateMenu(MENU);
  const counted = CLASSES.reduce((sum, name) => sum + r.byClass[name].length, 0);
  assert.equal(counted, r.itemCount);
  for (const item of r.items) assert.ok(CLASSES.includes(item.classification));
});

test('an out-of-range period or target is reported rather than computed', () => {
  assert.equal(calculateMenu({ ...MENU, periodWeeks: 0 }).ok, false);
  assert.equal(calculateMenu({ ...MENU, targetFoodCostPercent: 0 }).ok, false);
  assert.equal(calculateMenu({ ...MENU, targetFoodCostPercent: 100 }).ok, false);
  assert.equal(calculateMenu({ ...MENU, priceIncrease: -1 }).ok, false);
});

test('a missing period is asked for rather than assumed', () => {
  const r = calculateMenu({ ...MENU, periodWeeks: '' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.id === 'periodWeeks'));
});

test('notes size the plowhorse move and name the assumption behind it', () => {
  const r = calculateMenu(MENU);
  const note = r.notes.find(text => text.includes('Burger'));
  assert.ok(note, 'expected a note naming the highest-volume plowhorse');
  assert.ok(note.includes('$6,500'), 'expected the annualised figure in the note');
  // The number is worthless without the assumption, so the assumption ships
  // in the same sentence rather than in small print elsewhere.
  assert.ok(note.includes('same number of people order them'));
});

test('notes never tell the operator what to do', () => {
  const r = calculateMenu(MENU);
  const text = r.notes.join(' ').toLowerCase();
  for (const imperative of ['you should', 'raise the price', 'cut the', 'we recommend', 'you must']) {
    assert.ok(!text.includes(imperative), `notes must not advise: found "${imperative}"`);
  }
});

test('notes are derived, so calling notes() on a result reproduces them', () => {
  const r = calculateMenu(MENU);
  assert.deepEqual(notes(r), r.notes);
});

test('a menu whose items all tie classifies them all as stars and says the bars are relative', () => {
  const r = calculateMenu({
    ...MENU,
    items: [
      { name: 'A', unitsSold: 10, foodCost: 3, menuPrice: 12 },
      { name: 'B', unitsSold: 10, foodCost: 3, menuPrice: 12 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.counts.star, 2);
  assert.ok(r.notes.some(note => note.includes('relative to this menu')));
});

test('errors carry a field id the page can highlight', () => {
  const r = calculateMenu({ ...MENU, items: [{ name: 'X', unitsSold: 'abc', foodCost: 2, menuPrice: 9 }, MENU.items[1]] });
  assert.equal(r.ok, false);
  for (const error of r.errors) {
    assert.ok(typeof error.id === 'string' && error.id.length > 0);
    assert.ok(typeof error.message === 'string' && error.message.length > 0);
  }
});

test('a negative figure in a note carries its minus sign outside the dollar symbol', () => {
  // A loss-making plate is exactly the case an operator most needs to read
  // correctly, and `$9.24` for a $9.24 loss is worse than no number at all.
  const r = calculateMenu({
    ...MENU,
    items: [
      { name: 'Lobster', unitsSold: 900, foodCost: 30, menuPrice: 28 },
      { name: 'Soda', unitsSold: 100, foodCost: 0.3, menuPrice: 3 },
    ],
  });
  assert.equal(r.ok, true);
  assert.ok(r.averageContributionMargin < 0, 'this menu should average a negative margin');
  const text = r.notes.join(' ');
  assert.ok(!/\$-/.test(text), `a sign is inside the currency symbol: ${text}`);
});
