// Pure arithmetic for a maker deciding whether one craft fair, farmers
// market, art festival, or holiday market booth is worth taking — and what
// has to sell on the day for it to be. No network, no state: every fee,
// hour, and rate is an input, so the result stays a calculation the seller
// can check against their own booth contract, mileage log, and card
// statement rather than a claim about what any event "should" return.
//
// The method is the one makers lose money on when they skip it, and it
// differs from the food-service event tools in this portfolio on one
// structural point that changes the whole answer:
//
//   **Unsold stock at a craft fair is not a loss.** A caterer who over-preps
//   throws food away; a maker who brings 60 candles and sells 22 carries 38
//   candles to the next market. So the cost of goods that belongs in a
//   single event's break-even is the cost of what *sold*, not the cost of
//   what was *brought*. Counting the whole table's materials against one
//   weekend is how a maker talks themselves out of an event that was
//   actually fine — and ignoring their own hours entirely is how they talk
//   themselves into one that was not.
//
// The second thing a "was it worth it?" gut check misses is that booth fee,
// jury fee, mileage, and lodging are all committed *before* a single sale:
// they are fixed cost for the day, so what covers them is the contribution
// left after materials and card fees, not gross sales. A $900 day at 30%
// materials and 2.6% card is not $900 against a $250 booth.

function number(value, name, { min = 0, allowZero = true, max = null } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

export const DEFAULTS = {
  boothFee: 250,
  applicationFee: 25,
  milesRoundTrip: 90,
  mileageRate: 0.67,
  lodgingCost: 0,
  parkingTollsCost: 15,
  displayCostPerEvent: 20,
  otherEventCost: 0,
  averageOrderValue: 38,
  materialCostPct: 30,
  stockBroughtRetailValue: 2400,
  cardSharePct: 80,
  cardPercentFee: 2.6,
  cardFixedFee: 0.1,
  prepHours: 8,
  travelHours: 3,
  setupTeardownHours: 3,
  sellingHours: 12,
  targetHourlyRate: 25,
  expectedRevenue: 1500,
};

/**
 * Work out what one market day has to sell, and what it leaves.
 *
 * @param {object} input
 * @param {number} input.boothFee            Booth or stall fee for this event.
 * @param {number} input.applicationFee      Jury or application fee. Usually
 *   non-refundable and paid whether or not you are accepted, so it belongs
 *   in the fixed cost of the event you did get into.
 * @param {number} input.milesRoundTrip      Round-trip driving miles.
 * @param {number} input.mileageRate         Cost per mile for fuel and
 *   vehicle wear.
 * @param {number} input.lodgingCost         Hotel or campsite for a
 *   multi-day or far-away show.
 * @param {number} input.parkingTollsCost    Parking, tolls, and vendor
 *   loading fees.
 * @param {number} input.displayCostPerEvent Tent, tables, racks, lighting,
 *   and signage amortized across the events you expect to use them for.
 * @param {number} input.otherEventCost      Anything else flat — a required
 *   certificate of insurance, an electric hookup, a helper's day rate.
 * @param {number} input.averageOrderValue   What a typical customer spends
 *   in one transaction, not the price of one item.
 * @param {number} input.materialCostPct     Materials and packaging as a
 *   percent of the retail price of what sells. Must be below 100.
 * @param {number} input.stockBroughtRetailValue Retail value of the stock
 *   you are bringing. Used only to express the break-even as a sell-through
 *   percentage — the unsold remainder is inventory, not a cost of this day.
 * @param {number} input.cardSharePct        Percent of sales taken by card
 *   or phone reader rather than cash.
 * @param {number} input.cardPercentFee      Your processor's percentage fee.
 * @param {number} input.cardFixedFee        Your processor's fixed fee per
 *   transaction.
 * @param {number} input.prepHours           Hours spent making stock and
 *   packing specifically for this event.
 * @param {number} input.travelHours         Round-trip driving time.
 * @param {number} input.setupTeardownHours  Load-in, setup, teardown, and
 *   load-out.
 * @param {number} input.sellingHours        Hours the booth is actually open.
 * @param {number} input.targetHourlyRate    What your own time is worth. Set
 *   it to 0 to see the pure cash answer.
 * @param {number} input.expectedRevenue     Gross sales you expect on the
 *   day, before any fees.
 */
export function calculateEvent(input) {
  const boothFee = number(input.boothFee, 'Booth fee');
  const applicationFee = number(input.applicationFee, 'Application/jury fee');
  const milesRoundTrip = number(input.milesRoundTrip, 'Round-trip miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const lodgingCost = number(input.lodgingCost, 'Lodging');
  const parkingTollsCost = number(input.parkingTollsCost, 'Parking & tolls');
  const displayCostPerEvent = number(input.displayCostPerEvent, 'Display cost per event');
  const otherEventCost = number(input.otherEventCost, 'Other event cost');
  const averageOrderValue = number(input.averageOrderValue, 'Average order value', { allowZero: false });
  const materialCostPct = number(input.materialCostPct, 'Material cost', { max: 99.99 });
  const stockBroughtRetailValue = number(input.stockBroughtRetailValue, 'Stock brought (retail value)');
  const cardSharePct = number(input.cardSharePct, 'Card share', { max: 100 });
  const cardPercentFee = number(input.cardPercentFee, 'Card percentage fee', { max: 99.99 });
  const cardFixedFee = number(input.cardFixedFee, 'Card fixed fee');
  const prepHours = number(input.prepHours, 'Prep hours');
  const travelHours = number(input.travelHours, 'Travel hours');
  const setupTeardownHours = number(input.setupTeardownHours, 'Setup & teardown hours');
  const sellingHours = number(input.sellingHours, 'Selling hours');
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const expectedRevenue = number(input.expectedRevenue, 'Expected sales');

  const mileageCost = milesRoundTrip * mileageRate;

  // Committed before a single sale, and identical whether the day is a
  // sellout or a washout. This — not gross sales — is what the day has to
  // earn back first.
  const fixedEventCost = boothFee + applicationFee + mileageCost
    + lodgingCost + parkingTollsCost + displayCostPerEvent + otherEventCost;

  const committedHours = prepHours + travelHours + setupTeardownHours + sellingHours;
  const laborValue = committedHours * targetHourlyRate;

  // What each $1 of sales costs to make and to collect. The card processor's
  // fixed fee is per transaction, so it only becomes a rate once expressed
  // per dollar of sales — which is what dividing by the average order value
  // does. A maker selling $6 stickers loses far more of each dollar to that
  // 10c than one selling $80 prints, and that difference is invisible in
  // every "2.6% + 10c" headline.
  const materialRate = materialCostPct / 100;
  const cardShare = cardSharePct / 100;
  const cardPercentRate = cardShare * (cardPercentFee / 100);
  const cardFixedRate = cardShare * (cardFixedFee / averageOrderValue);
  const variableRate = materialRate + cardPercentRate + cardFixedRate;
  const contributionRate = 1 - variableRate;
  if (contributionRate <= 0) {
    throw new Error(
      'Materials and card fees consume every dollar of sales, so no amount of selling covers the booth. Check the material cost percent and the average order value.',
    );
  }

  const breakEvenRevenue = fixedEventCost / contributionRate;
  const breakEvenRevenueWithPay = (fixedEventCost + laborValue) / contributionRate;
  const breakEvenOrders = Math.ceil(breakEvenRevenue / averageOrderValue);
  const breakEvenOrdersWithPay = Math.ceil(breakEvenRevenueWithPay / averageOrderValue);

  // The honest version of "will this be worth it": what share of the table
  // you have to move. A number over 100 means the stock in the van cannot
  // cover the booth even if every piece sells — the answer then is a bigger
  // table or a different event, and it is worth knowing in the week before
  // rather than at 4pm on the Sunday.
  const sellThroughNeededPct = stockBroughtRetailValue > 0
    ? (breakEvenRevenue / stockBroughtRetailValue) * 100
    : null;
  const sellThroughNeededWithPayPct = stockBroughtRetailValue > 0
    ? (breakEvenRevenueWithPay / stockBroughtRetailValue) * 100
    : null;

  const orders = expectedRevenue / averageOrderValue;
  const materialsCost = expectedRevenue * materialRate;
  const cardFees = expectedRevenue * cardPercentRate + orders * cardShare * cardFixedFee;
  const contribution = expectedRevenue - materialsCost - cardFees;

  // Cash in hand after the day, before paying yourself. This is the number
  // most makers already estimate in their head; the two below are the ones
  // that change a decision.
  const cashProfit = contribution - fixedEventCost;
  const effectiveHourlyRate = committedHours > 0 ? cashProfit / committedHours : null;
  const profitAfterPayingYourself = cashProfit - laborValue;

  // The applications question, answered directly: given what you expect to
  // sell here, what is the most a booth can cost and still clear your own
  // hourly rate? Negative means no booth fee works at this revenue — even a
  // free stall would miss the target — which is a fact about the event's
  // expected sales, not about its organiser.
  const fixedCostExcludingBooth = fixedEventCost - boothFee;
  const maxBoothFeeAtTargetRate = contribution - laborValue - fixedCostExcludingBooth;

  return {
    mileageCost,
    fixedEventCost,
    committedHours,
    laborValue,
    materialRate,
    cardPercentRate,
    cardFixedRate,
    variableRate,
    contributionRate,
    contributionPerOrder: averageOrderValue * contributionRate,
    breakEvenRevenue,
    breakEvenOrders,
    breakEvenRevenueWithPay,
    breakEvenOrdersWithPay,
    sellThroughNeededPct,
    sellThroughNeededWithPayPct,
    // Break-even needs more than the whole table: flagged rather than
    // buried, because it is the one result that cannot be fixed on the day.
    stockTooThin: sellThroughNeededPct !== null && sellThroughNeededPct > 100,
    expected: {
      revenue: expectedRevenue,
      orders,
      materialsCost,
      cardFees,
      contribution,
      cashProfit,
      effectiveHourlyRate,
      profitAfterPayingYourself,
      clearsTargetRate: profitAfterPayingYourself >= 0,
      belowCashBreakEven: cashProfit < 0,
    },
    maxBoothFeeAtTargetRate,
    noBoothFeeClearsTarget: maxBoothFeeAtTargetRate < 0,
  };
}
