// E-bike rental shop economics. A shop (or a hotel, campground or bike-tour desk adding a rental
// counter) owns a fleet, rents each bike in half-day and full-day slots over a season with busy
// and quiet days, and pays for staff, rent, insurance, wear, batteries, damage and the day the
// fleet has to be replaced. The owner needs three answers before buying more bikes: the profit
// at a believable utilization, how long the money takes to come back, and the utilization and
// prices at which the season stops losing money.
//
//   slots      = bikes * 2 per day (a bike is rented as one half-day slot or two for a full day)
//   rented     = slots * (peakDays * peakUtil + offDays * offUtil)            (slots sold a season)
//   revSlot    = fullShare * fullPrice / 2 + (1 - fullShare) * halfPrice
//   rentals    = rented * (1 - fullShare / 2)                                   (customers served)
//   revenue    = rented * revSlot + rentals * addOn
//   costs      = revenue * (loss + card) + staff + rent + insurance + marketing + other
//                + rented * wear + rentals * battery / batteryLife + fleet replacement reserve
//   reserve    = bikes * bikeCost * (1 - resale) / lifeSeasons
//   payback    = capex / operating profit (after the reserve, before the loan), in years
//   operating profit is linear in utilization and in the price level, so break-even utilization
//   and the lowest prices for break-even, a target margin and a payback target are exact.

export const SCENARIO_KEYS = ["bikes", "peakUtil", "offPeakUtil", "halfPrice", "fullPrice"];
const APP = "ebike-rental-fleet-profit-calculator";

export function loanPayment(principal, aprPct, months) {
  if (!(principal > 0)) return 0;
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!(Number.isInteger(i.bikes) && i.bikes >= 1 && i.bikes <= 500)) e.push("Bikes must be a whole number between 1 and 500.");
  if (!nonneg(i.bikeCost, 20000)) e.push("Cost per bike must be between $0 and $20,000.");
  if (!nonneg(i.resalePct, 100)) e.push("Resale value after use must be between 0% and 100% of cost.");
  if (!pos(i.lifeSeasons, 20)) e.push("Seasons before you replace a bike must be above 0 and at most 20.");
  if (!nonneg(i.startupCapex, 5000000)) e.push("Other start-up spending must be between $0 and $5,000,000.");
  if (!nonneg(i.peakDays, 366)) e.push("Busy days must be between 0 and 366.");
  if (!nonneg(i.offDays, 366)) e.push("Quiet days must be between 0 and 366.");
  if (Number.isFinite(i.peakDays) && Number.isFinite(i.offDays) && i.peakDays + i.offDays > 366) e.push("Busy plus quiet days cannot be more than 366.");
  if (!nonneg(i.peakUtil, 100)) e.push("Busy-day utilization must be between 0% and 100%.");
  if (!nonneg(i.offPeakUtil, 100)) e.push("Quiet-day utilization must be between 0% and 100%.");
  if (!nonneg(i.halfPrice, 1000)) e.push("Half-day price must be between $0 and $1,000.");
  if (!nonneg(i.fullPrice, 1000)) e.push("Full-day price must be between $0 and $1,000.");
  if (!nonneg(i.fullShare, 100)) e.push("Full-day share of rented slots must be between 0% and 100%.");
  if (!nonneg(i.addOn, 500)) e.push("Add-on revenue per rental must be between $0 and $500.");
  if (!nonneg(i.lossPct, 50)) e.push("Damage and theft must be between 0% and 50% of revenue.");
  if (!nonneg(i.cardPct, 20)) e.push("Card fees must be between 0% and 20%.");
  if (!nonneg(i.staff, 50)) e.push("Staff on duty must be between 0 and 50.");
  if (!nonneg(i.hoursOpen, 24)) e.push("Hours open per day must be between 0 and 24.");
  if (!nonneg(i.wage, 500)) e.push("Hourly wage must be between $0 and $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.rentMonthly, 1000000)) e.push("Monthly rent must be between $0 and $1,000,000.");
  if (!nonneg(i.rentMonths, 12)) e.push("Months of rent a year must be between 0 and 12.");
  for (const [k, label] of [["insurance", "Insurance"], ["marketing", "Marketing and website"], ["otherAnnual", "Other yearly costs"]]) {
    if (!nonneg(i[k], 10000000)) e.push(`${label} must be between $0 and $10,000,000 a year.`);
  }
  if (!nonneg(i.wearPerSlot, 200)) e.push("Wear and charging per rented slot must be between $0 and $200.");
  if (!nonneg(i.batteryCost, 10000)) e.push("Battery cost must be between $0 and $10,000.");
  if (!pos(i.batteryLife, 100000)) e.push("Rentals per battery must be above 0.");
  if (!nonneg(i.financedPct, 100)) e.push("Financed share must be between 0% and 100%.");
  if (!nonneg(i.aprPct, 60)) e.push("Loan APR must be between 0% and 60%.");
  if (!(Number.isInteger(i.termMonths) && i.termMonths >= 1 && i.termMonths <= 360)) e.push("Loan term must be a whole number of months between 1 and 360.");
  if (!pos(i.targetPaybackYears, 50)) e.push("Payback target must be above 0 and at most 50 years.");
  if (!nonneg(i.targetMarginPct, 95)) e.push("Target margin must be between 0% and 95%.");
  return e;
}

const capexOf = (i) => i.bikes * i.bikeCost + i.startupCapex;
const loanOf = (i) => loanPayment((capexOf(i) * i.financedPct) / 100, i.aprPct, i.termMonths) * 12;

function figures(i) {
  const slotsPerDay = i.bikes * 2;
  const available = slotsPerDay * (i.peakDays + i.offDays);
  const peakSlots = slotsPerDay * i.peakDays * (i.peakUtil / 100);
  const offSlots = slotsPerDay * i.offDays * (i.offPeakUtil / 100);
  const rented = peakSlots + offSlots;
  const fs = i.fullShare / 100;
  const revSlot = (fs * i.fullPrice) / 2 + (1 - fs) * i.halfPrice;
  const rentals = rented * (1 - fs / 2);
  const rentalRevenue = rented * revSlot;
  const addOnRevenue = rentals * i.addOn;
  const revenue = rentalRevenue + addOnRevenue;
  const lossCost = revenue * (i.lossPct / 100);
  const cardFees = revenue * (i.cardPct / 100);
  const staffCost = i.staff * i.hoursOpen * (i.peakDays + i.offDays) * i.wage * (1 + i.burdenPct / 100);
  const rent = i.rentMonthly * i.rentMonths;
  const wear = rented * i.wearPerSlot;
  const battery = (rentals * i.batteryCost) / i.batteryLife;
  const reserve = (i.bikes * i.bikeCost * (1 - i.resalePct / 100)) / i.lifeSeasons;
  const fixed = rent + i.insurance + i.marketing + i.otherAnnual;
  const costs = lossCost + cardFees + staffCost + wear + battery + reserve + fixed;
  return { slotsPerDay, available, peakSlots, offSlots, rented, utilization: available > 0 ? rented / available : 0, revSlot, rentals, rentalRevenue, addOnRevenue, revenue, lossCost, cardFees, staffCost, rent, wear, battery, reserve, fixed, costs };
}

const operatingOf = (i) => { const f = figures(i); return f.revenue - f.costs; };

// Operating profit and revenue are linear in a scale factor on utilization or on the price level.
function line(i, scale, f) {
  const at = (k) => f(scale(i, k));
  const c = at(0), m = at(1) - c;
  return { c, m };
}
const utilScale = (i, k) => ({ ...i, peakUtil: i.peakUtil * k, offPeakUtil: i.offPeakUtil * k });
const priceScale = (i, k) => ({ ...i, halfPrice: i.halfPrice * k, fullPrice: i.fullPrice * k });

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const f = figures(i);
  const capex = capexOf(i);
  const loan = loanOf(i);
  const operating = f.revenue - f.costs;
  const profit = operating - loan;
  const margin = f.revenue > 0 ? profit / f.revenue : null;
  const paybackYears = operating > 0 ? capex / operating : null;

  const uProfit = line(i, utilScale, (x) => operatingOf(x) - loanOf(x));
  const breakevenScale = uProfit.m > 0 ? -uProfit.c / uProfit.m : null;
  const breakevenUtil = breakevenScale === null ? null : Math.max(0, f.utilization * breakevenScale);
  const uOp = line(i, utilScale, operatingOf);
  const paybackScale = uOp.m > 0 ? (capex / i.targetPaybackYears - uOp.c) / uOp.m : null;
  const paybackUtil = paybackScale === null ? null : Math.max(0, f.utilization * paybackScale);

  const pProfit = line(i, priceScale, (x) => operatingOf(x) - loanOf(x));
  const pOp = line(i, priceScale, operatingOf);
  const pRev = line(i, priceScale, (x) => figures(x).revenue);
  const t = i.targetMarginPct / 100;
  const den = pProfit.m - t * pRev.m;
  const kBreak = pProfit.m > 0 ? Math.max(0, -pProfit.c / pProfit.m) : null;
  const kMargin = den > 0 ? Math.max(0, (t * pRev.c - pProfit.c) / den) : null;
  const kPayback = pOp.m > 0 ? Math.max(0, (capex / i.targetPaybackYears - pOp.c) / pOp.m) : null;
  const prices = (k) => (k === null ? null : { half: i.halfPrice * k, full: i.fullPrice * k });

  const sensitivity = [10, 20].map((cut) => {
    const x = utilScale(i, 1 - cut / 100);
    const op = operatingOf(x);
    return { change: -cut, utilization: figures(x).utilization, profit: op - loanOf(x), paybackYears: op > 0 ? capex / op : null };
  });

  const result = {
    ok: true, input: i, ...f, capex, loanPayment: loan, operating, profit, margin, paybackYears,
    paybackMonths: paybackYears === null ? null : paybackYears * 12, profitPerBike: profit / i.bikes, revenuePerBike: f.revenue / i.bikes,
    breakevenUtil, paybackUtil, breakevenPrices: prices(kBreak), marginPrices: prices(kMargin), paybackPrices: prices(kPayback),
    meets: paybackYears !== null && paybackYears <= i.targetPaybackYears, sensitivity,
    staffShare: f.revenue > 0 ? f.staffCost / f.revenue : null,
  };
  result.notes = buildNotes(result);
  return result;
}

function buildNotes(r) {
  const n = [];
  const i = r.input;
  if (r.operating <= 0) n.push("At these numbers the shop does not cover its own running costs, so there is no payback. See the utilization and prices needed below.");
  else if (r.profit < 0) n.push("The shop covers its running costs but not the loan payments.");
  if (r.staffShare !== null && r.staffShare > 0.5) n.push(`Staff is ${(r.staffShare * 100).toFixed(0)}% of revenue. Fewer staff hours on quiet days is often worth more than a few more rentals.`);
  if (i.peakUtil > 85) n.push("Busy-day utilization above 85% means nearly every bike is out all day. Bikes need charging and inspection between rentals, so check it is believable.");
  if (i.fullPrice > 0 && i.halfPrice > 0 && i.fullPrice >= 2 * i.halfPrice) n.push("The full-day price is at least double the half-day price, so renters have no reason to take a full day.");
  if (i.lossPct === 0) n.push("Damage and theft is set to zero. Most rental shops lose something to both, plus the deductible on a claim.");
  return n;
}

export function compareScenarios(input, overrides) {
  const a = solve(input);
  const b = solve({ ...input, ...overrides });
  const errors = [...(a.ok ? [] : a.errors.map((m) => "Scenario A: " + m)), ...(b.ok ? [] : b.errors.map((m) => "Scenario B: " + m))];
  if (errors.length) return { ok: false, errors };
  const pa = a.paybackYears ?? Infinity, pb = b.paybackYears ?? Infinity;
  const notes = [];
  if (b.input.bikes > a.input.bikes && b.profitPerBike < a.profitPerBike) notes.push("Scenario B earns less per bike than A: each added bike is working fewer days. Check that the utilization you entered for B is believable.");
  return { ok: true, a, b, winnerProfit: a.profit === b.profit ? "tie" : a.profit > b.profit ? "A" : "B", winnerPayback: pa === pb ? "tie" : pa < pb ? "A" : "B", notes };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    bikes: 20, bikeCost: 2200, resalePct: 35, lifeSeasons: 3, startupCapex: 12000, peakDays: 100, peakUtil: 70, offDays: 80, offPeakUtil: 25,
    halfPrice: 40, fullPrice: 65, fullShare: 45, addOn: 6, lossPct: 3, cardPct: 3, staff: 2, hoursOpen: 9, wage: 17, burdenPct: 12,
    rentMonthly: 2500, rentMonths: 8, insurance: 4000, marketing: 3000, otherAnnual: 1500, wearPerSlot: 1.8, batteryCost: 650, batteryLife: 700,
    financedPct: 0, aprPct: 9, termMonths: 48, targetPaybackYears: 2, targetMarginPct: 20,
  };
}
export function sampleScenario() {
  return { bikes: 30, peakUtil: 62, offPeakUtil: 22, halfPrice: 40, fullPrice: 65 };
}

export function resultText(r) {
  return [
    `E-bike rental season check: ${r.input.bikes} bikes, ${r.rented.toFixed(0)} half-day slots rented, ${pct(r.utilization)} utilization`,
    `Revenue ${money(r.revenue)} a season (${cents(r.revSlot)} per slot rented plus add-ons ${money(r.addOnRevenue)})`,
    `Costs ${money(r.costs)} (staff ${money(r.staffCost)}, fixed ${money(r.fixed)}, fleet replacement reserve ${money(r.reserve)})`,
    `Profit ${money(r.profit)} a season, margin ${r.margin === null ? "n/a" : pct(r.margin)}, ${money(r.profitPerBike)} per bike`,
    `Start-up cost ${money(r.capex)}; payback ${r.paybackYears === null ? "never at these numbers" : `${r.paybackYears.toFixed(1)} years`}`,
    `Break-even utilization: ${r.breakevenUtil === null ? "n/a" : pct(r.breakevenUtil)} of slots`,
    r.marginPrices ? `Prices for a ${r.input.targetMarginPct}% margin: half-day ${cents(r.marginPrices.half)}, full-day ${cents(r.marginPrices.full)}` : "",
    "Planning estimate on the numbers typed; not tax, legal, lending or financial advice.",
  ].filter(Boolean).join("\n");
}

export function resultCsv(r) {
  const nz = (v) => (v === null ? "" : v);
  const rows = [
    ["bikes", r.input.bikes], ["slots_available", r.available], ["slots_rented", r.rented], ["utilization", r.utilization], ["rentals", r.rentals], ["revenue_per_slot", r.revSlot],
    ["rental_revenue", r.rentalRevenue], ["add_on_revenue", r.addOnRevenue], ["revenue", r.revenue], ["damage_theft", r.lossCost], ["card_fees", r.cardFees], ["staff", r.staffCost],
    ["rent", r.rent], ["wear", r.wear], ["batteries", r.battery], ["fleet_replacement_reserve", r.reserve], ["fixed_costs", r.fixed], ["total_costs", r.costs],
    ["operating_profit", r.operating], ["loan_payments", r.loanPayment], ["season_profit", r.profit], ["margin", nz(r.margin)], ["profit_per_bike", r.profitPerBike],
    ["start_up_cost", r.capex], ["payback_years", nz(r.paybackYears)], ["breakeven_utilization", nz(r.breakevenUtil)], ["utilization_for_payback_target", nz(r.paybackUtil)],
    ["break_even_half_day_price", nz(r.breakevenPrices?.half ?? null)], ["break_even_full_day_price", nz(r.breakevenPrices?.full ?? null)],
    ["margin_target_half_day_price", nz(r.marginPrices?.half ?? null)], ["margin_target_full_day_price", nz(r.marginPrices?.full ?? null)],
    ["payback_target_half_day_price", nz(r.paybackPrices?.half ?? null)], ["payback_target_full_day_price", nz(r.paybackPrices?.full ?? null)],
  ];
  return "metric,value\n" + rows.map(([k, v]) => `${k},${typeof v === "number" ? Number(v.toFixed(4)) : v}`).join("\n") + "\n";
}

export function serializeState(input, scenario) { return JSON.stringify({ app: APP, version: 1, input, scenario: scenario || null }, null, 2); }
export function parseState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!o || o.app !== APP || typeof o.input !== "object" || o.input === null) return { error: "That file is not a saved e-bike rental analysis." };
  const input = {};
  for (const k of Object.keys(sampleInput())) if (Number.isFinite(o.input[k])) input[k] = o.input[k];
  const scenario = {};
  if (o.scenario && typeof o.scenario === "object") for (const k of SCENARIO_KEYS) if (Number.isFinite(o.scenario[k])) scenario[k] = o.scenario[k];
  return { input: { ...sampleInput(), ...input }, scenario: { ...sampleScenario(), ...scenario } };
}
