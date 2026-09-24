// Pure arithmetic for recipe costing: as-purchased (AP) price -> edible-portion
// (EP) cost via a trim/cook yield percentage, rolled up across a short
// ingredient list into a total recipe cost, a per-portion plate cost, and the
// menu price needed to hit a target food-cost percentage.
//
// The one piece of domain math this tool exists to make automatic:
//
//   EP cost per unit = AP cost per unit / (yield % / 100)
//
// A pound of raw chicken breast at $3.50/lb with a 75% trim yield does not
// cost $3.50/lb once it is on the plate -- it costs $3.50 / 0.75 = $4.67/lb,
// because a quarter of what was bought never makes it to a portion. Skipping
// this step is the single most common way a recipe's "ingredient cost" on a
// spreadsheet understates what a dish actually costs, because the AP price on
// an invoice is the number closest at hand and the yield loss is invisible
// until someone weighs the trim.
//
// Yield can exceed 100%: dried beans, rice, and stocks gain weight as they
// absorb liquid, so their edible-portion weight is *more* than what was
// purchased dry. The formula is unchanged; only the direction of the
// adjustment flips.

export const INGREDIENT_COUNT = 5;

export const INGREDIENT_IDS = Array.from({ length: INGREDIENT_COUNT }, (_, i) => i + 1);

export const TEXT_IDS = Object.freeze(INGREDIENT_IDS.map((i) => `ing${i}Name`));

export const INPUT_IDS = Object.freeze([
  'portions',
  'otherCost',
  'currentPrice',
  'targetFoodCostPct',
  ...INGREDIENT_IDS.flatMap((i) => [`ing${i}ApCost`, `ing${i}Yield`, `ing${i}Qty`]),
]);

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function number(value, name, { min = 0, max = Infinity, allowBlank = false, blankValue = 0 } = {}) {
  if (isBlank(value)) {
    if (allowBlank) return blankValue;
    throw new Error(`${name} is required`);
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

/** AP price per unit, adjusted for a trim/cook yield percentage. */
export function epCostPerUnit(apCost, yieldPct) {
  if (!Number.isFinite(apCost) || !Number.isFinite(yieldPct) || yieldPct <= 0) return null;
  return apCost / (yieldPct / 100);
}

/**
 * One recipe, costed ingredient by ingredient.
 *
 * @param {object} input
 * @param {number} input.portions            Portions the batch yields. Required, at least 1.
 * @param {number} [input.otherCost]         Flat per-batch add: garnish, sauce, disposable packaging.
 * @param {number} [input.currentPrice]      Current menu price, to show today's actual food-cost %.
 * @param {number} input.targetFoodCostPct   Target food-cost percentage, used to solve a menu price.
 * @param {number} [input.ing{N}ApCost]      As-purchased price per unit for ingredient N.
 * @param {number} [input.ing{N}Yield]       Edible-portion yield percentage for ingredient N (default 100, no loss).
 * @param {number} [input.ing{N}Qty]         Edible-portion quantity of ingredient N used in the recipe.
 */
export function calculateRecipe(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const portions = read('portions', 'Portions this batch yields', { min: 1 });
  const otherCost = read('otherCost', 'Other per-batch cost', { allowBlank: true });
  const currentPrice = read('currentPrice', 'Current menu price', { allowBlank: true });
  const targetFoodCostPct = read('targetFoodCostPct', 'Target food-cost percentage', { min: 0.1, max: 100, allowBlank: true, blankValue: 30 });

  const lines = [];
  for (const i of INGREDIENT_IDS) {
    const apCost = read(`ing${i}ApCost`, `Ingredient ${i} as-purchased price`, { allowBlank: true });
    const yieldPct = read(`ing${i}Yield`, `Ingredient ${i} yield %`, { min: 1, max: 500, allowBlank: true, blankValue: 100 });
    const qty = read(`ing${i}Qty`, `Ingredient ${i} quantity used`, { allowBlank: true });
    const used = apCost > 0 || qty > 0;
    const unitCost = used ? epCostPerUnit(apCost, yieldPct) : null;
    const lineCost = used && unitCost !== null ? unitCost * qty : 0;
    lines.push({
      index: i,
      name: (input[`ing${i}Name`] ?? '').toString().trim() || `Ingredient ${i}`,
      used,
      apCost,
      yieldPct,
      qty,
      unitCost,
      lineCost,
    });
  }

  if (errors.length) return { ok: false, errors };

  const ingredientsCost = lines.reduce((sum, line) => sum + line.lineCost, 0);
  const totalRecipeCost = ingredientsCost + otherCost;
  const plateCost = totalRecipeCost / portions;
  const actualFoodCostPct = currentPrice > 0 ? (plateCost / currentPrice) * 100 : null;
  const suggestedPrice = targetFoodCostPct > 0 ? plateCost / (targetFoodCostPct / 100) : null;
  const marginAtSuggested = suggestedPrice !== null ? suggestedPrice - plateCost : null;

  const usedLines = lines.filter((l) => l.used);
  const highYieldLines = usedLines.filter((l) => l.yieldPct > 100);

  const notes = [];
  if (usedLines.length === 0) {
    notes.push('No ingredient rows have a price or quantity yet — the plate cost below is just the per-batch cost divided by portions.');
  }
  if (highYieldLines.length > 0) {
    notes.push(
      `${highYieldLines.length === 1 ? 'One ingredient has' : `${highYieldLines.length} ingredients have`} a yield over 100% — that is expected for something that gains weight when prepped (dried beans, rice, stocks), not an error.`,
    );
  }
  if (actualFoodCostPct !== null && Math.abs(actualFoodCostPct - targetFoodCostPct) >= 0.5) {
    notes.push(
      actualFoodCostPct > targetFoodCostPct
        ? `At the current menu price, this dish's food cost runs ${(actualFoodCostPct - targetFoodCostPct).toFixed(1)} points above your ${targetFoodCostPct.toFixed(1)}% target.`
        : `At the current menu price, this dish's food cost runs ${(targetFoodCostPct - actualFoodCostPct).toFixed(1)} points below your ${targetFoodCostPct.toFixed(1)}% target.`,
    );
  }

  return {
    ok: true,
    errors: [],
    portions,
    otherCost,
    currentPrice,
    targetFoodCostPct,
    lines,
    ingredientsCost,
    totalRecipeCost,
    plateCost,
    actualFoodCostPct,
    suggestedPrice,
    marginAtSuggested,
    notes,
  };
}
