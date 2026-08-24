export function calculate({ seats, activeUsers, price, months, overageRate }) {
  const values = { seats, activeUsers, price, months, overageRate };
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${key} must be a non-negative number`);
  }
  const purchased = Math.floor(Number(seats));
  const active = Math.floor(Number(activeUsers));
  const monthlyPrice = Number(price);
  const termMonths = Number(months);
  const rate = Number(overageRate);
  const unusedSeats = Math.max(0, purchased - active);
  const overageSeats = Math.max(0, active - purchased);
  const monthlyWaste = unusedSeats * monthlyPrice;
  const termWaste = monthlyWaste * termMonths;
  const monthlyOverage = overageSeats * monthlyPrice * (1 + rate / 100);
  return {
    purchased, active, unusedSeats, overageSeats, monthlyWaste, termWaste,
    annualWaste: monthlyWaste * 12, monthlyOverage,
    recommendedSeats: active,
    savingsRate: purchased ? (unusedSeats / purchased) * 100 : 0,
  };
}

export function renewalBrief(input) {
  const result = calculate(input);
  const money = value => `$${value.toFixed(2)}`;
  const lines = [`SaaS seat renewal review`, `Current plan: ${result.purchased} seats; active users: ${result.active}.`];
  if (result.unusedSeats) lines.push(`Potential reduction: ${result.unusedSeats} seats, about ${money(result.termWaste)} over ${input.months} months.`);
  if (result.overageSeats) lines.push(`Potential overage: ${result.overageSeats} users, about ${money(result.monthlyOverage)} for the next month at the entered overage rate.`);
  if (!result.unusedSeats && !result.overageSeats) lines.push(`Current seats match active users; no seat-count variance appears in this scenario.`);
  lines.push(`Review vendor terms, billing dates, shared accounts, and user access before acting.`);
  return lines.join('\n');
}
