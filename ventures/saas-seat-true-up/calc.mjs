export function calculateTrueUp({ seatsPurchased, seatsUsed, monthlyPrice, monthsRemaining = 12 }) {
  const purchased = Number(seatsPurchased);
  const used = Number(seatsUsed);
  const price = Number(monthlyPrice);
  const months = Number(monthsRemaining);
  if (![purchased, used, price, months].every(Number.isFinite) || purchased < 0 || used < 0 || price < 0 || months < 0) {
    throw new Error('Values must be non-negative numbers');
  }
  const unused = Math.max(0, purchased - used);
  const extra = Math.max(0, used - purchased);
  const monthlyAvoidable = unused * price;
  const monthlyOverage = extra * price;
  return {
    purchased,
    used,
    unused,
    extra,
    utilizationPercent: purchased === 0 ? (used === 0 ? 0 : Infinity) : (used / purchased) * 100,
    monthlyAvoidable,
    remainingAvoidable: monthlyAvoidable * months,
    annualAvoidable: monthlyAvoidable * 12,
    monthlyOverage,
    remainingOverage: monthlyOverage * months,
    annualOverage: monthlyOverage * 12,
  };
}

export function formatMoney(value, currency = '$') {
  return `${currency}${value.toFixed(2)}`;
}

export function reviewMessage(result) {
  if (result.extra > 0) {
    return `This review is over the purchased count by ${result.extra} seat${result.extra === 1 ? '' : 's'}. That is ${formatMoney(result.annualOverage)} of extra annual spend if the overage continues, or ${formatMoney(result.remainingOverage)} through the remaining term.`;
  }
  return `A seat review could release ${formatMoney(result.annualAvoidable)} over a full year if the unused seats are not renewed.`;
}
