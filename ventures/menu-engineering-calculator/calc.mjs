/**
 * Menu engineering: which plates on a menu actually carry the restaurant.
 *
 * A menu is not a list of dishes that each succeed or fail on their own food
 * cost percentage. It is a portfolio, and the standard way to read one is the
 * Kasavana & Smith matrix (Michigan State, 1982), which crosses two axes that
 * an operator already has the numbers for:
 *
 * **Popularity** — an item's share of covers sold, against the share it would
 * get if every item on the menu sold equally. The convention is to call an
 * item popular when it clears 70% of that equal share: on a 10-item menu the
 * equal share is 10%, so the bar is 7%. The 70% factor is a convention, not a
 * law of nature, which is why `POPULARITY_FACTOR` is a named constant here and
 * the threshold it produces is reported rather than hidden.
 *
 * **Contribution margin** — menu price minus plate food cost, in dollars, not
 * as a percentage. This is the axis operators most often get wrong, because
 * food cost *percentage* is the number the industry talks about, and the two
 * disagree constantly. A $34 steak at 40% food cost contributes $20.40 a
 * plate; a $9 pasta at 20% contributes $7.20. The pasta wins on the percentage
 * everyone quotes and loses by $13 on the only number that pays rent. Ranking
 * a menu by food cost percentage is how a kitchen ends up promoting its
 * cheapest-to-make plate straight into a worse week.
 *
 * The four quadrants, in the usual names:
 *
 *   - **Star** — sells well, contributes above average. Leave it alone.
 *   - **Plowhorse** — sells well, contributes below average. High volume is
 *     doing the work that margin should be; this is where a small price move
 *     is worth the most, because it lands on the most plates.
 *   - **Puzzle** — contributes above average, does not sell. The margin is
 *     already there and nobody is ordering it.
 *   - **Dog** — neither. Occupies a line on the menu, a slot in the walk-in,
 *     and prep time.
 *
 * What this file does NOT do is tell anyone what to charge, what to cut, or
 * how to lay out a menu. Those are decisions about a specific room, a specific
 * clientele and a specific kitchen, and no arithmetic on four columns can make
 * them. It reports the classification, the thresholds that produced it, and
 * the annualised size of one stated price move — so the operator is arguing
 * with a number instead of a hunch.
 */

/** Weeks in a year, for annualising a period the operator reports. */
const WEEKS_PER_YEAR = 52;

/**
 * Kasavana & Smith's popularity bar: an item counts as popular once it takes
 * 70% of the menu mix share it would get if every item sold equally. Named
 * rather than inlined because it is a convention that a given operator may
 * reasonably disagree with, and because the page reports the threshold it
 * produces rather than asking anyone to take the classification on trust.
 */
export const POPULARITY_FACTOR = 0.7;

/** The most item rows the form will price at once. */
export const MAX_ITEMS = 40;

/** A menu needs at least this many items before a matrix means anything. */
export const MIN_ITEMS = 2;

/** The fields each item row owns, in the order the page presents them. */
export const ITEM_FIELDS = Object.freeze(['name', 'unitsSold', 'foodCost', 'menuPrice']);

/** The fields about the menu and the period, not about any one item. */
export const MENU_FIELD_IDS = Object.freeze([
  'periodWeeks',
  'targetFoodCostPercent',
  'priceIncrease',
]);

/** The four quadrants, in the order the page lists them. */
export const CLASSES = Object.freeze(['star', 'plowhorse', 'puzzle', 'dog']);

/** How each quadrant is described where it is named. */
export const CLASS_LABELS = Object.freeze({
  star: 'Star',
  plowhorse: 'Plowhorse',
  puzzle: 'Puzzle',
  dog: 'Dog',
});

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function toNumber(value) {
  if (isBlank(value)) return NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

function readField(errors, raw, id, { min = 0, max = Infinity, label }) {
  const value = toNumber(raw);
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
 * Read one item row.
 *
 * Blank across all four fields means "this row isn't a menu item", not an
 * error — the form ships more rows than a short menu needs, and a half-filled
 * menu should not be harder to price than a full one. A row with *something*
 * in it is a row the operator started, so its missing numbers are reported
 * against that row rather than silently dropped, which would quietly change
 * every total on the page.
 *
 * The name is the one field that falls back rather than failing: an operator
 * who typed three numbers and tabbed past the name wants the arithmetic, not a
 * scolding, and every output row still needs something to call it.
 */
function readItem(errors, raw, index) {
  const rowNumber = index + 1;
  const filled = ITEM_FIELDS.filter(field => !isBlank(raw?.[field]));
  if (filled.length === 0) return null;

  const id = field => `item${index}_${field}`;
  const name = isBlank(raw.name) ? `Item ${rowNumber}` : String(raw.name).trim();
  const where = `“${name}”`;

  const unitsSold = readField(errors, raw.unitsSold, id('unitsSold'), {
    min: 0,
    max: 10_000_000,
    label: `Units sold for ${where}`,
  });
  const foodCost = readField(errors, raw.foodCost, id('foodCost'), {
    min: 0,
    max: 100_000,
    label: `Plate food cost for ${where}`,
  });
  const menuPrice = readField(errors, raw.menuPrice, id('menuPrice'), {
    min: 0.01,
    max: 100_000,
    label: `Menu price for ${where}`,
  });

  return { index, name, unitsSold, foodCost, menuPrice };
}

/**
 * Classify a menu and size the one price move the operator asked about.
 *
 * Returns `{ ok: false, errors }` whenever the inputs cannot produce a number,
 * so a caller never has to tell a real result from a placeholder one.
 */
export function calculateMenu(input = {}) {
  const errors = [];
  const rawItems = Array.isArray(input.items) ? input.items.slice(0, MAX_ITEMS) : [];

  const items = [];
  for (const [index, raw] of rawItems.entries()) {
    const item = readItem(errors, raw, index);
    if (item) items.push(item);
  }

  const periodWeeks = readField(errors, input.periodWeeks, 'periodWeeks', {
    min: 0.5,
    max: 260,
    label: 'Period covered',
  });
  const targetFoodCostPercent = readField(errors, input.targetFoodCostPercent, 'targetFoodCostPercent', {
    min: 1,
    max: 99,
    label: 'Target food cost',
  });
  const priceIncrease = readField(errors, input.priceIncrease, 'priceIncrease', {
    min: 0,
    max: 1000,
    label: 'Price increase to test',
  });

  if (items.length < MIN_ITEMS) {
    errors.push({
      id: 'items',
      message: `Enter at least ${MIN_ITEMS} menu items — a matrix compares each item to the rest of the menu, so one item on its own has nothing to be measured against.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const totalUnits = items.reduce((sum, item) => sum + item.unitsSold, 0);
  if (totalUnits <= 0) {
    return {
      ok: false,
      errors: [{
        id: 'items',
        message: 'At least one item needs a units-sold figure above zero — menu mix is each item’s share of what actually sold.',
      }],
    };
  }

  const totalRevenue = items.reduce((sum, item) => sum + item.menuPrice * item.unitsSold, 0);
  const totalFoodCost = items.reduce((sum, item) => sum + item.foodCost * item.unitsSold, 0);
  const totalContributionMargin = totalRevenue - totalFoodCost;

  // The weighted average contribution margin — total margin over total covers,
  // NOT the average of the per-item margins. The distinction matters: an
  // unweighted average lets a $40 plate that sold twice pull the bar up as
  // hard as the $14 plate that sold four hundred times, and the bar is
  // supposed to represent what the menu actually earns per cover.
  const averageContributionMargin = totalContributionMargin / totalUnits;

  // The equal-share popularity bar, discounted by the 70% convention.
  const popularityThresholdPercent = (100 / items.length) * POPULARITY_FACTOR;

  const annualFactor = WEEKS_PER_YEAR / periodWeeks;

  const priced = items.map(item => {
    const contributionMargin = item.menuPrice - item.foodCost;
    const menuMixPercent = (item.unitsSold / totalUnits) * 100;
    const popular = menuMixPercent >= popularityThresholdPercent;
    const highMargin = contributionMargin >= averageContributionMargin;
    return {
      ...item,
      contributionMargin,
      contributionMarginTotal: contributionMargin * item.unitsSold,
      revenue: item.menuPrice * item.unitsSold,
      foodCostTotal: item.foodCost * item.unitsSold,
      // Guarded only in principle: menuPrice is validated at min 0.01, so this
      // cannot divide by zero. Written as the plain ratio rather than a
      // defensive branch that no input can reach.
      foodCostPercent: (item.foodCost / item.menuPrice) * 100,
      menuMixPercent,
      popular,
      highMargin,
      classification: popular
        ? (highMargin ? 'star' : 'plowhorse')
        : (highMargin ? 'puzzle' : 'dog'),
      losesMoney: item.foodCost >= item.menuPrice,
    };
  });

  const byClass = Object.fromEntries(
    CLASSES.map(name => [name, priced.filter(item => item.classification === name)]),
  );

  const plowhorses = byClass.plowhorse;

  // What the stated increase is worth if it lands on every plowhorse and
  // nobody orders one fewer. That second clause is an assumption, not a
  // finding, and `notes()` says so out loud — an operator who reads this
  // number as a promise will be disappointed by the first month of covers.
  const plowhorseUnits = plowhorses.reduce((sum, item) => sum + item.unitsSold, 0);
  const priceMoveGainPerPeriod = plowhorseUnits * priceIncrease;
  const priceMoveGainPerYear = priceMoveGainPerPeriod * annualFactor;

  const overallFoodCostPercent = (totalFoodCost / totalRevenue) * 100;

  const figures = {
    ok: true,
    errors: [],
    items: priced,
    byClass,
    counts: Object.fromEntries(CLASSES.map(name => [name, byClass[name].length])),
    itemCount: items.length,
    totalUnits,
    totalRevenue,
    totalFoodCost,
    totalContributionMargin,
    averageContributionMargin,
    overallFoodCostPercent,
    targetFoodCostPercent,
    foodCostGapPoints: overallFoodCostPercent - targetFoodCostPercent,
    popularityThresholdPercent,
    periodWeeks,
    annualFactor,
    annualContributionMargin: totalContributionMargin * annualFactor,
    priceIncrease,
    plowhorseUnits,
    priceMoveGainPerPeriod,
    priceMoveGainPerYear,
  };

  figures.notes = notes(figures);
  return figures;
}

const money2 = (value) => {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const money0 = (value) => {
  const format = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const count = value => value.toLocaleString('en-US');

/**
 * What the classification says, in the operator's terms.
 *
 * Observations about the figures entered, never advice about what to charge,
 * cut, or promote. The line between the two is the whole liability posture of
 * this tool: "these four items are below the average margin and sell well" is
 * arithmetic; "raise their prices" is running someone else's restaurant.
 */
export function notes(result) {
  const out = [];

  const gap = result.foodCostGapPoints;
  if (Math.abs(gap) >= 0.05) {
    out.push(
      gap > 0
        ? `Across everything entered, food cost ran ${result.overallFoodCostPercent.toFixed(1)}% of sales — ${gap.toFixed(1)} points above the ${result.targetFoodCostPercent.toFixed(1)}% target. Closing that gap on ${money0(result.totalRevenue)} of sales is about ${money0((gap / 100) * result.totalRevenue)} over this period.`
        : `Across everything entered, food cost ran ${result.overallFoodCostPercent.toFixed(1)}% of sales — ${Math.abs(gap).toFixed(1)} points below the ${result.targetFoodCostPercent.toFixed(1)}% target.`,
    );
  }

  if (result.counts.plowhorse > 0 && result.priceIncrease > 0) {
    const biggest = [...result.byClass.plowhorse].sort((a, b) => b.unitsSold - a.unitsSold)[0];
    out.push(
      `${count(result.counts.plowhorse)} ${result.counts.plowhorse === 1 ? 'item sells' : 'items sell'} well but contribute below the ${money2(result.averageContributionMargin)} menu average — ${count(result.plowhorseUnits)} covers between them, the most of any on “${biggest.name}”. A ${money2(result.priceIncrease)} increase across those items is ${money0(result.priceMoveGainPerPeriod)} over this period, or about ${money0(result.priceMoveGainPerYear)} a year — if the same number of people order them at the new price, which is the part this arithmetic cannot tell you.`,
    );
  } else if (result.counts.plowhorse > 0) {
    out.push(
      `${count(result.counts.plowhorse)} ${result.counts.plowhorse === 1 ? 'item sells' : 'items sell'} well but contribute below the ${money2(result.averageContributionMargin)} menu average, across ${count(result.plowhorseUnits)} covers. Set a price increase above to size what a move on those is worth.`,
    );
  }

  if (result.counts.puzzle > 0) {
    const best = [...result.byClass.puzzle].sort((a, b) => b.contributionMargin - a.contributionMargin)[0];
    out.push(
      `${count(result.counts.puzzle)} ${result.counts.puzzle === 1 ? 'item contributes' : 'items contribute'} above the menu average but ${result.counts.puzzle === 1 ? 'sells' : 'sell'} below the ${result.popularityThresholdPercent.toFixed(1)}% popularity bar — “${best.name}” carries the highest margin of them at ${money2(best.contributionMargin)} a plate. The margin is already there; what is missing is covers.`,
    );
  }

  if (result.counts.dog > 0) {
    const dogUnits = result.byClass.dog.reduce((sum, item) => sum + item.unitsSold, 0);
    const dogMargin = result.byClass.dog.reduce((sum, item) => sum + item.contributionMarginTotal, 0);
    out.push(
      `${count(result.counts.dog)} ${result.counts.dog === 1 ? 'item is' : 'items are'} below the bar on both axes: ${(dogUnits / result.totalUnits * 100).toFixed(1)}% of covers and ${(dogMargin / result.totalContributionMargin * 100).toFixed(1)}% of total contribution margin, on ${result.counts.dog === 1 ? 'a line' : 'lines'} that still ${result.counts.dog === 1 ? 'takes' : 'take'} prep, storage and menu space.`,
    );
  }

  const losers = result.items.filter(item => item.losesMoney);
  if (losers.length > 0) {
    out.push(
      `${losers.map(item => `“${item.name}”`).join(', ')} ${losers.length === 1 ? 'costs' : 'cost'} at least as much to plate as ${losers.length === 1 ? 'it sells' : 'they sell'} for — ${losers.length === 1 ? 'that item contributes' : 'those items contribute'} nothing toward labour, rent or anything else before a single other cost is counted.`,
    );
  }

  if (result.counts.star === result.itemCount) {
    out.push(
      'Every item cleared both bars, which happens when a menu is short and evenly balanced. The thresholds are relative to this menu, so a classification is a comparison between these items — never a verdict on any one of them in isolation.',
    );
  }

  return out;
}
