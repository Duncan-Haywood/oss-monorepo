// Courier van route profit check. An independent last-mile contractor who owns or
// leases the van is paid per route, per stop, per package, or a mix. This takes out
// fuel, the van payment and insurance (spread over the routes actually driven),
// maintenance and depreciation per mile, tolls and parking, and a reserve for
// tickets and damage claims, then reports true profit per route, per hour and per
// stop, the cost per mile, the stops needed to break even, the lowest pay per route
// that still earns a target hourly after a tax set-aside, and weekly/annual
// take-home. A second mode compares two route offers.
//
//   pay      = payRoute + payStop*stops + payPackage*packages
//   fixed    = (vanPayment + insurance) * 12 / (routesPerWeek * weeksPerYear)
//   costs    = miles/mpg*fuelPrice + (maintPerMile + deprPerMile)*miles + tolls + reserve + fixed
//   profit   = pay - costs                         (before tax)
//   setAside = taxPct * max(0, profit)
//   takeHome = profit - setAside
//   minPay   = costs + targetHourly*hours / (1 - taxPct)   (exact: takeHome/hour = target)

export const OFFER_KEYS = ["payRoute", "payStop", "payPackage", "stops", "packages", "hours", "miles", "tolls", "routesPerWeek"];

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!nonneg(i.payRoute, 5000)) e.push("Pay per route must be between $0 and $5,000.");
  if (!nonneg(i.payStop, 100)) e.push("Pay per stop must be between $0 and $100.");
  if (!nonneg(i.payPackage, 100)) e.push("Pay per package must be between $0 and $100.");
  if (e.length === 0 && i.payRoute + i.payStop + i.payPackage <= 0) e.push("Enter at least one pay rate above zero.");
  if (!(Number.isInteger(i.stops) && i.stops >= 1 && i.stops <= 1000)) e.push("Stops per route must be a whole number between 1 and 1,000.");
  if (!nonneg(i.packages, 5000)) e.push("Packages per route must be between 0 and 5,000.");
  if (!pos(i.hours, 20)) e.push("Route hours must be above 0 and at most 20.");
  if (!pos(i.miles, 1000)) e.push("Miles per route must be above 0 and at most 1,000.");
  if (!nonneg(i.tolls, 500)) e.push("Tolls and parking must be between $0 and $500 per route.");
  if (!pos(i.fuelPrice, 20)) e.push("Fuel price must be above $0 and at most $20 a gallon.");
  if (!pos(i.mpg, 100)) e.push("Miles per gallon must be above 0 and at most 100.");
  if (!nonneg(i.vanPayment, 10000)) e.push("Van payment or lease must be between $0 and $10,000 a month.");
  if (!nonneg(i.insurance, 10000)) e.push("Insurance must be between $0 and $10,000 a month.");
  if (!nonneg(i.maintPerMile, 5)) e.push("Maintenance per mile must be between $0 and $5.");
  if (!nonneg(i.deprPerMile, 5)) e.push("Depreciation per mile must be between $0 and $5.");
  if (!nonneg(i.reserve, 1000)) e.push("Tickets and damage reserve must be between $0 and $1,000 per route.");
  if (!nonneg(i.taxPct, 60)) e.push("Tax set-aside must be between 0% and 60%.");
  if (!(Number.isFinite(i.routesPerWeek) && i.routesPerWeek > 0 && i.routesPerWeek <= 7)) e.push("Routes per week must be above 0 and at most 7.");
  if (!(Number.isFinite(i.weeksPerYear) && i.weeksPerYear >= 1 && i.weeksPerYear <= 52)) e.push("Weeks per year must be between 1 and 52.");
  if (!nonneg(i.targetHourly, 500)) e.push("Target hourly must be between $0 and $500.");
  return e;
}

function figures(i) {
  const t = i.taxPct / 100;
  const pay = i.payRoute + i.payStop * i.stops + i.payPackage * i.packages;
  const fuel = (i.miles / i.mpg) * i.fuelPrice;
  const maintenance = i.maintPerMile * i.miles;
  const depreciation = i.deprPerMile * i.miles;
  const fixed = ((i.vanPayment + i.insurance) * 12) / (i.routesPerWeek * i.weeksPerYear);
  const costs = fuel + maintenance + depreciation + i.tolls + i.reserve + fixed;
  const profit = pay - costs;
  const setAside = Math.max(0, profit) * t;
  const takeHome = profit - setAside;
  const effPerStop = i.payStop + i.payPackage * (i.packages / i.stops);
  const breakevenStops = effPerStop > 0 ? Math.max(0, (costs - i.payRoute) / effPerStop) : null;
  const minPay = costs + (i.targetHourly * i.hours) / (1 - t);
  return {
    pay, fuel, maintenance, depreciation, tolls: i.tolls, reserve: i.reserve, fixed, costs, costPerMile: costs / i.miles,
    profit, profitPerHour: profit / i.hours, profitPerStop: profit / i.stops, setAside, takeHome, takeHomePerHour: takeHome / i.hours,
    payPerHour: pay / i.hours, breakevenStops, effPerStop, minPay, minPayGap: pay - minPay,
    meets: takeHome / i.hours >= i.targetHourly - 1e-9,
    weeklyTakeHome: takeHome * i.routesPerWeek, annualTakeHome: takeHome * i.routesPerWeek * i.weeksPerYear,
    weeklyHours: i.hours * i.routesPerWeek, annualHours: i.hours * i.routesPerWeek * i.weeksPerYear,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const f = figures(input);
  return { ok: true, input, ...f, notes: buildNotes(input, f) };
}

function buildNotes(i, f) {
  const n = [];
  if (f.profit < 0) n.push(`This route loses ${cents(-f.profit)} before tax. Every route driven costs you money at this pay.`);
  else if (f.meets) n.push(`Take-home is ${cents(f.takeHomePerHour)} an hour after the tax set-aside, which clears your target of ${money(i.targetHourly)}.`);
  else n.push(`Take-home is ${cents(f.takeHomePerHour)} an hour after the tax set-aside, below your target of ${money(i.targetHourly)}. The route needs to pay ${cents(f.minPay)}, which is ${cents(-f.minPayGap)} more.`);
  if (f.payPerHour > 0 && f.profitPerHour / f.payPerHour < 0.5 && f.profit >= 0) n.push(`Costs eat ${((1 - f.profit / f.pay) * 100).toFixed(0)}% of the route pay. Pay per hour looks like ${money(f.payPerHour)} but you keep ${money(f.profitPerHour)} before tax.`);
  if (f.breakevenStops !== null && f.breakevenStops > i.stops) n.push(`You need about ${Math.ceil(f.breakevenStops)} stops to break even and this route has ${i.stops}.`);
  if (i.mpg < 8) n.push("Check the miles per gallon: under 8 is unusual for a delivery van.");
  return n;
}

export function compareOffers(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of OFFER_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Offer B: ${x}`) };
  const byAnnual = b.annualTakeHome > a.annualTakeHome + 0.005 ? "B" : a.annualTakeHome > b.annualTakeHome + 0.005 ? "A" : "tie";
  const byHour = b.takeHomePerHour > a.takeHomePerHour + 0.005 ? "B" : a.takeHomePerHour > b.takeHomePerHour + 0.005 ? "A" : "tie";
  const notes = [];
  if (byAnnual === "tie") notes.push("The two offers take home the same per year.");
  else {
    const w = byAnnual === "A" ? a : b;
    const l = byAnnual === "A" ? b : a;
    notes.push(`Offer ${byAnnual} takes home ${money(w.annualTakeHome - l.annualTakeHome)} more a year (${money(w.annualTakeHome)} against ${money(l.annualTakeHome)}).`);
  }
  if (byHour !== byAnnual && byHour !== "tie" && byAnnual !== "tie") notes.push(`Offer ${byHour} pays more per hour worked but fewer total dollars a year, because the hours are fewer and the extra hourly rate does not make up for them.`);
  return { ok: true, a, b, winnerAnnual: byAnnual, winnerHourly: byHour, annualDifference: b.annualTakeHome - a.annualTakeHome, notes };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);

export function sampleInput() {
  return {
    payRoute: 90, payStop: 1.1, payPackage: 0.4, stops: 120, packages: 160, hours: 10, miles: 95, tolls: 6,
    fuelPrice: 3.7, mpg: 15, vanPayment: 650, insurance: 300, maintPerMile: 0.1, deprPerMile: 0.12, reserve: 8,
    taxPct: 25, routesPerWeek: 5, weeksPerYear: 48, targetHourly: 18,
  };
}

export function sampleOffer() {
  return { payRoute: 260, payStop: 0, payPackage: 0, stops: 90, packages: 120, hours: 9, miles: 70, tolls: 2, routesPerWeek: 5 };
}

export function resultText(r) {
  const lines = [
    `Courier van route check: ${r.input.stops} stops, ${r.input.packages} packages, ${r.input.hours} h, ${r.input.miles} mi`,
    `Pay ${cents(r.pay)}; costs ${cents(r.costs)} (${cents(r.costPerMile)} per mile)`,
    `True profit ${cents(r.profit)} per route, ${cents(r.profitPerHour)} per hour, ${cents(r.profitPerStop)} per stop (before tax)`,
    `After ${r.input.taxPct}% set-aside: ${cents(r.takeHome)} per route, ${cents(r.takeHomePerHour)} per hour`,
    `Break-even stops: ${r.breakevenStops === null ? "n/a (no per-stop or per-package pay)" : r.breakevenStops.toFixed(1)}`,
    `Minimum pay per route for ${money(r.input.targetHourly)}/hr after set-aside: ${cents(r.minPay)}`,
    `Take-home: ${money(r.weeklyTakeHome)} a week, ${money(r.annualTakeHome)} a year`,
    "Arithmetic on the numbers entered, not tax, legal or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["pay", r.pay], ["fuel", r.fuel], ["maintenance", r.maintenance], ["depreciation", r.depreciation], ["tolls_parking", r.tolls],
    ["tickets_damage_reserve", r.reserve], ["van_payment_and_insurance", r.fixed], ["total_costs", r.costs], ["cost_per_mile", r.costPerMile],
    ["profit_per_route", r.profit], ["profit_per_hour", r.profitPerHour], ["profit_per_stop", r.profitPerStop], ["tax_set_aside", r.setAside],
    ["take_home_per_route", r.takeHome], ["take_home_per_hour", r.takeHomePerHour], ["breakeven_stops", r.breakevenStops === null ? "" : r.breakevenStops],
    ["minimum_pay_per_route", r.minPay], ["weekly_take_home", r.weeklyTakeHome], ["annual_take_home", r.annualTakeHome],
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 100) / 100 : v}`)].join("\n");
}

const APP = "courier-van-route-profit-calculator";
export function serializeState(input, offer) { return JSON.stringify({ app: APP, version: 1, input, offer: offer || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved courier van route scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, offer: d.offer && typeof d.offer === "object" ? d.offer : null };
}
