// Same-ticket restaurant margin arithmetic across dine-in, pickup, and
// delivery apps. No network, no stored rate schedule: every commission and
// cost is an input. The presets below are illustrative starting points an
// operator is expected to replace with the numbers on their own statements.
// That keeps the output a transparent calculation they can check rather than
// a claim about any marketplace's current published fees.

/**
 * Illustrative defaults for the paths a ticket most often takes. Fee *shapes*
 * differ in ways a flat "DoorDash takes 30%" page hides:
 *
 *   - marketplace commission is usually a percentage of the order total and
 *     often bundles payment processing,
 *   - dine-in and pickup still pay card processing,
 *   - packaging and the extra minutes to bag a delivery order are cash the
 *     restaurant spends whether or not the app takes a cut,
 *   - first-party delivery swaps commission for a driver cost.
 *
 * `commissionRate` and `paymentRate` apply to the listed price. An operator
 * whose contract differs can zero one field and fold the rate into the other.
 */
export const CHANNEL_PRESETS = [
  {
    id: "dine-in",
    label: "Dine-in",
    note: "No marketplace commission. Card processing is usually the only platform fee. Packaging and extra delivery labor start at zero.",
    commissionRate: 0,
    paymentRate: 2.9,
    paymentFixed: 0.3,
    packagingCost: 0,
    extraLaborMinutes: 0,
    deliveryCost: 0,
  },
  {
    id: "pickup",
    label: "Pickup / takeout",
    note: "Same ticket, no marketplace cut, a bit of packaging and a few extra bagging minutes.",
    commissionRate: 0,
    paymentRate: 2.9,
    paymentFixed: 0.3,
    packagingCost: 0.4,
    extraLaborMinutes: 3,
    deliveryCost: 0,
  },
  {
    id: "doordash",
    label: "DoorDash",
    note: "Marketplace commission is usually a percentage of the order total and often includes payment processing. Plans range widely — replace this with the rate on your statement.",
    commissionRate: 27,
    paymentRate: 0,
    paymentFixed: 0,
    packagingCost: 1.25,
    extraLaborMinutes: 8,
    deliveryCost: 0,
  },
  {
    id: "ubereats",
    label: "Uber Eats",
    note: "Commission is typically a percentage of the order. Some plans add a separate processing fee — put that in the payment-rate field if yours does.",
    commissionRate: 30,
    paymentRate: 0,
    paymentFixed: 0,
    packagingCost: 1.25,
    extraLaborMinutes: 8,
    deliveryCost: 0,
  },
  {
    id: "grubhub",
    label: "Grubhub",
    note: "Commission varies by plan and market. The default here is a single bundled percentage; split processing out if your statement does.",
    commissionRate: 25,
    paymentRate: 0,
    paymentFixed: 0,
    packagingCost: 1.25,
    extraLaborMinutes: 8,
    deliveryCost: 0,
  },
  {
    id: "first-party",
    label: "Your own driver",
    note: "No marketplace commission — you pay card processing, packaging, bagging time, and whatever the driver costs on this ticket.",
    commissionRate: 0,
    paymentRate: 2.9,
    paymentFixed: 0.3,
    packagingCost: 1.25,
    extraLaborMinutes: 8,
    deliveryCost: 4.5,
  },
  {
    id: "other",
    label: "Other channel",
    note: "Blank and switched off by default. Turn it on for a second DoorDash plan, Toast Takeout, a hotel portal, or any path not listed.",
    commissionRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
    packagingCost: 0,
    extraLaborMinutes: 0,
    deliveryCost: 0,
    enabled: false,
  },
];

function number(value, name, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function wholeNumber(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

function priceForTarget(targetProfit, percentRate, paymentFixed, cashCosts) {
  const target = Number(targetProfit);
  if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
  return Math.max(0, (target + paymentFixed + cashCosts) / (1 - percentRate));
}

/**
 * Net result for one path, given the shared ticket facts.
 *
 * `shared` carries what does not change with the channel (food cost, wage,
 * the dine-in menu price used as the default listed price). A channel can
 * override the listed price so a marked-up DoorDash menu can be compared
 * against the in-house ticket.
 */
export function calculateChannel(channel, shared = {}) {
  if (!channel || typeof channel !== "object") throw new Error("A channel is required");
  const label = channel.label ?? channel.id ?? "Channel";

  const listedPrice = number(channel.listedPrice, `${label} listed price`, shared.ticketPrice);
  const foodCost = number(shared.foodCost, "Food cost", 0);
  const hourlyWage = number(shared.hourlyWage, "Hourly wage", 0);
  const monthlyOrders = wholeNumber(shared.monthlyOrders, "Orders per month", 0);

  const commissionRate = number(channel.commissionRate, `${label} commission rate`, 0);
  const paymentRate = number(channel.paymentRate, `${label} payment rate`, 0);
  const paymentFixed = number(channel.paymentFixed, `${label} payment fixed fee`, 0);
  const packagingCost = number(channel.packagingCost, `${label} packaging cost`, 0);
  const extraLaborMinutes = number(channel.extraLaborMinutes, `${label} extra labor minutes`, 0);
  const deliveryCost = number(channel.deliveryCost, `${label} delivery cost`, 0);

  const percentRate = (commissionRate + paymentRate) / 100;
  if (percentRate >= 1) {
    throw new Error(`${label}: commission and payment rates add up to 100% or more of the ticket`);
  }

  const revenue = listedPrice;
  const laborCost = (extraLaborMinutes / 60) * hourlyWage;
  const fees = {
    commission: (revenue * commissionRate) / 100,
    payment: (revenue * paymentRate) / 100 + paymentFixed,
  };
  const feeTotal = fees.commission + fees.payment;
  const cashCosts = foodCost + packagingCost + laborCost + deliveryCost;
  const profit = revenue - feeTotal - cashCosts;

  return {
    id: channel.id ?? null,
    label,
    note: channel.note ?? null,
    listedPrice,
    revenue,
    fees,
    feeTotal,
    foodCost,
    packagingCost,
    laborCost,
    deliveryCost,
    cashCosts,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    foodCostPct: revenue === 0 ? 0 : (foodCost / revenue) * 100,
    percentRate: percentRate * 100,
    paymentFixed,
    monthlyOrders,
    monthlyProfit: profit * monthlyOrders,
    monthlyFees: feeTotal * monthlyOrders,
    breakEvenPrice: priceForTarget(0, percentRate, paymentFixed, cashCosts),
    /**
     * Listed price this channel needs, holding costs constant, to clear
     * `targetProfit`. This is the number that turns a comparison into a
     * menu decision: "to keep the same $21.17 as dine-in, list this at $47.15
     * on DoorDash."
     */
    priceForProfit(targetProfit) {
      return priceForTarget(targetProfit, percentRate, paymentFixed, cashCosts);
    },
    /**
     * Commission percentage that would leave `targetProfit` at the current
     * listed price, holding the payment-rate and cash costs constant.
     * Null when revenue is zero (the question has no answer). Negative when
     * extra cash (packaging, labor, driver) already exceeds the gap — the
     * listed price has to rise; cutting commission cannot close it.
     */
    commissionToMatch(targetProfit) {
      const target = Number(targetProfit);
      if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
      if (revenue === 0) return null;
      return 100 * (1 - (target + fees.payment + cashCosts) / revenue) - 0;
    },
  };
}

/**
 * Rank every path on the same ticket. `channels` are preset-shaped objects;
 * anything an operator edited is already on them, anything they left alone
 * falls back to `shared`. A channel carrying `enabled: false` is left out of
 * the ranking rather than shown as an unreachable option.
 */
export function compareChannels(channels, shared = {}) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("At least one channel is required");
  }
  const active = channels.filter((channel) => channel?.enabled !== false);
  if (active.length === 0) throw new Error("Switch on at least one channel to compare");
  const results = active.map((channel) => calculateChannel(channel, shared));
  const best = results.reduce((winner, result) => (result.profit > winner.profit ? result : winner));
  const dineIn = results.find((result) => result.id === "dine-in") ?? null;

  const ranked = [...results].sort((a, b) => b.profit - a.profit);
  const rankByResult = new Map(ranked.map((result, index) => [result, index + 1]));

  return {
    results: results.map((result) => {
      const priceToMatchBest = result === best ? null : result.priceForProfit(best.profit);
      const priceToMatchDineIn =
        dineIn && result !== dineIn ? result.priceForProfit(dineIn.profit) : null;
      const markupVsDineIn =
        dineIn && priceToMatchDineIn !== null && dineIn.listedPrice > 0
          ? ((priceToMatchDineIn / dineIn.listedPrice) - 1) * 100
          : null;
      const commissionToMatchDineIn =
        dineIn && result !== dineIn ? result.commissionToMatch(dineIn.profit) : null;
      return {
        ...result,
        rank: rankByResult.get(result),
        isBest: result === best,
        gapVsBest: best.profit - result.profit,
        monthlyGapVsBest: (best.profit - result.profit) * result.monthlyOrders,
        priceToMatchBest,
        priceToMatchDineIn,
        markupVsDineIn,
        commissionToMatchDineIn,
        gapVsDineIn: dineIn ? dineIn.profit - result.profit : null,
        monthlyGapVsDineIn: dineIn ? (dineIn.profit - result.profit) * result.monthlyOrders : null,
      };
    }),
    ranked: ranked.map((result) => result.label),
    best: {
      id: best.id,
      label: best.label,
      profit: best.profit,
      margin: best.margin,
    },
    dineIn: dineIn
      ? { id: dineIn.id, label: dineIn.label, profit: dineIn.profit, listedPrice: dineIn.listedPrice }
      : null,
    // How much the path choice is worth on this one ticket, before any
    // difference in how many orders each path actually produces.
    spread: best.profit - ranked[ranked.length - 1].profit,
  };
}
