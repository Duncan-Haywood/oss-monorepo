export function calculateQuote(input) {
  const n = (value) => Math.max(0, Number(value) || 0);
  const serviceHours = n(input.serviceHours);
  const travelHours = n(input.travelHours);
  const setupHours = n(input.setupHours);
  const cleanupHours = n(input.cleanupHours);
  const totalHours = serviceHours + travelHours + setupHours + cleanupHours;
  const loadedLaborRate = n(input.wage) * (1 + n(input.burdenPercent) / 100);
  const laborCost = totalHours * loadedLaborRate;
  const supplyCost = n(input.supplies);
  const vehicleCost = n(input.vehicleCost);
  const directCost = laborCost + supplyCost + vehicleCost;
  const overheadCost = directCost * n(input.overheadPercent) / 100;
  const cost = directCost + overheadCost;
  const margin = Math.min(99, n(input.targetMarginPercent));
  const recommendedPrice = cost / (1 - margin / 100);
  const proposedPrice = n(input.proposedPrice);
  return { totalHours, loadedLaborRate, laborCost, supplyCost, vehicleCost, directCost, overheadCost, cost, recommendedPrice, proposedPrice, profit: proposedPrice - cost, effectiveRate: proposedPrice / (totalHours || 1), marginAtProposed: proposedPrice ? (proposedPrice - cost) / proposedPrice * 100 : 0 };
}
