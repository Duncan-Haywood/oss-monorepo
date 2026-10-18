// Pure arithmetic for a wedding or event florist pricing one proposal. No
// network, no state: every stem count, bunch size, wholesale price, hour and
// rate is an input, so the total stays a calculation the florist can check
// against their own invoices rather than a claim about what any wedding
// "should" cost.
//
// Three things a markup-on-recipe spreadsheet usually misses, and all three
// change the answer this calculator gives:
//
//   **Stems are sold in bunches, and a recipe is written in stems.** A
//   recipe calling for 85 garden roses does not cost 85 x the per-stem
//   price: garden roses arrive in bunches of ten, so the florist buys 100
//   and pays for 100. Repeat that across six or seven varieties and the
//   difference between "what the recipe calls for" and "what the invoice
//   says" is real money — money a per-stem markup never recovers, because
//   it was applied to a cost that was never paid. This calculator buys in
//   whole bunches and reports the gap explicitly.
//
//   **A shrink allowance has to be bought before it can be rounded.** The
//   usual shortcut is to add the percentage to the line's cost at the end,
//   which buys a fraction of a bunch — and a fraction of a bunch is not
//   something a wholesaler sells. It is wrong in both directions: on 95
//   stems of a ten-stem variety the shortcut charges for half a bunch
//   nobody buys, and on 100 it charges 5% while the extra stems actually
//   cost a whole extra bunch. Shrink is therefore added to the stem count
//   first, and the bunch rounding happens on the result.
//
//   **Pricing labour as a percentage of flowers breaks on installs.** The
//   trade rule of thumb — labour is roughly a third of the flower total —
//   holds for a bouquets-and-centrepieces event, where hours track stems.
//   It fails on an arch, an installation, or a late strike, which take
//   hours and comparatively few stems. This calculator prices labour by
//   the hour and reports what the percentage rule would have quoted, so
//   the gap is a number rather than a surprise.

function number(value, name, { min = 0, allowZero = true, max = null } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

/** How many stem lines the form carries. Six covers focal, secondary,
 * filler, greenery and two accents, which is the shape of an ordinary
 * wedding recipe; an unused line is simply left at zero stems. */
export const STEM_LINES = 6;

/** The three inputs each stem line owns, in form order. */
export const STEM_FIELDS = Object.freeze(['stemsNeeded', 'bunchSize', 'bunchCost']);

/** `stemsNeeded1`, `bunchSize1`, ... `bunchCost6`. */
export function stemFieldId(field, line) {
  return `${field}${line}`;
}

export const DEFAULTS = {
  // Line 1 — focal (garden roses), the variety the bunch rounding bites on.
  stemsNeeded1: 85,
  bunchSize1: 10,
  bunchCost1: 38,
  // Line 2 — secondary (spray roses).
  stemsNeeded2: 60,
  bunchSize2: 10,
  bunchCost2: 22,
  // Line 3 — texture (ranunculus).
  stemsNeeded3: 40,
  bunchSize3: 10,
  bunchCost3: 30,
  // Line 4 — greenery (eucalyptus).
  stemsNeeded4: 30,
  bunchSize4: 10,
  bunchCost4: 18,
  // Line 5 — accent (stock).
  stemsNeeded5: 25,
  bunchSize5: 10,
  bunchCost5: 16,
  // Line 6 — spare, unused in the worked example.
  stemsNeeded6: 0,
  bunchSize6: 10,
  bunchCost6: 0,

  shrinkPercent: 8,
  flowerMarkupMultiple: 3.5,

  hardGoodsCost: 260,
  hardGoodsMarkup: 2,

  designHours: 14,
  designRatePerHour: 45,
  setupHours: 3,
  strikeHours: 1.5,
  installCrewSize: 3,
  installRatePerHour: 45,
  laborAsPercentOfFlowers: 35,

  deliveryMilesRoundTrip: 46,
  deliveryRatePerMile: 1.25,
  deliveryFlatFee: 75,

  minimumEventRevenue: 3500,
  freelanceCrewCost: 540,
  targetMarginPercent: 55,
};

/**
 * Price one floral proposal.
 *
 * @param {object} input
 * @param {number} input.stemsNeeded1..6         Stems the recipes call for on each line. A line at 0 is unused.
 * @param {number} input.bunchSize1..6           Stems per wholesale bunch. Use 1 for a variety sold by the single stem.
 * @param {number} input.bunchCost1..6           Wholesale cost of one bunch of that variety.
 * @param {number} input.shrinkPercent           Allowance for breakage, blown blooms and processing loss, added to the stem count BEFORE bunches are rounded up.
 * @param {number} input.flowerMarkupMultiple    What flowers are marked up by. Applied to what is actually bought, not to what the recipe calls for.
 * @param {number} input.hardGoodsCost           What this event's vessels, mechanics, foam, wire, candles and consumables cost you.
 * @param {number} input.hardGoodsMarkup         Multiple applied to hard goods, usually lower than the flower markup.
 * @param {number} input.designHours             Studio hours: processing, conditioning, and building the pieces.
 * @param {number} input.designRatePerHour       Billed rate for studio design time.
 * @param {number} input.setupHours              On-site hours to install, per crew member.
 * @param {number} input.strikeHours             On-site hours to break down at the end of the night, per crew member.
 * @param {number} input.installCrewSize         People on site for setup and strike.
 * @param {number} input.installRatePerHour      Billed rate per crew member per on-site hour.
 * @param {number} input.laborAsPercentOfFlowers The trade rule of thumb, for comparison only — it never changes the quoted total.
 * @param {number} input.deliveryMilesRoundTrip  Round-trip miles to the venue.
 * @param {number} input.deliveryRatePerMile     Billed per mile.
 * @param {number} input.deliveryFlatFee         Flat delivery or vehicle fee on top of mileage.
 * @param {number} input.minimumEventRevenue     The lowest total this studio accepts an event for.
 * @param {number} input.freelanceCrewCost       Cash paid out to freelance designers and install crew for this event.
 * @param {number} input.targetMarginPercent     The gross margin below which this proposal is flagged.
 */
export function calculateProposal(input) {
  const shrinkPercent = number(input.shrinkPercent, 'Shrink percent', { max: 100 });
  const flowerMarkupMultiple = number(input.flowerMarkupMultiple, 'Flower markup multiple');
  const hardGoodsCost = number(input.hardGoodsCost, 'Hard goods cost');
  const hardGoodsMarkup = number(input.hardGoodsMarkup, 'Hard goods markup');
  const designHours = number(input.designHours, 'Design hours');
  const designRatePerHour = number(input.designRatePerHour, 'Design rate per hour');
  const setupHours = number(input.setupHours, 'Setup hours');
  const strikeHours = number(input.strikeHours, 'Strike hours');
  const installCrewSize = number(input.installCrewSize, 'Install crew size');
  const installRatePerHour = number(input.installRatePerHour, 'Install rate per hour');
  const laborAsPercentOfFlowers = number(input.laborAsPercentOfFlowers, 'Labor as percent of flowers');
  const deliveryMilesRoundTrip = number(input.deliveryMilesRoundTrip, 'Delivery miles round trip');
  const deliveryRatePerMile = number(input.deliveryRatePerMile, 'Delivery rate per mile');
  const deliveryFlatFee = number(input.deliveryFlatFee, 'Delivery flat fee');
  const minimumEventRevenue = number(input.minimumEventRevenue, 'Minimum event revenue');
  const freelanceCrewCost = number(input.freelanceCrewCost, 'Freelance crew cost');
  const targetMarginPercent = number(input.targetMarginPercent, 'Target margin percent', { max: 100 });

  // Each line is bought in whole bunches, and the shrink allowance is added
  // to the stem count *before* that rounding. Doing it the other way round
  // understates shrink, because a tenth of a bunch is not purchasable.
  const lines = [];
  for (let line = 1; line <= STEM_LINES; line += 1) {
    const stemsNeeded = number(input[`stemsNeeded${line}`], `Line ${line} stems needed`);
    const bunchSizeRaw = number(input[`bunchSize${line}`], `Line ${line} bunch size`);
    const bunchCost = number(input[`bunchCost${line}`], `Line ${line} cost per bunch`);

    // A variety sold by the single stem is bunch size 1. Treating 0 as 1
    // keeps an unused line (0 stems, 0 cost) from dividing by zero rather
    // than making the florist remember to type a 1 into a row they are
    // not using.
    const bunchSize = bunchSizeRaw > 0 ? bunchSizeRaw : 1;
    const perStemCost = bunchCost / bunchSize;

    const stemsWithShrink = Math.ceil(stemsNeeded * (1 + shrinkPercent / 100));
    const bunchesToBuy = Math.ceil(stemsWithShrink / bunchSize);
    const stemsPurchased = bunchesToBuy * bunchSize;
    const lineCost = bunchesToBuy * bunchCost;
    // What a per-stem markup sheet would have costed this line at: the
    // recipe's own stem count at the per-stem price, with no shrink and no
    // rounding. This is the figure the gap below is measured against.
    const linePerStemCost = stemsNeeded * perStemCost;

    lines.push({
      line,
      stemsNeeded,
      bunchSize,
      bunchCost,
      perStemCost,
      stemsWithShrink,
      bunchesToBuy,
      stemsPurchased,
      stemsLeftOver: stemsPurchased - stemsNeeded,
      lineCost,
      linePerStemCost,
      lineRoundingGap: lineCost - linePerStemCost,
      used: stemsNeeded > 0,
    });
  }

  const flowerCostActual = lines.reduce((sum, l) => sum + l.lineCost, 0);
  const flowerCostPerStemBasis = lines.reduce((sum, l) => sum + l.linePerStemCost, 0);
  const bunchRoundingGap = flowerCostActual - flowerCostPerStemBasis;
  const stemsNeededTotal = lines.reduce((sum, l) => sum + l.stemsNeeded, 0);
  const stemsPurchasedTotal = lines.reduce((sum, l) => sum + l.stemsPurchased, 0);
  const stemsLeftOverTotal = stemsPurchasedTotal - stemsNeededTotal;

  const flowerRevenue = flowerCostActual * flowerMarkupMultiple;
  // What the same markup would have quoted off the per-stem basis. The
  // difference is what a recipe-priced sheet leaves on the table, and it is
  // larger than the cost gap itself by exactly the markup multiple.
  const flowerRevenuePerStemBasis = flowerCostPerStemBasis * flowerMarkupMultiple;
  const flowerRevenueGap = flowerRevenue - flowerRevenuePerStemBasis;

  const hardGoodsRevenue = hardGoodsCost * hardGoodsMarkup;

  const designLabor = designHours * designRatePerHour;
  const onSiteCrewHours = (setupHours + strikeHours) * installCrewSize;
  const installLabor = onSiteCrewHours * installRatePerHour;
  const laborRevenue = designLabor + installLabor;

  // The rule of thumb, priced for comparison and never added to the total.
  const laborByPercentRule = flowerRevenue * (laborAsPercentOfFlowers / 100);
  const laborRuleGap = laborRevenue - laborByPercentRule;

  const deliveryRevenue = deliveryMilesRoundTrip * deliveryRatePerMile + deliveryFlatFee;

  const proposalSubtotal = flowerRevenue + hardGoodsRevenue + laborRevenue + deliveryRevenue;
  const minimumTopUp = Math.max(0, minimumEventRevenue - proposalSubtotal);
  const belowMinimum = minimumTopUp > 0;
  const proposalTotal = proposalSubtotal + minimumTopUp;

  const cashCostTotal = flowerCostActual + hardGoodsCost + freelanceCrewCost;
  const grossProfit = proposalTotal - cashCostTotal;
  const grossMarginPercent = proposalTotal > 0 ? (grossProfit / proposalTotal) * 100 : null;
  const flowerCostRatioPercent = proposalTotal > 0 ? (flowerCostActual / proposalTotal) * 100 : null;
  const belowTargetMargin = grossMarginPercent !== null && grossMarginPercent < targetMarginPercent;

  return {
    lines,
    stemsNeededTotal,
    stemsPurchasedTotal,
    stemsLeftOverTotal,
    flowerCostActual,
    flowerCostPerStemBasis,
    bunchRoundingGap,
    flowerRevenue,
    flowerRevenuePerStemBasis,
    flowerRevenueGap,
    hardGoodsRevenue,
    designLabor,
    onSiteCrewHours,
    installLabor,
    laborRevenue,
    laborByPercentRule,
    laborRuleGap,
    deliveryRevenue,
    proposalSubtotal,
    minimumTopUp,
    belowMinimum,
    proposalTotal,
    cashCostTotal,
    grossProfit,
    grossMarginPercent,
    flowerCostRatioPercent,
    belowTargetMargin,
  };
}
