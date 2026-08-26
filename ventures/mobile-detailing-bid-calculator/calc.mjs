const defaults = {
  targetPrice: 180,
  laborHours: 3,
  travelHours: 0.75,
  setupHours: 0.25,
  cleanupHours: 0.25,
  travelMiles: 24,
  vehicleRate: 0.67,
  wage: 0,
  burdenPercent: 25,
  supplies: 18,
  overhead: 12,
  paymentRate: 3,
  targetMargin: 35,
};

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
}

export function calculateBid(input = {}) {
  const value = name => nonNegative(input[name] ?? defaults[name], name);
  const targetPrice = value('targetPrice');
  const laborHours = value('laborHours');
  const travelHours = value('travelHours');
  const setupHours = value('setupHours');
  const cleanupHours = value('cleanupHours');
  const travelMiles = value('travelMiles');
  const vehicleRate = value('vehicleRate');
  const wage = value('wage');
  const burdenPercent = value('burdenPercent');
  const supplies = value('supplies');
  const overhead = value('overhead');
  const paymentRate = value('paymentRate');
  const targetMargin = value('targetMargin');
  if (paymentRate >= 100) throw new Error('Payment fee must be below 100%');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%');
  if (laborHours === 0) throw new Error('Labor hours must be greater than zero');

  const totalHours = laborHours + travelHours + setupHours + cleanupHours;
  const loadedLaborRate = wage * (1 + burdenPercent / 100);
  const laborCost = totalHours * loadedLaborRate;
  const travelCost = travelMiles * vehicleRate;
  const directCosts = supplies + overhead + travelCost + laborCost;
  const paymentFee = targetPrice * paymentRate / 100;
  const totalCost = directCosts + paymentFee;
  const contribution = targetPrice - totalCost;
  const margin = targetPrice === 0 ? 0 : contribution / targetPrice * 100;
  const breakEven = directCosts / (1 - paymentRate / 100);
  const targetQuote = directCosts / (1 - paymentRate / 100 - targetMargin / 100);
  const proposedPrice = targetPrice;
  return {
    targetPrice, laborHours, travelHours, setupHours, cleanupHours, totalHours,
    travelMiles, vehicleRate, wage, burdenPercent, loadedLaborRate, laborCost,
    supplies, overhead, paymentRate, targetMargin,
    travelCost, directCosts, paymentFee, totalCost, contribution, margin, breakEven, targetQuote,
    proposedPrice, profit: proposedPrice - totalCost,
    marginAtProposed: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
    effectiveHourly: contribution / laborHours,
    effectiveRate: totalHours === 0 ? 0 : contribution / totalHours,
  };
}

export { defaults };
