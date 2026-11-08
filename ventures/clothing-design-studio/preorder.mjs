/**
 * Pre-order campaign planner.
 *
 * A new brand with no cash for a first run can sell before it makes: take
 * pre-orders, and place the factory order only if the minimum order quantity
 * (MOQ) is reached, refunding everyone otherwise. This module answers the four
 * questions a designer has before starting:
 *
 *   1. How many orders must I take, once some cancel or fail payment?
 *   2. How many visitors is that, at my conversion rate (or the range a small
 *      test really supports)? What does the traffic cost if bought?
 *   3. How likely is it that my expected traffic reaches that, over the days I
 *      give the campaign? (Orders modelled as Poisson: many visitors, a small
 *      chance each. Independent visitors is an assumption, shown on the page.)
 *   4. What do I make if it works, and what do I lose if it does not?
 *
 * Arithmetic on typed numbers. It does not know what any conversion rate
 * "should" be, promises no result, and says nothing about consumer-protection
 * rules for pre-orders (delivery promises, refund times), which differ by
 * country and which the seller must check.
 */

import { wilson } from "./marketing.mjs";

const round2 = v => Math.round(v * 100) / 100;

/** P(X >= k) for X ~ Poisson(lambda), summed in log space so large means do not underflow. */
export function poissonAtLeast(k, lambda) {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let logp = -lambda, below = 0;
  const lnl = Math.log(lambda);
  for (let i = 0; i < k; i++) {
    if (i > 0) logp += lnl - Math.log(i);
    below += Math.exp(logp);
    if (below >= 1) return 0;
  }
  return Math.min(1, Math.max(0, 1 - below));
}

/**
 * @param {object} i
 * @param {number} i.price             shelf price per piece (tax included where the shopper sees it)
 * @param {number} i.landed            landed cost per piece at the MOQ
 * @param {number} i.moq               the factory's minimum order, in pieces
 * @param {number} [i.taxPct=0]        VAT in the shelf price
 * @param {number} [i.feePct=3]        payment and platform percent of the shelf price
 * @param {number} [i.feeFixed=0.3]    fixed payment fee per order
 * @param {number} [i.cancelPct=5]     orders that cancel, fail payment or are returned before shipping
 * @param {number} [i.conversionPct=1] visitors who order
 * @param {number} [i.visitorsPerDay=100]
 * @param {number} [i.days=30]
 * @param {number} [i.cpc=0]           price of a bought visitor; 0 = unpaid traffic
 * @param {number} [i.fixedCosts=0]    samples, photos, set-up paid before the campaign and lost if it fails
 * @param {{visitors:number, orders:number}} [i.test] a small test, to bound the conversion rate
 * @param {number} [i.depositPct=100]  share of the price charged at order; the rest is charged when the factory order is placed or goods ship
 * @param {number} [i.balanceDefaultPct=0] orders that paid the deposit but never pay the balance (their pieces are made and unsold)
 */
export function planPreorder(i) {
  const o = { taxPct: 0, feePct: 3, feeFixed: 0.3, cancelPct: 5, conversionPct: 1, visitorsPerDay: 100, days: 30, cpc: 0, fixedCosts: 0, depositPct: 100, balanceDefaultPct: 0, ...i };
  const errors = [];
  if (!(o.price > 0)) errors.push("Type a price.");
  if (!(o.landed >= 0)) errors.push("Type the landed cost per piece.");
  if (!(o.moq >= 1)) errors.push("Type the factory minimum order (1 or more).");
  if (!(o.cancelPct >= 0 && o.cancelPct < 100)) errors.push("Cancellations must be from 0 to under 100 percent.");
  if (!(o.conversionPct > 0 && o.conversionPct <= 100)) errors.push("Conversion must be above 0 and at most 100 percent.");
  if (!(o.visitorsPerDay >= 0) || !(o.days >= 1)) errors.push("Give the campaign at least one day and a visitor count.");
  if (!(o.depositPct > 0 && o.depositPct <= 100)) errors.push("The deposit must be above 0 and at most 100 percent of the price.");
  if (!(o.balanceDefaultPct >= 0 && o.balanceDefaultPct < 100)) errors.push("Unpaid balances must be from 0 to under 100 percent.");
  if (errors.length) return { error: errors.join(" ") };

  const keep = 1 - o.cancelPct / 100;
  const ordersNeeded = Math.ceil(o.moq / keep - 1e-9);
  const conv = o.conversionPct / 100;
  const visitorsNeeded = Math.ceil(ordersNeeded / conv - 1e-9);
  const adCost = round2(visitorsNeeded * o.cpc);

  // The conversion rate a small test supports, as a 95% range.
  let range = null;
  if (o.test && o.test.visitors > 0 && o.test.orders >= 0 && o.test.orders <= o.test.visitors) {
    const w = wilson(o.test.orders, o.test.visitors);
    range = {
      conversionLowPct: round2(w.low * 100),
      conversionHighPct: round2(w.high * 100),
      visitorsNeededBest: w.high > 0 ? Math.ceil(ordersNeeded / w.high) : null,
      visitorsNeededWorst: w.low > 0 ? Math.ceil(ordersNeeded / w.low) : null,
    };
  }

  // A split payment is two charges, so the fixed fee is paid twice.
  const charges = o.depositPct < 100 ? 2 : 1;
  const netPerOrder = o.price / (1 + o.taxPct / 100) - (o.price * o.feePct / 100 + o.feeFixed * charges);
  const shippedAtNeed = Math.floor(ordersNeeded * keep + 1e-9); // pieces actually made and sent: at least MOQ
  const made = Math.max(o.moq, shippedAtNeed);
  const adSpendTotal = round2(o.visitorsPerDay * o.days * o.cpc);
  // Orders that pay in full; pieces for the others are made and left unsold. Any
  // forfeited deposit is ignored (refund law differs by country), so this is cautious.
  const paying = o.balanceDefaultPct > 0 ? Math.min(made, Math.floor(shippedAtNeed * (1 - o.balanceDefaultPct / 100) + 1e-9)) : made;
  const profitIfFunded = round2(paying * netPerOrder - made * o.landed - o.fixedCosts - (o.cpc ? visitorsNeeded * o.cpc : 0));
  // Cash: what the deposits bring in before the factory is paid, against the factory bill.
  const depositNet = o.price * (o.depositPct / 100) / (1 + o.taxPct / 100) - (o.price * (o.depositPct / 100) * o.feePct / 100 + o.feeFixed);
  const cashFromDeposits = round2(shippedAtNeed * depositNet);
  const factoryBill = round2(made * o.landed);
  const cashGap = round2(Math.max(0, factoryBill - cashFromDeposits));

  const visitorsExpected = o.visitorsPerDay * o.days;
  const ordersExpected = visitorsExpected * conv;
  const pFunded = poissonAtLeast(ordersNeeded, ordersExpected);
  // Day on which the expected total first passes the need (null if it never does in the window).
  const dayReached = o.visitorsPerDay > 0 ? Math.ceil(ordersNeeded / (o.visitorsPerDay * conv)) : null;

  const lossIfFails = round2(o.fixedCosts + adSpendTotal);
  const overhead = o.fixedCosts + (o.cpc ? visitorsNeeded * o.cpc : 0);
  const denom = 1 / (1 + o.taxPct / 100) - o.feePct / 100;
  const breakEvenPrice = denom > 0 ? round2((o.landed + overhead / made + o.feeFixed) / denom) : null;

  const notes = [];
  if (cashGap > 0) notes.push(`The deposits bring in about ${cashFromDeposits} before the factory is paid ${factoryBill}: you must fund ${cashGap} yourself until the balances arrive.`);
  if (o.depositPct < 100) notes.push("A deposit is a second payment: shoppers who put down a deposit can still refuse the balance. Check the pre-order and refund rules of each country you sell in.");
  if (netPerOrder <= o.landed) notes.push("Each order brings in less than a piece costs to make: the campaign loses money even when it is funded. Raise the price or cut the cost.");
  if (dayReached != null && dayReached > o.days) notes.push(`At ${o.visitorsPerDay} visitors a day the expected orders pass ${ordersNeeded} on day ${dayReached}, after your ${o.days}-day window: more traffic, a higher conversion or a longer window.`);
  if (range && range.visitorsNeededWorst == null) notes.push("The test had no orders, so it cannot bound the visitors needed: its range runs from zero. Run it longer before committing.");
  if (range && range.visitorsNeededWorst != null && range.visitorsNeededWorst > visitorsExpected) notes.push(`If the test's low end is right you need ${range.visitorsNeededWorst} visitors, more than the ${Math.round(visitorsExpected)} you expect.`);
  if (o.cpc && adSpendTotal > profitIfFunded && profitIfFunded > 0) notes.push("Planned ad spend is larger than the profit if funded.");
  if (breakEvenPrice != null && o.price < breakEvenPrice) notes.push(`Below ${breakEvenPrice} per piece the funded campaign loses money after fees, tax, set-up costs and traffic.`);

  let verdict;
  if (profitIfFunded <= 0 || netPerOrder <= o.landed) verdict = "stop";
  else if (pFunded >= 0.8) verdict = "go";
  else if (pFunded >= 0.4) verdict = "risky";
  else verdict = "unlikely";

  return {
    ordersNeeded, visitorsNeeded, adCost, range,
    netPerOrder: round2(netPerOrder), piecesMade: made,
    profitIfFunded, lossIfFails, cashFromDeposits, factoryBill, cashGap,
    ordersExpected: Math.round(ordersExpected * 10) / 10, visitorsExpected: Math.round(visitorsExpected),
    pFunded: Math.round(pFunded * 1000) / 1000,
    dayReached, breakEvenPrice, verdict, notes,
  };
}

/** Honest plain wording for each verdict. */
export const VERDICT_TEXT = Object.freeze({
  go: "Likely to fund on these numbers. Still a forecast: the conversion rate is your guess unless a test backs it.",
  risky: "About as likely as not. Test the conversion rate first, or widen the window.",
  unlikely: "Unlikely to reach the minimum on this traffic and conversion.",
  stop: "Loses money even if it funds. Change the price or the cost first.",
});
