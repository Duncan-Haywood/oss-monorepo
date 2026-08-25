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
  const overhead = n(input.overheadPercent) / 100;
  const targetMargin = Math.min(0.99, Math.max(0, n(input.targetMarginPercent) / 100));
  const loadedLabor = hours * wage * (1 + burden);
  const directCost = loadedLabor + materials + subcontractor;
  const overheadCost = directCost * overhead;
  const walkAwayPrice = directCost + overheadCost;
  const targetPrice = walkAwayPrice / (1 - targetMargin);
  const proposedPrice = n(input.proposedPrice);
  const proposedProfit = proposedPrice - walkAwayPrice;
  const proposedMargin = proposedPrice ? proposedProfit / proposedPrice : 0;
  return {
    hours, loadedLabor, directCost, overheadCost, walkAwayPrice, targetPrice,
    proposedPrice, proposedProfit, proposedMargin,
    belowCost: proposedPrice > 0 && proposedPrice < walkAwayPrice,
    targetMet: proposedPrice > 0 && proposedMargin >= targetMargin,
  };
}

export function summaryText(input, result) {
  const money = (value) => `$${value.toFixed(2)}`;
  const label = input.title?.trim() || 'Scope change';
  return `${label}\nAdded work: ${result.hours.toFixed(2)} labor hours\n` +
    `Target change-order price: ${money(result.targetPrice)}\n` +
    `Walk-away price: ${money(result.walkAwayPrice)}\n` +
    `Estimated added cost: ${money(result.walkAwayPrice)}\n` +
    `Proposed price: ${money(result.proposedPrice)}\n` +
    `Estimated margin at proposed price: ${(result.proposedMargin * 100).toFixed(1)}%\n` +
    `Review labor, materials, schedule, and customer approval before proceeding.`;
}
