// Change-order pricing for a contractor.
//
// TWO THINGS THAT COST REAL MONEY AND HAD NO FIELD
//
// The calculator priced the *work* in a change order and nothing else, which
// is where change orders are lost rather than where they are won:
//
//   * DELAY. Added scope that pushes the schedule keeps the supervisor, the
//     trailer, and the rented equipment on site for days nobody billed for.
//     Extended general conditions are routinely absorbed by the contractor
//     because they were never in the change order to begin with.
//   * THE CONTRACT'S MARKUP CAP. Most construction contracts cap change-order
//     markup ("cost plus 10%", "15% on subcontracted work"), which means the
//     target margin a contractor enters here may simply not be available to
//     them. Worse, the cap is on *cost* while their own overhead comes out of
//     the same allowance: at a 10% cap and 10% overhead the change order earns
//     nothing at all, and it takes an explicit line to see that. Zero means no
//     cap, so a contract without one behaves exactly as before.
export function calculateChangeOrder(input) {
  const n = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  };
  const hours = n(input.hours);
  const wage = n(input.wage);
  const burden = n(input.burdenPercent) / 100;
  const materials = n(input.materials);
  const subcontractor = n(input.subcontractor);
  const daysAdded = n(input.daysAdded);
  const dailyGeneralConditions = n(input.dailyGeneralConditions);
  const markupCapPercent = n(input.markupCapPercent);
  const overhead = n(input.overheadPercent) / 100;
  const targetMargin = Math.min(0.99, Math.max(0, n(input.targetMarginPercent) / 100));
  const loadedLabor = hours * wage * (1 + burden);
  // Extended general conditions: supervision, the trailer, rented plant --
  // time-based cost the added scope keeps on site. A direct cost of the change
  // order, so overhead and margin are carried on it like any other.
  const delayCost = daysAdded * dailyGeneralConditions;
  const directCost = loadedLabor + materials + subcontractor + delayCost;
  const overheadCost = directCost * overhead;
  const walkAwayPrice = directCost + overheadCost;
  const targetPrice = walkAwayPrice / (1 - targetMargin);
  // The most the contract permits, and what is actually left after the
  // contractor's own overhead comes out of that same allowance. `marginAtCap`
  // is the number worth reading: a cap at or below the overhead rate makes
  // every change order on this contract a break-even or a loss, however the
  // target margin is set.
  const capped = markupCapPercent > 0;
  const cappedPrice = capped ? directCost * (1 + markupCapPercent / 100) : null;
  const marginAtCap = capped && cappedPrice > 0 ? (cappedPrice - walkAwayPrice) / cappedPrice : null;

  const proposedPrice = n(input.proposedPrice);
  const proposedProfit = proposedPrice - walkAwayPrice;
  const proposedMargin = proposedPrice ? proposedProfit / proposedPrice : 0;
  return {
    hours, loadedLabor, directCost, overheadCost, walkAwayPrice, targetPrice,
    proposedPrice, proposedProfit, proposedMargin,
    daysAdded, dailyGeneralConditions, delayCost,
    markupCapPercent, cappedPrice, marginAtCap,
    capBlocksTarget: capped && cappedPrice < targetPrice,
    capBelowCost: capped && cappedPrice < walkAwayPrice,
    belowCost: proposedPrice > 0 && proposedPrice < walkAwayPrice,
    targetMet: proposedPrice > 0 && proposedMargin >= targetMargin,
  };
}

export function summaryText(input, result) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const label = input.title?.trim() || 'Scope change';
  return `${label}\nAdded work: ${result.hours.toFixed(2)} labor hours\n` +
    `Estimated added cost (labor, materials, subcontractor, schedule): ${money(result.directCost)}\n` +
    `Walk-away price (added cost + overhead): ${money(result.walkAwayPrice)}\n` +
    `Target change-order price: ${money(result.targetPrice)}\n` +
    `Proposed price: ${money(result.proposedPrice)}\n` +
    `Estimated margin at proposed price: ${(result.proposedMargin * 100).toFixed(1)}%\n` +
    (result.delayCost > 0
      ? `Extended general conditions: ${result.daysAdded} day(s) at ${money(result.dailyGeneralConditions)}/day = ${money(result.delayCost)}\n`
      : '') +
    (result.cappedPrice !== null
      ? `Contract markup cap ${result.markupCapPercent}%: most billable is ${money(result.cappedPrice)}, leaving ${(result.marginAtCap * 100).toFixed(1)}% after overhead\n`
      : '') +
    `Review labor, materials, schedule, and customer approval before proceeding.`;
}
