// Boba / bubble tea / specialty drink shop pro forma: contribution per cup, monthly profit, break-even cups a day
// (with the loan), the price that reaches a target margin, a volume sweep, and a 60-month ramp-up with cash reserve.
// Pure functions; no DOM. Bad input is rejected, never clamped.

export const money = (n) => Math.round(n * 100) / 100;

export function sampleInput() {
  return {
    price: 5.75, toppingAttachPct: 70, toppingPrice: 0.75,
    drinkCost: 0.95, toppingCost: 0.22, packagingCost: 0.38, wastePct: 6,
    cardFeePct: 2.9, deliverySharePct: 20, deliveryCommissionPct: 25, royaltyPct: 0,
    cupsPerDay: 270, daysPerMonth: 28,
    staffHoursPerDay: 26, wage: 16, payrollTaxPct: 10,
    rent: 4200, utilities: 750, otherFixed: 900, ownerPay: 3000,
    startupCost: 165000, equity: 55000, loanRatePct: 9, loanTermMonths: 84,
    rampMonths: 9, startVolumePct: 40, targetMarginPct: 12,
  };
}

const FIELDS = {
  price: [0, 1e6], toppingAttachPct: [0, 100], toppingPrice: [0, 1e6], drinkCost: [0, 1e6], toppingCost: [0, 1e6],
  packagingCost: [0, 1e6], wastePct: [0, 100], cardFeePct: [0, 100], deliverySharePct: [0, 100], deliveryCommissionPct: [0, 100],
  royaltyPct: [0, 100], cupsPerDay: [0, 1e6], daysPerMonth: [0, 31], staffHoursPerDay: [0, 1000], wage: [0, 1e6],
  payrollTaxPct: [0, 100], rent: [0, 1e9], utilities: [0, 1e9], otherFixed: [0, 1e9], ownerPay: [0, 1e9],
  startupCost: [0, 1e10], equity: [0, 1e10], loanRatePct: [0, 100], loanTermMonths: [1, 600], rampMonths: [1, 60],
  startVolumePct: [0, 100], targetMarginPct: [0, 99],
};

// Returns an error string for the first field that is blank, not a number, or outside its range; otherwise null.
export function validate(i) {
  for (const [k, [lo, hi]] of Object.entries(FIELDS)) {
    const raw = i[k];
    if (raw === "" || raw === null || raw === undefined) return `${k} is empty. Enter a number.`;
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${k} is not a number.`;
    if (n < lo || n > hi) return `${k} must be between ${lo} and ${hi}.`;
  }
  return null;
}

const nums = (i) => Object.fromEntries(Object.keys(FIELDS).map((k) => [k, Number(i[k])]));

// Standard amortising payment; zero rate is straight-line.
export function monthlyPayment(principal, ratePct, months) {
  if (principal <= 0) return 0;
  const r = ratePct / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
}

// Per-cup economics. revenue = drink price plus the average topping take. Percent costs apply to that revenue.
export function perCup(x) {
  const revenue = x.price + (x.toppingAttachPct / 100) * x.toppingPrice;
  const ingredients = (x.drinkCost + (x.toppingAttachPct / 100) * x.toppingCost + x.packagingCost) * (1 + x.wastePct / 100);
  const pctCosts = x.cardFeePct / 100 + (x.deliverySharePct / 100) * (x.deliveryCommissionPct / 100) + x.royaltyPct / 100;
  const percent = revenue * pctCosts;
  return { revenue, ingredients, percent, contribution: revenue - ingredients - percent, pctCosts };
}

export function fixedMonthly(x) {
  const labour = x.staffHoursPerDay * x.daysPerMonth * x.wage * (1 + x.payrollTaxPct / 100);
  return { labour, fixed: labour + x.rent + x.utilities + x.otherFixed + x.ownerPay };
}

function monthProfit(x, pc, fixed, pmt, cupsPerDay) {
  return cupsPerDay * x.daysPerMonth * pc.contribution - fixed - pmt;
}

export function analyze(input) {
  const err = validate(input);
  if (err) return { error: err };
  const x = nums(input);
  const pc = perCup(x);
  const { labour, fixed } = fixedMonthly(x);
  const principal = Math.max(0, x.startupCost - x.equity);
  const pmt = monthlyPayment(principal, x.loanRatePct, x.loanTermMonths);
  const cupsMonth = x.cupsPerDay * x.daysPerMonth;
  const revenueMonth = cupsMonth * pc.revenue;
  const operating = cupsMonth * pc.contribution - fixed;
  const net = operating - pmt;
  const perDayContribution = x.daysPerMonth * pc.contribution;
  const breakEvenCupsDay = perDayContribution > 0 ? Math.ceil((fixed + pmt) / perDayContribution) : null;
  const breakEvenOperatingCupsDay = perDayContribution > 0 ? Math.ceil(fixed / perDayContribution) : null;
  const netMarginPct = revenueMonth > 0 ? (net / revenueMonth) * 100 : null;
  const marginOfSafetyPct = breakEvenCupsDay && x.cupsPerDay > 0 ? ((x.cupsPerDay - breakEvenCupsDay) / x.cupsPerDay) * 100 : null;

  // Drink price that yields the target net margin at the entered volume. Closed form: with revenue/cup R = price + topping take,
  // profit = N(R(1-v) - c) - F - pmt and target = m N R, so R = (c + (F+pmt)/N) / (1 - v - m).
  let targetPrice = null;
  const denom = 1 - pc.pctCosts - x.targetMarginPct / 100;
  if (cupsMonth > 0 && denom > 0) {
    const R = (pc.ingredients + (fixed + pmt) / cupsMonth) / denom;
    targetPrice = R - (x.toppingAttachPct / 100) * x.toppingPrice;
  }

  const sweep = [-30, -20, -10, 0, 10, 20].map((p) => {
    const cups = x.cupsPerDay * (1 + p / 100);
    return { changePct: p, cupsPerDay: cups, net: monthProfit(x, pc, fixed, pmt, cups) };
  });
  const costShock = [0, 5, 10, 15].map((p) => {
    const shocked = { ...x, drinkCost: x.drinkCost * (1 + p / 100), toppingCost: x.toppingCost * (1 + p / 100), packagingCost: x.packagingCost * (1 + p / 100) };
    return { changePct: p, net: monthProfit(shocked, perCup(shocked), fixed, pmt, x.cupsPerDay) };
  });

  // Ramp: volume climbs linearly from startVolumePct to 100% over rampMonths; the loan is paid for its term only.
  const ramp = [];
  let cum = -Math.min(x.equity, x.startupCost);
  let lowest = cum, lowestMonth = 0, payback = null;
  for (let m = 1; m <= 60; m++) {
    const frac = x.rampMonths <= 1 ? 1 : Math.min(1, (m - 1) / (x.rampMonths - 1));
    const vol = x.startVolumePct + (100 - x.startVolumePct) * frac;
    const cups = (x.cupsPerDay * vol) / 100;
    const cash = monthProfit(x, pc, fixed, m <= x.loanTermMonths ? pmt : 0, cups);
    cum += cash;
    if (cum < lowest) { lowest = cum; lowestMonth = m; }
    if (payback === null && cum >= 0) payback = m;
    ramp.push({ month: m, volumePct: vol, cash, cumulative: cum });
  }
  // Cash the ramp burns beyond what was already spent at opening: the working-capital reserve to hold on top of the build-out.
  const reserveNeeded = Math.max(0, -(lowest + Math.min(x.equity, x.startupCost)));

  const advice = [];
  advice.push(`Each cup brings in $${money(pc.revenue).toFixed(2)} and leaves $${money(pc.contribution).toFixed(2)} after ingredients, packaging, waste, card, delivery and royalty costs.`);
  advice.push(breakEvenCupsDay === null ? "At these prices a cup earns nothing after its own costs; no volume reaches break-even." : `Break-even is ${breakEvenCupsDay} cups a day including the loan payment (${breakEvenOperatingCupsDay} before debt). You entered ${x.cupsPerDay}.`);
  advice.push(`Monthly: $${money(revenueMonth).toFixed(0)} in sales, ${operating < 0 ? "an operating loss of" : "operating profit of"} $${money(Math.abs(operating)).toFixed(0)}, loan payment $${money(pmt).toFixed(0)}, ${net < 0 ? "net loss of" : "net of"} $${money(Math.abs(net)).toFixed(0)}.`);
  if (targetPrice !== null) advice.push(`A ${x.targetMarginPct}% net margin at ${x.cupsPerDay} cups a day needs a drink price of $${money(targetPrice).toFixed(2)} (you charge $${money(x.price).toFixed(2)}).`);
  else advice.push("The target margin is not reachable by price alone at these percent costs; lower the target or the delivery and royalty share.");
  advice.push(payback === null ? "Cumulative cash does not turn positive within 60 months on this ramp." : `With the ramp you entered, cumulative cash turns positive in month ${payback}; the ramp burns $${money(reserveNeeded).toFixed(0)} of working capital, lowest in month ${lowestMonth}; hold that on top of the build-out.`);
  return { perCup: pc, labour, fixed, principal, payment: pmt, cupsMonth, revenueMonth, operating, net, netMarginPct, breakEvenCupsDay, breakEvenOperatingCupsDay, marginOfSafetyPct, targetPrice, sweep, costShock, ramp, lowest, lowestMonth, payback, reserveNeeded, advice };
}

export function toCsv(r) {
  const rows = [["month", "volume_pct", "cash", "cumulative"]];
  for (const m of r.ramp) rows.push([m.month, m.volumePct, m.cash, m.cumulative].map((v) => Math.round(v * 100) / 100));
  return rows.map((x) => x.join(",")).join("\n");
}
