const defaults = {
  targetPrice: 180,
  laborHours: 3,
  travelMiles: 24,
  vehicleRate: 0.67,
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
  const travelMiles = value('travelMiles');
  const vehicleRate = value('vehicleRate');
  const supplies = value('supplies');
  const overhead = value('overhead');
  const paymentRate = value('paymentRate');
  const targetMargin = value('targetMargin');
  if (paymentRate >= 100) throw new Error('Payment fee must be below 100%');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%');
  if (laborHours === 0) throw new Error('Labor hours must be greater than zero');

  const travelCost = travelMiles * vehicleRate;
  const directCosts = supplies + overhead + travelCost;
  const paymentFee = targetPrice * paymentRate / 100;
  const totalCost = directCosts + paymentFee;
  const contribution = targetPrice - totalCost;
  const margin = targetPrice === 0 ? 0 : contribution / targetPrice * 100;
  const breakEven = directCosts / (1 - paymentRate / 100);
  const targetQuote = directCosts / (1 - paymentRate / 100 - targetMargin / 100);
  return { targetPrice, laborHours, travelMiles, vehicleRate, supplies, overhead, paymentRate, targetMargin,
    travelCost, directCosts, paymentFee, totalCost, contribution, margin, breakEven, targetQuote,
    effectiveHourly: contribution / laborHours };
}

export { defaults };
