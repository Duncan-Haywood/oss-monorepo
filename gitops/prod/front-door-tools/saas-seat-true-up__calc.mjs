export function calculateTrueUp({ seatsPurchased, seatsUsed, monthlyPrice, monthsRemaining = 12, overageRatePct = 0, seatMinimum = 0 }) {
  const purchased = Number(seatsPurchased);
  const used = Number(seatsUsed);
  const price = Number(monthlyPrice);
  const months = Number(monthsRemaining);
  const overageRate = Number(overageRatePct);
  const minimum = Number(seatMinimum);
  if (![purchased, used, price, months, overageRate, minimum].every(Number.isFinite) || purchased < 0 || used < 0 || price < 0 || months < 0 || overageRate < 0 || minimum < 0) {
    throw new Error('Values must be non-negative numbers');
  }
  const unused = Math.max(0, purchased - used);
  const extra = Math.max(0, used - purchased);
  // A contracted seat minimum means unused seats below that floor cannot
  // actually be dropped at renewal -- the vendor bills for them either way.
  // droppableSeats is what a true-up can realistically remove; lockedByMinimum
  // is the unused seats the minimum still forces you to keep paying for.
  const droppableSeats = Math.max(0, purchased - Math.max(used, minimum));
  const lockedByMinimum = unused - droppableSeats;
  const monthlyAvoidable = droppableSeats * price;
  // Vendor overage is often list price plus a contracted premium. 0% keeps
  // the same-price default so existing worksheets stay comparable.
  const monthlyOverage = extra * price * (1 + overageRate / 100);
  return {
    purchased,
    used,
    unused,
    extra,
    overageRatePct: overageRate,
    seatMinimum: minimum,
    droppableSeats,
    lockedByMinimum,
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
    const premium = result.overageRatePct > 0
      ? ` at the entered ${result.overageRatePct}% overage premium`
      : '';
    return `This review is over the purchased count by ${result.extra} seat${result.extra === 1 ? '' : 's'}${premium}. That is ${formatMoney(result.annualOverage)} of extra annual spend if the overage continues, or ${formatMoney(result.remainingOverage)} through the remaining term.`;
  }
  if (result.lockedByMinimum > 0) {
    return `${result.unused} seat${result.unused === 1 ? ' is' : 's are'} unused, but the contracted ${result.seatMinimum}-seat minimum locks in ${result.lockedByMinimum} of them regardless. Only ${result.droppableSeats} seat${result.droppableSeats === 1 ? '' : 's'} can actually be dropped: ${formatMoney(result.annualAvoidable)} over a full year if those go.`;
  }
  return `A seat review could release ${formatMoney(result.annualAvoidable)} over a full year if the unused seats are not renewed.`;
}
