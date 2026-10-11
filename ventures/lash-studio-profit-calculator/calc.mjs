// Lash studio price list check. For each service (full set, fills, removal, lift)
// it takes out card fees, no-show loss, supplies and a share of the studio
// overhead, and reports profit per chair hour, the price that hits the owner's
// target hourly, and the lifetime value of a client given how often they rebook.
//
// All linear in price, so the target price is exact:
//   profit(P) = P*q*(1-f) - (supply + fixed)*(1-ns) - overheadPerHour*h
//   q = 1 - ns*(1-deposit)      (a no-show who left a deposit still pays it)
//   h = (minutes + turnover minutes) / 60

export const KINDS = { set: "Full set", fill: "Fill", other: "Other" };
export const MAX_SERVICES = 10;

export function validateInput(i) {
  const e = [];
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  const pct = (v, max = 100) => nonneg(v) && v <= max;
  if (!pct(i.cardFeePct, 15)) e.push("Card fee must be between 0% and 15%.");
  if (!nonneg(i.cardFixedFee) || i.cardFixedFee > 5) e.push("Fixed fee per payment must be between $0 and $5.");
  if (!pct(i.noShowPct, 60)) e.push("No-show rate must be between 0% and 60%.");
  if (!pct(i.depositPct, 100)) e.push("Deposit must be between 0% and 100% of the price.");
  if (!nonneg(i.monthlyOverhead) || i.monthlyOverhead > 100000) e.push("Monthly overhead must be zero or more.");
  if (!(Number.isFinite(i.hoursOpenPerWeek) && i.hoursOpenPerWeek > 0 && i.hoursOpenPerWeek <= 100)) e.push("Hours open per week must be between 1 and 100.");
  if (!(Number.isFinite(i.utilizationPct) && i.utilizationPct >= 10 && i.utilizationPct <= 100)) e.push("Booked share of open hours must be between 10% and 100%.");
  if (!(nonneg(i.turnoverMinutes) && i.turnoverMinutes <= 60)) e.push("Turnover minutes must be between 0 and 60.");
  if (!nonneg(i.targetHourly) || i.targetHourly > 1000) e.push("Target hourly must be zero or more.");
  if (!(pct(i.rebookPct, 99))) e.push("Rebook rate must be between 0% and 99%.");
  if (!(Number.isFinite(i.maxFills) && i.maxFills >= 0 && i.maxFills <= 52)) e.push("Fills per client lifetime must be between 0 and 52.");
  if (!Array.isArray(i.services) || i.services.length < 1) e.push("Add at least one service.");
  else if (i.services.length > MAX_SERVICES) e.push(`This tool takes up to ${MAX_SERVICES} services.`);
  else i.services.forEach((s, k) => {
    const n = `Service ${k + 1}`;
    if (!KINDS[s.kind]) e.push(`${n}: pick full set, fill or other.`);
    if (!(Number.isFinite(s.price) && s.price > 0 && s.price <= 5000)) e.push(`${n}: enter a price above zero.`);
    if (!(Number.isFinite(s.minutes) && s.minutes >= 5 && s.minutes <= 480)) e.push(`${n}: chair minutes must be between 5 and 480.`);
    if (!(nonneg(s.supply) && s.supply <= 1000)) e.push(`${n}: supply cost must be zero or more.`);
    if (!(nonneg(s.perWeek) && s.perWeek <= 200)) e.push(`${n}: bookings per week must be zero or more.`);
  });
  return e;
}

// Expected number of repeat fills for a client who rebooks with probability r
// after every visit, capped at n fills: r + r^2 + ... + r^n.
export function expectedFills(r, n) {
  if (!(r > 0) || !(n > 0)) return 0;
  return r === 1 ? n : (r * (1 - Math.pow(r, n))) / (1 - r);
}

function coefficients(i) {
  const f = i.cardFeePct / 100, ns = i.noShowPct / 100, dep = i.depositPct / 100;
  const q = 1 - ns * (1 - dep);
  const overheadPerHour = i.monthlyOverhead / ((i.hoursOpenPerWeek * 52 / 12) * (i.utilizationPct / 100));
  return { f, ns, q, overheadPerHour };
}

function economics(i, c, s) {
  const h = (s.minutes + i.turnoverMinutes) / 60;
  const fixedCosts = (s.supply + i.cardFixedFee) * (1 - c.ns) + c.overheadPerHour * h;
  const collected = s.price * c.q;
  const cardFees = collected * c.f + i.cardFixedFee * (1 - c.ns);
  const profit = collected * (1 - c.f) - fixedCosts;
  const targetPrice = (i.targetHourly * h + fixedCosts) / (c.q * (1 - c.f));
  return {
    hours: h, collected, cardFees, supplyCost: s.supply * (1 - c.ns), overheadCost: c.overheadPerHour * h,
    noShowLoss: s.price - collected, profit, perHour: profit / h, marginPct: collected > 0 ? (profit / collected) * 100 : 0,
    targetPrice, gap: s.price - targetPrice, meets: profit / h >= i.targetHourly - 1e-9,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const c = coefficients(i);
  const rows = i.services.map((s, k) => ({ index: k + 1, name: s.name || `${KINDS[s.kind]} ${k + 1}`, kind: s.kind, price: s.price, minutes: s.minutes, perWeek: s.perWeek, ...economics(i, c, s) }));

  const weeklyHours = rows.reduce((a, r) => a + r.hours * r.perWeek, 0);
  const weeklyProfit = rows.reduce((a, r) => a + r.profit * r.perWeek, 0);
  const weeklyRevenue = rows.reduce((a, r) => a + r.price * r.perWeek, 0);
  const impliedUtilPct = (weeklyHours / i.hoursOpenPerWeek) * 100;

  const set = rows.find((r) => r.kind === "set");
  const fill = rows.find((r) => r.kind === "fill");
  let client = null;
  if (set && fill) {
    const fills = expectedFills(i.rebookPct / 100, i.maxFills);
    const profit = set.profit + fills * fill.profit;
    const hours = set.hours + fills * fill.hours;
    const gross = set.price + fills * fill.price;
    // Lowest set price at which the client's lifetime still earns the target hourly,
    // holding rebooking and the fill price fixed. Set profit is linear in its price.
    const perDollar = c.q * (1 - c.f);
    const setProfitNeeded = i.targetHourly * hours - fills * fill.profit;
    const setPriceFloor = set.price - (set.profit - setProfitNeeded) / perDollar;
    client = { setPrice: set.price, setName: set.name, fillName: fill.name, expectedFills: fills, lifetimeProfit: profit, lifetimeHours: hours, lifetimeRevenue: gross, lifetimePerHour: profit / hours, setPriceFloor, maxSetDiscountPct: Math.max(0, ((set.price - setPriceFloor) / set.price) * 100) };
  }

  const worst = rows.reduce((a, r) => (r.perHour < a.perHour ? r : a), rows[0]);
  const best = rows.reduce((a, r) => (r.perHour > a.perHour ? r : a), rows[0]);
  return { ok: true, input: i, overheadPerHour: c.overheadPerHour, rows, weekly: { hours: weeklyHours, profit: weeklyProfit, revenue: weeklyRevenue, impliedUtilPct }, monthlyProfit: (weeklyProfit * 52) / 12, client, worstIndex: worst.index, bestIndex: best.index, notes: buildNotes(i, rows, client, impliedUtilPct, worst) };
}

function buildNotes(i, rows, client, impliedUtilPct, worst) {
  const n = [];
  const below = rows.filter((r) => !r.meets);
  if (below.length === 0) n.push("Every service clears your target hourly.");
  else n.push(`${below.length} of ${rows.length} services earn less than your target of ${money(i.targetHourly)} an hour. Furthest below: ${worst.name} at ${money(worst.perHour)} an hour; it needs ${cents(worst.targetPrice)}.`);
  if (impliedUtilPct > 100) n.push(`This schedule needs ${impliedUtilPct.toFixed(0)}% of your open hours. It does not fit; lower the bookings per week.`);
  else if (impliedUtilPct > 0 && Math.abs(impliedUtilPct - i.utilizationPct) > 15) n.push(`Your bookings fill ${impliedUtilPct.toFixed(0)}% of open hours but overhead was spread assuming ${i.utilizationPct}%. Set the booked share to match for a truer answer.`);
  if (client && client.lifetimePerHour < i.targetHourly) n.push("Even counting repeat fills, a typical client earns less than your target hourly. Raise the set or fill price, or shorten the appointment.");
  if (client && client.maxSetDiscountPct > 0 && client.maxSetDiscountPct < 100) n.push(`A new-client promotion on the full set can go as low as ${cents(client.setPriceFloor)} (${client.maxSetDiscountPct.toFixed(0)}% off) and the client still earns your target, but only if they rebook about ${i.rebookPct}% of the time.`);
  if (client && client.setPriceFloor > client.setPrice + 0.005) n.push(`At ${i.rebookPct}% rebooking, the full set would have to be ${cents(client.setPriceFloor)} for a client's lifetime to earn your target hourly.`);
  return n;
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);

export function sampleInput() {
  return {
    cardFeePct: 2.9, cardFixedFee: 0.3, noShowPct: 8, depositPct: 25, monthlyOverhead: 1400, hoursOpenPerWeek: 36, utilizationPct: 70,
    turnoverMinutes: 15, targetHourly: 45, rebookPct: 75, maxFills: 10,
    services: [
      { name: "Classic full set", kind: "set", price: 150, minutes: 120, supply: 14, perWeek: 3 },
      { name: "Volume full set", kind: "set", price: 200, minutes: 150, supply: 20, perWeek: 2 },
      { name: "2-week fill", kind: "fill", price: 65, minutes: 60, supply: 7, perWeek: 6 },
      { name: "3-week fill", kind: "fill", price: 80, minutes: 75, supply: 9, perWeek: 4 },
      { name: "Removal", kind: "other", price: 25, minutes: 20, supply: 2, perWeek: 1 },
    ],
  };
}

export function resultText(r) {
  const lines = [`Lash studio price check: target ${money(r.input.targetHourly)}/hr, overhead ${cents(r.overheadPerHour)} per booked hour`];
  for (const x of r.rows) lines.push(`${x.name}: ${cents(x.price)}, ${money(x.perHour)}/hr profit (${x.meets ? "meets" : "below"} target), price for target ${cents(x.targetPrice)}`);
  lines.push(`Schedule: ${r.weekly.hours.toFixed(1)} h/week, about ${money(r.monthlyProfit)} a month profit before your tax`);
  if (r.client) lines.push(`Client lifetime (${r.client.setName} + ${r.client.expectedFills.toFixed(1)} ${r.client.fillName}): ${money(r.client.lifetimeProfit)} profit, ${money(r.client.lifetimePerHour)}/hr`);
  lines.push("Arithmetic on the numbers entered, not tax, financial or business advice.");
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "service,kind,price,chair_minutes,per_week,collected,card_fees,supplies,overhead,profit,profit_per_hour,price_for_target";
  const f = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : `"${String(v).replace(/"/g, '""')}"`);
  const rows = r.rows.map((x) => [x.name, x.kind, x.price, x.minutes, x.perWeek, x.collected, x.cardFees, x.supplyCost, x.overheadCost, x.profit, x.perHour, x.targetPrice]);
  return [head, ...rows.map((x) => x.map(f).join(","))].join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "lash-studio-profit-calculator", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "lash-studio-profit-calculator" || !d.input) return { error: "That file is not a saved lash studio scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
