// Pure arithmetic for a storage-unit auction bidder deciding what to bid on
// one lien-sale unit -- sold sight-mostly-unseen (viewed from the doorway
// only, never entered) for its entire contents. No network, no state: every
// dollar and hour is an input, so the recommended ceiling stays a calculation
// the bidder can check rather than a claim about what any unit "is worth".
//
// Three things the "bid X% of what it's worth" rule of thumb every storage
// auction forum repeats gets wrong, and all three change the answer this
// calculator gives:
//
//   **The winning bid is not the purchase price.** Every major lien-auction
//   platform (StorageTreasures, Lockerfox, and most in-person auctioneers)
//   charges a buyer's premium on top of the hammer price -- commonly
//   10-15%. A bidder who treats their walk-away number as "what I'll pay"
//   is quietly bidding 10-15% past it, every single time.
//
//   **"What it's worth" and "what it nets you" are different numbers, twice
//   over.** A flat percentage is usually applied to an eyeballed retail
//   value -- what the contents would fetch new, or sold with time to
//   negotiate. Liquidating a stranger's unit on a deadline realizes a
//   fraction of that (used goods, no provenance, a buyer who has to move
//   it), and whatever it does fetch is then cut again by the resale
//   channel's own fees. A rule applied to retail value skips both cuts.
//
//   **Cleanout has its own cash cost, and it does not scale with the
//   contents' value.** Dump loads, a truck, labor hours, and months of
//   holding cost to resell through are the same rough size whether the unit
//   turns out to hold antiques or a sofa nobody wants. A percentage-of-value
//   rule has no room for a fixed cost stack at all, so it is systematically
//   more wrong the smaller the haul turns out to be -- which, sight-unseen,
//   is the outcome you cannot rule out.
//
// This calculator prices the actual cost stack -- premium, recovery rate,
// resale fees, dump, labor, transport, holding -- and reports the bid a
// target margin actually supports, the bid at which the deal merely breaks
// even, and what a flat percentage-of-value rule would have told you to bid
// instead.

function number(value, name, { min = 0, allowZero = true, max = null } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

export const DEFAULTS = {
  estimatedRetailValue: 4000,
  recoveryRatePercent: 35,
  resaleFeePercent: 15,
  buyerPremiumPercent: 12,

  dumpFeePerLoad: 90,
  estimatedDumpLoads: 3,
  transportCost: 60,
  cleanoutPersonHours: 10,
  laborRatePerHour: 20,
  crewSize: 2,
  cleanoutWindowHours: 48,
  cleanoutDepositAmount: 100,

  holdingCostPerMonth: 60,
  monthsToLiquidate: 2,

  targetMarginPercent: 40,
  naiveRuleBidPercent: 20,
  plannedBid: 50,
};

/**
 * Price one storage-unit auction bid.
 *
 * @param {object} input
 * @param {number} input.estimatedRetailValue  What the contents would fetch new or sold with time to negotiate -- your eyeball estimate from the doorway.
 * @param {number} input.recoveryRatePercent   The share of that retail value you realistically expect on resale as used goods, on a deadline, with no provenance.
 * @param {number} input.resaleFeePercent      Blended marketplace and payment fees across the channels you'll actually sell through.
 * @param {number} input.buyerPremiumPercent   The auction platform's buyer's premium, charged on top of your hammer bid, not included in it.
 * @param {number} input.dumpFeePerLoad        Cost per load to haul unsellable contents to the dump or transfer station.
 * @param {number} input.estimatedDumpLoads    Loads of junk you expect to haul out.
 * @param {number} input.transportCost         Truck rental or fuel to move sellable items out and into resale storage.
 * @param {number} input.cleanoutPersonHours   Total person-hours to sort, clean and haul the unit -- yours or a paid helper's.
 * @param {number} input.laborRatePerHour      Dollar value of that labor per hour.
 * @param {number} input.crewSize              People working the cleanout at the same time, which shortens the wall-clock hours against the facility's window.
 * @param {number} input.cleanoutWindowHours   The facility's required removal window, in wall-clock hours from winning bid to empty unit.
 * @param {number} input.cleanoutDepositAmount The refundable cleanout deposit at risk if you miss the window or leave a mess.
 * @param {number} input.holdingCostPerMonth   Cost to store the resale inventory while you sell it through.
 * @param {number} input.monthsToLiquidate     Expected months to sell through the resaleable items.
 * @param {number} input.targetMarginPercent   The minimum gross margin, on net resale revenue, you require to bother bidding.
 * @param {number} input.naiveRuleBidPercent   The flat "bid no more than this % of what it's worth" rule most auction forums repeat, priced for comparison only.
 * @param {number} input.plannedBid            The hammer bid you're actually considering, checked against the numbers above.
 */
export function calculateMaxBid(input) {
  const estimatedRetailValue = number(input.estimatedRetailValue, 'Estimated retail value');
  const recoveryRatePercent = number(input.recoveryRatePercent, 'Recovery rate percent', { max: 100 });
  const resaleFeePercent = number(input.resaleFeePercent, 'Resale fee percent', { max: 100 });
  const buyerPremiumPercent = number(input.buyerPremiumPercent, 'Buyer premium percent');

  const dumpFeePerLoad = number(input.dumpFeePerLoad, 'Dump fee per load');
  const estimatedDumpLoads = number(input.estimatedDumpLoads, 'Estimated dump loads');
  const transportCost = number(input.transportCost, 'Transport cost');
  const cleanoutPersonHours = number(input.cleanoutPersonHours, 'Cleanout person-hours');
  const laborRatePerHour = number(input.laborRatePerHour, 'Labor rate per hour');
  const crewSize = number(input.crewSize, 'Crew size', { min: 1 });
  const cleanoutWindowHours = number(input.cleanoutWindowHours, 'Cleanout window hours', { min: 0, allowZero: false });
  const cleanoutDepositAmount = number(input.cleanoutDepositAmount, 'Cleanout deposit amount');

  const holdingCostPerMonth = number(input.holdingCostPerMonth, 'Holding cost per month');
  const monthsToLiquidate = number(input.monthsToLiquidate, 'Months to liquidate');

  const targetMarginPercent = number(input.targetMarginPercent, 'Target margin percent', { max: 100 });
  const naiveRuleBidPercent = number(input.naiveRuleBidPercent, 'Naive rule bid percent', { max: 100 });
  const plannedBid = number(input.plannedBid, 'Planned bid');

  // What the contents actually net, twice cut: once for realistic resale
  // recovery on used goods sold under deadline, once more for the resale
  // channel's own fees.
  const grossResaleValue = estimatedRetailValue * (recoveryRatePercent / 100);
  const netResaleRevenue = grossResaleValue * (1 - resaleFeePercent / 100);

  const dumpCost = dumpFeePerLoad * estimatedDumpLoads;
  const laborCost = cleanoutPersonHours * laborRatePerHour;
  const holdingCost = holdingCostPerMonth * monthsToLiquidate;
  const nonBidCashCost = dumpCost + laborCost + transportCost + holdingCost;

  const premiumMultiple = 1 + buyerPremiumPercent / 100;

  // The bid at which this deal merely breaks even (0% margin) -- the
  // absolute number past which every additional dollar bid is a loss.
  const breakEvenBidRaw = (netResaleRevenue - nonBidCashCost) / premiumMultiple;
  const breakEvenBid = Math.max(0, breakEvenBidRaw);
  const noProfitablePrice = breakEvenBidRaw <= 0;

  // The bid that leaves exactly the target margin on the table.
  const maxBidAtTargetMarginRaw =
    (netResaleRevenue * (1 - targetMarginPercent / 100) - nonBidCashCost) / premiumMultiple;
  const maxBidAtTargetMargin = Math.max(0, maxBidAtTargetMarginRaw);
  const targetUnreachable = maxBidAtTargetMarginRaw <= 0;

  // The rule of thumb, priced for comparison and never used in the recommendation above.
  const naiveRuleBid = estimatedRetailValue * (naiveRuleBidPercent / 100);
  const naiveRuleGap = naiveRuleBid - maxBidAtTargetMargin;
  const naiveRuleExceedsBreakEven = naiveRuleBid > breakEvenBid;

  // What the planned bid actually costs and returns, including the premium
  // the platform adds on top of the hammer price.
  const plannedPurchaseCost = plannedBid * premiumMultiple;
  const plannedPremiumCost = plannedPurchaseCost - plannedBid;
  const plannedTotalOutlay = plannedPurchaseCost + nonBidCashCost;
  const plannedProfit = netResaleRevenue - plannedTotalOutlay;
  const plannedMarginPercent = netResaleRevenue > 0 ? (plannedProfit / netResaleRevenue) * 100 : null;
  const plannedExceedsTarget = plannedBid > maxBidAtTargetMargin;
  const plannedExceedsBreakEven = plannedBid > breakEvenBid;

  // Wall-clock hours the cleanout actually takes, once split across the
  // crew, against the facility's own removal window.
  const elapsedCleanoutHours = cleanoutPersonHours / crewSize;
  const depositAtRisk = elapsedCleanoutHours > cleanoutWindowHours;

  const healthy = !plannedExceedsTarget && !depositAtRisk && !noProfitablePrice;

  return {
    grossResaleValue,
    netResaleRevenue,
    dumpCost,
    laborCost,
    holdingCost,
    nonBidCashCost,
    breakEvenBid,
    noProfitablePrice,
    maxBidAtTargetMargin,
    targetUnreachable,
    naiveRuleBid,
    naiveRuleGap,
    naiveRuleExceedsBreakEven,
    plannedPurchaseCost,
    plannedPremiumCost,
    plannedTotalOutlay,
    plannedProfit,
    plannedMarginPercent,
    plannedExceedsTarget,
    plannedExceedsBreakEven,
    elapsedCleanoutHours,
    depositAtRisk,
    cleanoutDepositAmount,
    healthy,
  };
}
