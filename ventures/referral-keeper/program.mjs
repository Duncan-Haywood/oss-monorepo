// Programme planner: what a referral programme will cost, month by month.
// Browser-safe (no Node imports). Expected values, not a forecast: customers
// leave at a constant monthly rate and a share of first payments is refunded.
//
// in: {price (per month, any currency unit), billing: "monthly"|"annual", percent, months (0 = lifetime),
//      newPerMonth, horizon, churn (0-1 per month), refundRate (0-1 of first payments), holdDays, toolFee (per month)}
export function simulate(inp) {
  const p = {
    price: 0, billing: "monthly", percent: 20, months: 12, newPerMonth: 5, horizon: 24, churn: 0.04, refundRate: 0.03, holdDays: 30, toolFee: 0, ...inp,
  };
  const H = Math.max(1, Math.min(120, Math.floor(p.horizon)));
  const annual = p.billing === "annual";
  const window = p.months > 0 ? p.months : Infinity;
  const rows = [];
  let cumRev = 0, cumCom = 0, cumPaid = 0;
  const payLag = Math.ceil(p.holdDays / 30);
  const earnedBy = new Array(H + payLag + 1).fill(0);
  for (let m = 0; m < H; m++) {
    let revenue = 0, commission = 0, active = 0;
    // cohort joined in month c (customers p.newPerMonth), age a = m - c months
    for (let c = 0; c <= m; c++) {
      const age = m - c;
      const alive = Math.pow(1 - p.churn, age);
      active += p.newPerMonth * alive;
      const bills = annual ? age % 12 === 0 : true;
      if (!bills) continue;
      const amount = p.price * (annual ? 12 : 1);
      // first payments are refunded at refundRate, and that commission is clawed back
      const kept = age === 0 ? 1 - p.refundRate : 1;
      const payers = p.newPerMonth * alive * kept;
      revenue += payers * amount;
      // commission window counts months since the first payment, for both billing cycles
      if (age < window) commission += payers * amount * (p.percent / 100);
    }
    cumRev += revenue; cumCom += commission;
    earnedBy[m + payLag] += commission;
    cumPaid += earnedBy[m];
    rows.push({ month: m + 1, active, revenue, commission, cumRevenue: cumRev, cumCommission: cumCom, paidOut: cumPaid, owed: cumCom - cumPaid });
  }
  const toolCost = p.toolFee * H;
  return {
    rows,
    totalRevenue: cumRev,
    totalCommission: cumCom,
    effectiveRate: cumRev > 0 ? cumCom / cumRev : 0,
    netAfterCommission: cumRev - cumCom,
    toolCost,
    lifetimeCommissionPerCustomer: lifetimePerCustomer(p, window),
  };
}

// Commission a single referred customer generates over their whole expected life.
export function lifetimePerCustomer(p, window = p.months > 0 ? p.months : Infinity) {
  const annual = p.billing === "annual";
  let sum = 0;
  const cap = Number.isFinite(window) ? window : 600;
  for (let age = 0; age < cap; age++) {
    if (annual && age % 12 !== 0) continue;
    const alive = Math.pow(1 - p.churn, age);
    if (alive < 1e-6) break;
    sum += alive * (age === 0 ? 1 - p.refundRate : 1) * p.price * (annual ? 12 : 1) * (p.percent / 100);
  }
  return sum;
}
