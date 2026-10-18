// Quote builder and annual-target planner for a mobile / wedding DJ. Pure functions, no DOM, no network.
// Arithmetic on figures the user types; nothing here is a market price, a legal rate or tax advice.

export const QUOTE_DEFAULTS = Object.freeze({
  baseHours: 5,            // hours the DJ plays in the base package
  basePrice: 1200,         // price the client is quoted for the base package
  loadHours: 2,            // load-in, setup, teardown and load-out
  prepHours: 2,            // consultation, planning calls, music prep
  travelHours: 1,          // round-trip driving
  miles: 40,               // round-trip miles
  mileageRate: 0.7,        // $ per mile the vehicle really costs you
  gearCost: 6000,          // purchase price of the gear that goes on every gig
  gearGigs: 150,           // gigs you expect that gear to last
  insuranceYear: 600,
  softwareYear: 900,
  gigsPerYear: 60,
  cardFeePct: 3,
  leadFeePct: 0,           // The Knot / WeddingWire / GigSalad style fee on this booking, 0 if direct
  secondOpHours: 0,
  secondOpRate: 35,
  overtimeHours: 0,        // overtime you expect to work this gig
  overtimeRate: 150,       // $ per extra hour charged
  targetHourly: 60,
  depositPct: 30,
  balanceDaysBefore: 14,
  targetIncome: 60000,     // annual take-home goal for the annual plan
  peakGigs: 35,
  offGigs: 25,
  peakUpliftPct: 20,       // peak-season price premium over off-season
});

const num = (v, d) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// "name, client price, your cost, extra hours, tier" one per line. tier: good, better or best (the first tier that includes it).
export function parseAddons(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = (line.includes("\t") ? line.split("\t") : line.split(",")).map((x) => x.trim().replace(/^"|"$/g, ""));
    const price = num(c[1], NaN);
    if (c.length < 2 || !Number.isFinite(price)) { if (rows.length || !/price|add/i.test(line)) skipped++; continue; }
    const cost = num(c[2], 0), hours = num(c[3], 0);
    const tier = ["good", "better", "best"].includes((c[4] || "").toLowerCase()) ? c[4].toLowerCase() : "better";
    if (price < 0 || !(cost >= 0) || !(hours >= 0)) { skipped++; continue; }
    rows.push({ name: c[0] || "Add-on", price, cost, hours, tier });
  }
  return { rows, warnings: skipped ? [`${skipped} add-on line(s) skipped (need a name and a price).`] : [] };
}

function clean(opts) {
  const o = { ...QUOTE_DEFAULTS };
  for (const k of Object.keys(QUOTE_DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], QUOTE_DEFAULTS[k]);
  return o;
}

function validate(o) {
  for (const k of Object.keys(QUOTE_DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return `Check the number in "${k}".`;
  if (o.cardFeePct + o.leadFeePct >= 100) return "Card fee plus lead fee must be under 100%.";
  if (o.depositPct > 100) return "Deposit cannot exceed 100%.";
  if (o.gearGigs <= 0 || o.gigsPerYear <= 0) return "Gear life in gigs and gigs per year must be above zero.";
  return null;
}

// Per-gig costs that do not depend on the add-ons chosen.
function fixedPerGig(o) {
  const gear = o.gearCost / o.gearGigs;
  const insurance = o.insuranceYear / o.gigsPerYear;
  const software = o.softwareYear / o.gigsPerYear;
  const mileage = o.miles * o.mileageRate;
  const secondOp = o.secondOpHours * o.secondOpRate;
  return { gear, insurance, software, mileage, secondOp, total: gear + insurance + software + mileage + secondOp };
}

const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

// One gig priced from the bottom up. `addons` are the add-ons included in this quote.
export function quoteGig(opts = {}, addons = []) {
  const o = clean(opts);
  const err = validate(o);
  if (err) return { error: err };
  const fixed = fixedPerGig(o);
  const addonPrice = addons.reduce((a, x) => a + x.price, 0);
  const addonCost = addons.reduce((a, x) => a + x.cost, 0);
  const addonHours = addons.reduce((a, x) => a + x.hours, 0);
  const feeRate = (o.cardFeePct + o.leadFeePct) / 100;

  const playHours = o.baseHours + addonHours + o.overtimeHours;
  const unpaidHours = o.loadHours + o.prepHours + o.travelHours;
  const totalHours = playHours + unpaidHours;
  const price = o.basePrice + addonPrice;
  const overtimeRevenue = o.overtimeHours * o.overtimeRate;
  const revenue = price + overtimeRevenue;
  const fees = revenue * feeRate;
  const costs = fixed.total + addonCost;
  const profit = revenue - fees - costs;
  const effectiveHourly = totalHours > 0 ? profit / totalHours : 0;
  const quotedHourly = o.baseHours + addonHours > 0 ? price / (o.baseHours + addonHours) : 0;

  // Prices that make profit equal zero / the target. Overtime revenue is already expected, so it reduces the price needed.
  const priceFor = (profitNeeded) => Math.max(0, (profitNeeded + costs) / (1 - feeRate) - overtimeRevenue);
  const breakEvenPrice = priceFor(0);
  const targetPrice = priceFor(o.targetHourly * totalHours);

  const deposit = price * (o.depositPct / 100);
  const schedule = [
    { label: "Deposit at booking", amount: deposit },
    { label: `Balance due ${o.balanceDaysBefore} days before the event`, amount: price - deposit },
    ...(overtimeRevenue > 0 ? [{ label: "Expected overtime, billed on the night", amount: overtimeRevenue }] : []),
  ];
  return {
    options: o, fixed, addonPrice, addonCost, addonHours, playHours, unpaidHours, totalHours,
    price, overtimeRevenue, revenue, fees, costs, profit, effectiveHourly, quotedHourly,
    unpaidShare: totalHours > 0 ? unpaidHours / totalHours : 0,
    breakEvenPrice, targetPrice, meetsTarget: effectiveHourly >= o.targetHourly - 1e-9,
    schedule, scheduleTotal: schedule.reduce((a, s) => a + s.amount, 0),
  };
}

// Overtime hourly rate that covers the cost of an extra hour: your target plus the fees on it. Extra hours add no load-in or travel.
export function overtimeFloor(opts = {}) {
  const o = clean(opts);
  const err = validate(o);
  if (err) return { error: err };
  const f = (o.cardFeePct + o.leadFeePct) / 100;
  return { rate: (o.targetHourly + (o.secondOpHours > 0 ? o.secondOpRate : 0)) / (1 - f) };
}

// Good / better / best: each tier is the same gig with more add-ons, priced from its own hours and costs.
export function tierLadder(opts = {}, addons = [], step = 25) {
  const order = ["good", "better", "best"];
  const tiers = order.map((name, i) => {
    const included = addons.filter((a) => order.indexOf(a.tier) <= i);
    const base = quoteGig({ ...opts, basePrice: 0 }, included.map((a) => ({ ...a, price: 0 })));
    if (base.error) return base;
    const rounded = ceilTo(base.targetPrice, step);
    const q = quoteGig({ ...opts, basePrice: rounded }, included.map((a) => ({ ...a, price: 0 })));
    return { name, addons: included.map((a) => a.name), price: rounded, exactTarget: base.targetPrice, totalHours: q.totalHours, profit: q.profit, effectiveHourly: q.effectiveHourly };
  });
  const err = tiers.find((t) => t.error);
  if (err) return { error: err.error };
  return { tiers };
}

// Annual plan: the off-season price that reaches an annual take-home goal given peak and off-season bookings.
export function annualPlan(opts = {}, addons = []) {
  const o = clean(opts);
  const err = validate(o);
  if (err) return { error: err };
  const gigs = o.peakGigs + o.offGigs;
  if (gigs <= 0) return { error: "Enter at least one peak or off-season gig." };
  const q = quoteGig({ ...o, gigsPerYear: gigs }, addons);
  if (q.error) return q;
  const feeRate = (o.cardFeePct + o.leadFeePct) / 100;
  const perGigVariable = q.fixed.gear + q.fixed.mileage + q.fixed.secondOp + q.addonCost;
  const annualFixed = o.insuranceYear + o.softwareYear;
  const uplift = 1 + o.peakUpliftPct / 100;
  const weight = o.offGigs + o.peakGigs * uplift;
  // sum_i (P_i + overtime)(1 - f) - gigs * variable - annualFixed = targetIncome, with P_peak = P_off * uplift.
  const need = o.targetIncome + annualFixed + gigs * perGigVariable - gigs * q.overtimeRevenue * (1 - feeRate);
  const offPrice = Math.max(0, need / ((1 - feeRate) * weight));
  const peakPrice = offPrice * uplift;
  const income = (po, pp) => (o.offGigs * (po + q.overtimeRevenue) + o.peakGigs * (pp + q.overtimeRevenue)) * (1 - feeRate) - gigs * perGigVariable - annualFixed;
  const hoursPerGig = q.totalHours;
  const annualHours = gigs * hoursPerGig;
  // Gigs needed at the quote's own price to reach the goal.
  const atQuote = q.profit - q.fixed.insurance - q.fixed.software; // profit before per-gig share of annual fixed
  const gigsNeededAtQuotePrice = atQuote > 0 ? Math.ceil((o.targetIncome + annualFixed) / atQuote - 1e-9) : null;
  return {
    gigs, offPrice, peakPrice, income: income(offPrice, peakPrice), incomeAtQuotePrice: income(q.price, q.price),
    annualHours, hourly: annualHours > 0 ? income(offPrice, peakPrice) / annualHours : 0,
    gigsNeededAtQuotePrice, annualFixed, perGigVariable,
  };
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function sampleAddons() {
  return "add-on,price,your cost,extra hours,tier\nCeremony sound,250,15,0.5,good\nCocktail hour music,300,10,1,better\nUplighting (12 fixtures),350,40,0.5,better\nPhoto booth,600,150,0.5,best\nMC and games,200,0,0,best";
}
