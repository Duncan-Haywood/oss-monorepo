export function calculateTrueUp({ seatsPurchased, seatsUsed, monthlyPrice, monthsRemaining = 12 }) {
  const purchased = Number(seatsPurchased);
  const used = Number(seatsUsed);
  const price = Number(monthlyPrice);
  const months = Number(monthsRemaining);
  if (![purchased, used, price, months].every(Number.isFinite) || purchased < 0 || used < 0 || price < 0 || months < 0) {
    throw new Error('Values must be non-negative numbers');
  }
  if (used > purchased) throw new Error('Used seats cannot exceed purchased seats');
  const unused = purchased - used;
  const monthlyAvoidable = unused * price;
  return {
    purchased,
    used,
    unused,
    utilizationPercent: purchased === 0 ? 0 : (used / purchased) * 100,
    monthlyAvoidable,
    remainingAvoidable: monthlyAvoidable * months,
    annualAvoidable: monthlyAvoidable * 12,
  };
}

export function formatMoney(value, currency = '$') {
  return `${currency}${value.toFixed(2)}`;
}
