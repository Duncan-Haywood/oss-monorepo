// Pizzeria pro forma: contribution per order across four channels (dine-in/pickup, own drivers, delivery apps), monthly profit,
// break-even orders a day (with the loan), the average ticket that reaches a target margin, a volume sweep, a food-cost shock,
// and a 60-month ramp-up with cash reserve. Pure functions; no DOM. Bad input is rejected, never clamped.

export const money = (n) => Math.round(n * 100) / 100;

export function sampleInput() {
  return {
    ticket: 27, foodCostPct: 29, packagingCost: 0.65, wastePct: 5, cardFeePct: 2.9,
    ownDeliverySharePct: 25, driverCostPerOrder: 4.5, appSharePct: 15, appCommissionPct: 27, royaltyPct: 0,
    ordersPerDay: 95, daysPerMonth: 27,
    staffHoursPerDay: 58, wage: 15.5, payrollTaxPct: 11,
    rent: 5200, utilities: 1300, otherFixed: 1500, ownerPay: 3500,
    startupCost: 210000, equity: 70000, loanRatePct: 9.5, loanTermMonths: 84,
    rampMonths: 10, startVolumePct: 45, targetMarginPct: 10,
  };
}

const FIELDS = {
  ticket: [0, 1e6], foodCostPct: [0, 100], packagingCost: [0, 1e6], wastePct: [0, 100], cardFeePct: [0, 100],
  ownDeliverySharePct: [0, 100], driverCostPerOrder: [0, 1e6], appSharePct: [0, 100], appCommissionPct: [0, 100], royaltyPct: [0, 100],
  ordersPerDay: [0, 1e6], daysPerMonth: [0, 31], staffHoursPerDay: [0, 1000], wage: [0, 1e6], payrollTaxPct: [0, 100],
  rent: [0, 1e9], utilities: [0, 1e9], otherFixed: [0, 1e9], ownerPay: [0, 1e9],
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
  const x = (k) => Number(i[k]);
  if (x("ownDeliverySharePct") + x("appSharePct") > 100) return "ownDeliverySharePct plus appSharePct must not exceed 100.";
  return null;
}

const nums = (i) => Object.fromEntries(Object.keys(FIELDS).map((k) => [k, Number(i[k])]));

// Standard amortising payment; zero rate is straight-line.
export function monthlyPayment(principal, ratePct, months) {
  if (principal <= 0) return 0;
  const r = ratePct / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
}

// Per-order economics. Food cost is a share of the ticket, grossed up for waste; packaging is per order. Card fees and royalty
// apply to every ticket, the app commission only to the app share, and the driver cost only to the own-delivery share.
export function perOrder(x) {
  const revenue = x.ticket;
  const food = revenue * (x.foodCostPct / 100) * (1 + x.wastePct / 100);
  const ingredients = food + x.packagingCost;
  const percent = revenue * (x.cardFeePct / 100 + (x.appSharePct / 100) * (x.appCommissionPct / 100) + x.royaltyPct / 100);
  const driver = (x.ownDeliverySharePct / 100) * x.driverCostPerOrder;
  return { revenue, ingredients, percent, driver, contribution: revenue - ingredients - percent - driver };
}

export function fixedMonthly(x) {
  const labour = x.staffHoursPerDay * x.daysPerMonth * x.wage * (1 + x.payrollTaxPct / 100);
  return { labour, fixed: labour + x.rent + x.utilities + x.otherFixed + x.ownerPay };
}

function monthProfit(x, po, fixed, pmt, ordersPerDay) {
  return ordersPerDay * x.daysPerMonth * po.contribution - fixed - pmt;
}

export function analyze(input) {
  const err = validate(input);
  if (err) return { error: err };
  const x = nums(input);
  const po = perOrder(x);
  const { labour, fixed } = fixedMonthly(x);
  const principal = Math.max(0, x.startupCost - x.equity);
  const pmt = monthlyPayment(principal, x.loanRatePct, x.loanTermMonths);
  const ordersMonth = x.ordersPerDay * x.daysPerMonth;
  const revenueMonth = ordersMonth * po.revenue;
  const operating = ordersMonth * po.contribution - fixed;
  const net = operating - pmt;
  const perDayContribution = x.daysPerMonth * po.contribution;
  const breakEvenOrdersDay = perDayContribution > 0 ? Math.ceil((fixed + pmt) / perDayContribution) : null;
  const breakEvenOperatingOrdersDay = perDayContribution > 0 ? Math.ceil(fixed / perDayContribution) : null;
  const netMarginPct = revenueMonth > 0 ? (net / revenueMonth) * 100 : null;
  const marginOfSafetyPct = breakEvenOrdersDay && x.ordersPerDay > 0 ? ((x.ordersPerDay - breakEvenOrdersDay) / x.ordersPerDay) * 100 : null;
  // Share of the ticket that app commission and driver cost take, so the owner sees what the channels cost on every order.
  const channelCostPerOrder = po.revenue * (x.appSharePct / 100) * (x.appCommissionPct / 100) + po.driver;

  // Average ticket that yields the target net margin at the entered volume. Revenue/order R scales food and percent costs:
  // profit = N(R(1 - f - p) - pack - drv) - F - pmt and target = m N R, so R = (pack + drv + (F+pmt)/N) / (1 - f - p - m).
  let targetTicket = null;
  const f = (x.foodCostPct / 100) * (1 + x.wastePct / 100);
  const p = x.cardFeePct / 100 + (x.appSharePct / 100) * (x.appCommissionPct / 100) + x.royaltyPct / 100;
  const denom = 1 - f - p - x.targetMarginPct / 100;
  if (ordersMonth > 0 && denom > 0) targetTicket = (x.packagingCost + po.driver + (fixed + pmt) / ordersMonth) / denom;

  const sweep = [-30, -20, -10, 0, 10, 20].map((c) => {
    const orders = x.ordersPerDay * (1 + c / 100);
    return { changePct: c, ordersPerDay: orders, net: monthProfit(x, po, fixed, pmt, orders) };
  });
  const costShock = [0, 5, 10, 15].map((c) => {
    const shocked = { ...x, foodCostPct: x.foodCostPct * (1 + c / 100), packagingCost: x.packagingCost * (1 + c / 100) };
    return { changePct: c, net: monthProfit(shocked, perOrder(shocked), fixed, pmt, x.ordersPerDay) };
  });

  // Ramp: volume climbs linearly from startVolumePct to 100% over rampMonths; the loan is paid for its term only.
  const ramp = [];
  let cum = -Math.min(x.equity, x.startupCost);
  let lowest = cum, lowestMonth = 0, payback = null;
  for (let m = 1; m <= 60; m++) {
    const frac = x.rampMonths <= 1 ? 1 : Math.min(1, (m - 1) / (x.rampMonths - 1));
    const vol = x.startVolumePct + (100 - x.startVolumePct) * frac;
    const orders = (x.ordersPerDay * vol) / 100;
    const cash = monthProfit(x, po, fixed, m <= x.loanTermMonths ? pmt : 0, orders);
    cum += cash;
    if (cum < lowest) { lowest = cum; lowestMonth = m; }
    if (payback === null && cum >= 0) payback = m;
    ramp.push({ month: m, volumePct: vol, cash, cumulative: cum });
  }
  const reserveNeeded = Math.max(0, -(lowest + Math.min(x.equity, x.startupCost)));

  const usd = (n) => money(n).toFixed(0);
  const advice = [];
  advice.push(`Each order brings in $${money(po.revenue).toFixed(2)} and leaves $${money(po.contribution).toFixed(2)} after food, packaging, waste, card fees, app commission, royalty and your own drivers. Delivery channels cost $${money(channelCostPerOrder).toFixed(2)} of that on an average order.`);
  advice.push(breakEvenOrdersDay === null ? "At these prices an order earns nothing after its own costs; no volume reaches break-even." : `Break-even is ${breakEvenOrdersDay} orders a day including the loan payment (${breakEvenOperatingOrdersDay} before debt). You entered ${x.ordersPerDay}.`);
  advice.push(`Monthly: $${usd(revenueMonth)} in sales, ${operating < 0 ? "an operating loss of" : "operating profit of"} $${usd(Math.abs(operating))}, loan payment $${usd(pmt)}, ${net < 0 ? "net loss of" : "net of"} $${usd(Math.abs(net))}. Labour is $${usd(labour)} (${revenueMonth > 0 ? ((labour / revenueMonth) * 100).toFixed(1) : "n/a"}% of sales).`);
  if (targetTicket !== null) advice.push(`A ${x.targetMarginPct}% net margin at ${x.ordersPerDay} orders a day needs an average ticket of $${money(targetTicket).toFixed(2)} (you enter $${money(x.ticket).toFixed(2)}).`);
  else advice.push("The target margin is not reachable by ticket size alone at these food, fee and commission percentages; lower the target or the app and royalty share.");
  advice.push(payback === null ? "Cumulative cash does not turn positive within 60 months on this ramp." : `With the ramp you entered, cumulative cash turns positive in month ${payback}; the ramp burns $${usd(reserveNeeded)} of working capital, lowest in month ${lowestMonth}; hold that on top of the build-out.`);
  return { perOrder: po, labour, fixed, principal, payment: pmt, ordersMonth, revenueMonth, operating, net, netMarginPct, breakEvenOrdersDay, breakEvenOperatingOrdersDay, marginOfSafetyPct, channelCostPerOrder, targetTicket, sweep, costShock, ramp, lowest, lowestMonth, payback, reserveNeeded, advice };
}

export function toCsv(r) {
  const rows = [["month", "volume_pct", "cash", "cumulative"]];
  for (const m of r.ramp) rows.push([m.month, m.volumePct, m.cash, m.cumulative].map((v) => Math.round(v * 100) / 100));
  return rows.map((x) => x.join(",")).join("\n");
}
