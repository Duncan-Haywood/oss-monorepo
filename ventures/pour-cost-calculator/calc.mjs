/**
 * Pour cost per drink, and what an over-pour is actually costing a bar.
 *
 * "Pour cost" (also called liquor cost or beverage cost percentage) is the
 * standard way a bar or restaurant beverage program prices a drink: the cost
 * of the ingredients in a drink, divided by the price it sells for. Bars
 * generally price a cocktail so that number lands in a target range —
 * commonly 18-24% for spirits — because the rest of the price has to cover
 * rent, payroll, breakage, and everything else a bar spends money on that a
 * bottle invoice does not show.
 *
 * Two numbers usually get asked for and rarely get computed:
 *
 * **The pour cost of a specific recipe**, worked forward from what the
 * bottles actually cost per ounce rather than guessed from the menu price.
 * A well vodka bought at a different price, or a recipe that pours 0.25oz
 * more than the last one, moves the real number without moving the price on
 * the menu — this is the arithmetic that shows that drift.
 *
 * **What an over-pour is actually costing across a week's worth of drinks.**
 * A bartender free-pouring 0.25oz over a 1.5oz recipe on every well drink
 * looks generous rather than expensive on any single ticket. Multiplied by
 * the ounces poured a shift, a week, and a year, it is real, recoverable
 * money — and nothing about a single ticket makes that visible.
 *
 * Nothing here is an opinion about what to charge, what a bartender should
 * be told, or how to run a beverage program. It is the arithmetic on the
 * bottle costs, pour sizes, and drink counts a bar already has.
 */

/** Every ingredient slot the form can price, in the order the page presents them. */
export const INGREDIENT_KEYS = Object.freeze(['primary', 'modifier', 'mixer']);

/** The primary spirit is the only ingredient a recipe must have. */
export const REQUIRED_INGREDIENT_IDS = Object.freeze([
  'primaryBottleCost',
  'primaryBottleSizeOz',
  'primaryOzUsed',
]);

/**
 * Modifier and mixer are optional recipe lines — a highball is just a spirit
 * and a mixer, and plenty of pours are spirit-only. Blank across all three
 * fields of a slot means "this recipe doesn't use it", not an error; a
 * partial entry (one or two of the three filled in) is a typo, not a choice,
 * and is reported rather than silently treated either way.
 */
export const OPTIONAL_INGREDIENT_IDS = Object.freeze([
  'modifierBottleCost',
  'modifierBottleSizeOz',
  'modifierOzUsed',
  'mixerBottleCost',
  'mixerBottleSizeOz',
  'mixerOzUsed',
]);

/** The fields about the drink and the bar, not about any one ingredient. */
export const DRINK_FIELD_IDS = Object.freeze([
  'menuPrice',
  'targetPourCostPercent',
  'drinksPerWeek',
  'overPourOzPerDrink',
]);

/** Every id the form owns, in read order. */
export const ALL_INPUT_IDS = Object.freeze([
  ...REQUIRED_INGREDIENT_IDS,
  ...OPTIONAL_INGREDIENT_IDS,
  ...DRINK_FIELD_IDS,
]);

const WEEKS_PER_YEAR = 52;

/** A pour-cost gap this small or smaller is read as "on target", not a note. */
const ON_TARGET_TOLERANCE_POINTS = 2;

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function toNumber(value) {
  if (isBlank(value)) return NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

function readField(errors, input, id, { min = 0, max = Infinity, label }) {
  const value = toNumber(input[id]);
  if (!Number.isFinite(value)) {
    errors.push({ id, message: `${label} is needed.` });
    return 0;
  }
  if (value < min) {
    errors.push({ id, message: `${label} cannot be below ${min}.` });
    return 0;
  }
  if (value > max) {
    errors.push({ id, message: `${label} cannot be above ${max}.` });
    return 0;
  }
  return value;
}

/**
 * Read one optional ingredient slot.
 *
 * Returns `{ used: false }` when all three fields are blank, `{ used: true,
 * bottleCost, bottleSizeOz, ozUsed }` when all three are filled and valid, or
 * pushes errors and returns `{ used: false }` when the slot is started but not
 * finished — a bottle cost with no pour size typed is a form left half full,
 * not a recipe with no mixer.
 */
function readOptionalIngredient(errors, input, prefix, label) {
  const costId = `${prefix}BottleCost`;
  const sizeId = `${prefix}BottleSizeOz`;
  const ozId = `${prefix}OzUsed`;
  const blanks = [costId, sizeId, ozId].filter(id => isBlank(input[id]));

  if (blanks.length === 3) return { used: false };

  if (blanks.length > 0) {
    for (const id of blanks) {
      const fieldLabel =
        id === costId ? `${label} bottle cost` : id === sizeId ? `${label} bottle size` : `${label} amount used`;
      errors.push({ id, message: `${fieldLabel} is needed to price the ${label.toLowerCase()}, or leave all three blank to skip it.` });
    }
    return { used: false };
  }

  const bottleCost = readField(errors, input, costId, { min: 0.01, max: 5000, label: `${label} bottle cost` });
  const bottleSizeOz = readField(errors, input, sizeId, { min: 0.1, max: 5000, label: `${label} bottle size` });
  const ozUsed = readField(errors, input, ozId, { min: 0.01, max: 32, label: `${label} amount used` });
  return { used: true, bottleCost, bottleSizeOz, ozUsed };
}

/** Cost of one ounce poured from a bottle of the given price and size. */
export function costPerOz(bottleCost, bottleSizeOz) {
  return bottleCost / bottleSizeOz;
}

/**
 * The pour-cost arithmetic for one recipe, and the annual cost of a stated
 * over-pour on it.
 *
 * Returns `{ ok: false, errors }` when the inputs cannot produce a number, so
 * a caller never has to tell a real result from a placeholder one.
 */
export function calculatePourCost(input = {}) {
  const errors = [];
  const read = (id, opts) => readField(errors, input, id, opts);

  const primaryBottleCost = read('primaryBottleCost', { min: 0.01, max: 5000, label: 'Primary spirit bottle cost' });
  const primaryBottleSizeOz = read('primaryBottleSizeOz', { min: 0.1, max: 5000, label: 'Primary spirit bottle size' });
  const primaryOzUsed = read('primaryOzUsed', { min: 0.01, max: 32, label: 'Primary spirit amount used' });

  const modifier = readOptionalIngredient(errors, input, 'modifier', 'Modifier');
  const mixer = readOptionalIngredient(errors, input, 'mixer', 'Mixer');

  const menuPrice = read('menuPrice', { min: 0.01, max: 500, label: 'Menu price' });
  const targetPourCostPercent = read('targetPourCostPercent', { min: 1, max: 99, label: 'Target pour cost' });
  const drinksPerWeek = read('drinksPerWeek', { min: 0, max: 100000, label: 'Drinks poured a week' });
  const overPourOzPerDrink = read('overPourOzPerDrink', { min: 0, max: 10, label: 'Over-pour per drink' });

  if (errors.length > 0) return { ok: false, errors };

  const primaryCostPerOz = costPerOz(primaryBottleCost, primaryBottleSizeOz);
  const primaryCost = primaryCostPerOz * primaryOzUsed;
  const modifierCost = modifier.used ? costPerOz(modifier.bottleCost, modifier.bottleSizeOz) * modifier.ozUsed : 0;
  const mixerCost = mixer.used ? costPerOz(mixer.bottleCost, mixer.bottleSizeOz) * mixer.ozUsed : 0;

  const recipeCost = primaryCost + modifierCost + mixerCost;

  const pourCostPercent = (recipeCost / menuPrice) * 100;
  const grossProfitPercent = 100 - pourCostPercent;
  const grossProfitPerDrink = menuPrice - recipeCost;

  // Solved backwards from the recipe cost: the price this exact recipe would
  // need to land exactly on the target, holding the recipe fixed. This is an
  // arithmetic mirror, not a suggested price — the tool never says what to
  // charge.
  const targetMenuPrice = recipeCost / (targetPourCostPercent / 100);
  const priceGapVsTarget = menuPrice - targetMenuPrice;

  const overPourCostPerDrink = overPourOzPerDrink * primaryCostPerOz;
  const pourCostPercentWithOverpour = ((recipeCost + overPourCostPerDrink) / menuPrice) * 100;
  const overPourCostPerWeek = overPourCostPerDrink * drinksPerWeek;
  const overPourCostPerYear = overPourCostPerWeek * WEEKS_PER_YEAR;

  const annualRecipeRevenue = menuPrice * drinksPerWeek * WEEKS_PER_YEAR;
  const annualRecipeCost = recipeCost * drinksPerWeek * WEEKS_PER_YEAR;
  const annualGrossProfit = annualRecipeRevenue - annualRecipeCost;

  const figures = {
    ok: true,
    errors: [],
    ingredients: {
      primary: { costPerOz: primaryCostPerOz, ozUsed: primaryOzUsed, cost: primaryCost },
      modifier: modifier.used
        ? { costPerOz: costPerOz(modifier.bottleCost, modifier.bottleSizeOz), ozUsed: modifier.ozUsed, cost: modifierCost }
        : null,
      mixer: mixer.used
        ? { costPerOz: costPerOz(mixer.bottleCost, mixer.bottleSizeOz), ozUsed: mixer.ozUsed, cost: mixerCost }
        : null,
    },
    recipeCost,
    menuPrice,
    pourCostPercent,
    grossProfitPercent,
    grossProfitPerDrink,
    targetPourCostPercent,
    targetMenuPrice,
    priceGapVsTarget,
    onTarget: Math.abs(pourCostPercent - targetPourCostPercent) <= ON_TARGET_TOLERANCE_POINTS,
    overPourOzPerDrink,
    overPourCostPerDrink,
    pourCostPercentWithOverpour,
    drinksPerWeek,
    overPourCostPerWeek,
    overPourCostPerYear,
    annualRecipeRevenue,
    annualRecipeCost,
    annualGrossProfit,
  };

  figures.notes = notes(figures);
  return figures;
}

/**
 * What the numbers say, in the operator's terms.
 *
 * Observations about the figures entered, never advice about what to charge
 * or how to run the bar — this tool does not have an opinion on pricing
 * policy, only on the arithmetic behind the numbers typed in.
 */
export function notes(result) {
  const out = [];
  const gap = result.pourCostPercent - result.targetPourCostPercent;

  if (!result.onTarget && gap > 0) {
    out.push(
      `This recipe's pour cost is ${result.pourCostPercent.toFixed(1)}%, ${gap.toFixed(1)} points above the ${result.targetPourCostPercent.toFixed(1)}% target — the same recipe priced to hit the target would sell for $${result.targetMenuPrice.toFixed(2)} instead of $${result.menuPrice.toFixed(2)}.`,
    );
  } else if (!result.onTarget && gap < 0) {
    out.push(
      `This recipe's pour cost is ${result.pourCostPercent.toFixed(1)}%, ${Math.abs(gap).toFixed(1)} points below the ${result.targetPourCostPercent.toFixed(1)}% target — it is currently priced above what the target alone requires ($${result.targetMenuPrice.toFixed(2)}).`,
    );
  }

  if (result.overPourOzPerDrink > 0 && result.drinksPerWeek > 0) {
    out.push(
      `An extra ${result.overPourOzPerDrink}oz on the primary spirit moves this recipe's pour cost from ${result.pourCostPercent.toFixed(1)}% to ${result.pourCostPercentWithOverpour.toFixed(1)}%. Across ${result.drinksPerWeek.toLocaleString('en-US')} drinks a week that is $${result.overPourCostPerWeek.toFixed(2)} a week, or about $${Math.round(result.overPourCostPerYear).toLocaleString('en-US')} a year, in liquor the price on the menu never accounted for.`,
    );
  }

  if (result.recipeCost >= result.menuPrice) {
    out.push(
      `The ingredient cost ($${result.recipeCost.toFixed(2)}) is at or above the menu price ($${result.menuPrice.toFixed(2)}) — this recipe has no gross profit left before rent, payroll, or anything else the bar spends money on.`,
    );
  }

  return out;
}
