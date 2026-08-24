// Compares one item's economics across every channel in `channels.mjs`.
//
// The point of the tool is a decision, not a fee: a seller who already knows
// what an item costs and what it will fetch wants to know *where to list it*,
// and by how much that choice is worth. So every channel is run through the
// same arithmetic from one set of inputs, ranked by what the seller keeps.
//
// No network, no state, no rounding until display: this is arithmetic on the
// seller's own numbers, which they can check line by line against a statement.

import { CHANNELS } from "./channels.mjs";

function number(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

// Reduces a channel's declarative rates to the three quantities the arithmetic
// below needs. Splitting this out keeps `compareChannels` free of role checks
// and makes the per-channel breakdown available to the UI unchanged.
export function channelTerms(channel, input) {
  let percentRate = 0;
  let fixedFee = 0;
  let monthlyCost = 0;
  let monthlyOrders = null;
  const parts = [];
  for (const rate of channel.rates) {
    const value = number(input[rate.id] ?? rate.default, `${channel.label}: ${rate.label}`);
    if (rate.role === "percent") {
      percentRate += value / 100;
      parts.push({ label: rate.label, kind: "percent", value });
    } else if (rate.role === "fixed") {
      fixedFee += value;
      parts.push({ label: rate.label, kind: "fixed", value });
    } else if (rate.role === "monthlyCost") {
      monthlyCost = value;
    } else if (rate.role === "monthlyOrders") {
      monthlyOrders = value;
    }
  }
  if (monthlyCost > 0 && !(monthlyOrders > 0)) {
    throw new Error(`${channel.label}: orders per month must be greater than zero when a monthly cost is included`);
  }
  const allocatedMonthlyCost = monthlyCost > 0 ? monthlyCost / monthlyOrders : 0;
  return { percentRate, fixedFee, allocatedMonthlyCost, parts };
}

export function compareChannels(input, channels = CHANNELS) {
  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged ?? 0, "Shipping charged");
  const costOfGoods = number(input.costOfGoods ?? 0, "Cost of goods");
  const shippingCost = number(input.shippingCost ?? 0, "Shipping label cost");
  const packagingCost = number(input.packagingCost ?? 0, "Packaging cost");
  const otherCost = number(input.otherCost ?? 0, "Other cost");
  const targetMargin = number(input.targetMargin ?? 0, "Target net margin");
  if (targetMargin >= 100) throw new Error("Target net margin must be less than 100%");
  if (!channels.length) throw new Error("At least one channel is required");

  const revenue = price + shippingCharged;
  // Cash laid out before the sale, identical on every channel. Fees come out of
  // the proceeds rather than the seller's pocket, so they are deliberately not
  // counted as invested cash — that is what keeps ROI comparable across
  // channels whose fees differ wildly.
  const sharedCash = costOfGoods + shippingCost + packagingCost + otherCost;
  const targetMarginRate = targetMargin / 100;

  const results = channels.map(channel => {
    const { percentRate, fixedFee, allocatedMonthlyCost, parts } = channelTerms(channel, input);
    const cashInvested = sharedCash + allocatedMonthlyCost;
    const feeTotal = revenue * percentRate + fixedFee;
    const profit = revenue - feeTotal - cashInvested;
    // Cash that has to be recovered before the percentage fees are covered.
    const fixedCash = fixedFee + cashInvested;
    const targetDenominator = 1 - percentRate - targetMarginRate;
    return {
      id: channel.id,
      label: channel.label,
      note: channel.note,
      parts,
      percentRate,
      fixedFee,
      allocatedMonthlyCost,
      cashInvested,
      feeTotal,
      profit,
      margin: revenue === 0 ? 0 : (profit / revenue) * 100,
      // Undefined rather than infinite when no cash was invested at all.
      roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
      breakEvenPrice: percentRate >= 1
        ? Infinity
        : Math.max(0, fixedCash / (1 - percentRate) - shippingCharged),
      targetMarginPrice: targetDenominator <= 0
        ? Infinity
        : Math.max(0, fixedCash / targetDenominator - shippingCharged),
    };
  });

  const ranked = [...results].sort((a, b) => b.profit - a.profit || a.label.localeCompare(b.label));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  for (const result of ranked) {
    result.profitVsBest = result.profit - best.profit;
    // What this channel would have to charge to leave the seller as well off as
    // the best channel does at the current price. The number that turns the
    // comparison into a repricing decision instead of a verdict.
    result.priceToMatchBest = result.percentRate >= 1
      ? Infinity
      : Math.max(0, (best.profit + result.fixedFee + result.cashInvested) / (1 - result.percentRate) - shippingCharged);
  }

  return {
    revenue,
    sharedCash,
    ranked,
    best,
    worst,
    // What the channel choice is worth on this one order.
    spread: best.profit - worst.profit,
  };
}
