// Indoor golf simulator bay economics. A simulator lounge (or any bay-rental
// entertainment venue: golf, baseball, axe lanes) sells bay hours at a peak and an
// off-peak rate, sells memberships whose hours also use those bays, and sells food
// and drink per player-hour. The build costs $25k-$60k a bay plus a buildout, so the
// owner needs to know three things before signing a lease: monthly profit at a
// believable utilization, how long the money takes to come back, and what utilization
// the room must reach to break even.
//
//   avail      = bays * hoursPerDay * daysPerWeek * 52 / 12            (bay-hours a month)
//   booked     = availPeak * peakUtil + availOff * offUtil              (bay-hours sold)
//   walkIn     = max(0, booked - memberHours)  priced at the blended rate
//   revenue    = walkInRevenue + members * fee + leagueNights * leagueRevenue + booked * players * spendPerPlayerHour
//   profit     = revenue - fb cost - card fees - repair reserve - fixed monthly costs - loan payment
//   payback    = capex / (profit + loan payment)   (months; before the loan, so borrowing does not flatter it)
//   minPaybackPeakRate = peak rate at which payback equals the target (exact; operating profit is linear in it)
//   sensitivity = the same room with every booked hour cut by 10% and 20%
//   minRates   = peak and off-peak rates scaled by k so margin = target   (exact)
//   breakeven  = utilization multiplier s with profit(s) = 0, as % of available bay-hours

export const SCENARIO_KEYS = ["bays", "peakRate", "offPeakRate", "peakUtil", "offPeakUtil", "members", "memberFee"];

// Fields added after the first version; a saved file or caller without them gets neutral values.
const NEW_DEFAULTS = { leagueNights: 0, leagueRevenue: 0, financedPct: 0, aprPct: 0, termMonths: 60, targetPaybackMonths: 18 };
const norm = (i) => ({ ...NEW_DEFAULTS, ...i });

export function loanPayment(principal, aprPct, months) {
  if (!(principal > 0)) return 0;
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function loanOf(i) {
  return loanPayment(((i.bays * i.bayCost + i.buildout) * i.financedPct) / 100, i.aprPct, i.termMonths);
}

export function validateInput(raw) {
  const i = norm(raw);
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!(Number.isInteger(i.bays) && i.bays >= 1 && i.bays <= 50)) e.push("Bays must be a whole number between 1 and 50.");
  if (!pos(i.hoursPerDay, 24)) e.push("Open hours per day must be above 0 and at most 24.");
  if (!pos(i.daysPerWeek, 7)) e.push("Open days per week must be above 0 and at most 7.");
  if (!nonneg(i.peakShare, 100)) e.push("Peak share of open hours must be between 0% and 100%.");
  if (!nonneg(i.peakUtil, 100)) e.push("Peak utilization must be between 0% and 100%.");
  if (!nonneg(i.offPeakUtil, 100)) e.push("Off-peak utilization must be between 0% and 100%.");
  if (!nonneg(i.peakRate, 1000)) e.push("Peak rate must be between $0 and $1,000 per bay hour.");
  if (!nonneg(i.offPeakRate, 1000)) e.push("Off-peak rate must be between $0 and $1,000 per bay hour.");
  if (!(Number.isInteger(i.members) && i.members >= 0 && i.members <= 5000)) e.push("Members must be a whole number between 0 and 5,000.");
  if (!nonneg(i.memberFee, 5000)) e.push("Monthly member fee must be between $0 and $5,000.");
  if (!nonneg(i.hoursPerMember, 200)) e.push("Bay hours a member uses each month must be between 0 and 200.");
  if (!pos(i.players, 12)) e.push("Players per bay hour must be above 0 and at most 12.");
  if (!nonneg(i.fbSpend, 500)) e.push("Food and drink spend per player hour must be between $0 and $500.");
  if (!nonneg(i.cogsPct, 100)) e.push("Food and drink cost must be between 0% and 100%.");
  if (!nonneg(i.staff, 50)) e.push("Staff on duty must be between 0 and 50.");
  if (!nonneg(i.wage, 500)) e.push("Staff hourly wage must be between $0 and $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.rent, 1000000)) e.push("Monthly rent must be between $0 and $1,000,000.");
  if (!nonneg(i.utilities, 1000000)) e.push("Monthly utilities must be between $0 and $1,000,000.");
  if (!nonneg(i.softwarePerBay, 10000)) e.push("Software and booking cost per bay a month must be between $0 and $10,000.");
  if (!nonneg(i.otherFixed, 1000000)) e.push("Monthly insurance and other fixed costs must be between $0 and $1,000,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card and booking fees must be between 0% and 15%.");
  if (!nonneg(i.reservePct, 30)) e.push("Repair and replacement reserve must be between 0% and 30% of revenue.");
  if (!nonneg(i.bayCost, 1000000)) e.push("Cost per bay must be between $0 and $1,000,000.");
  if (!nonneg(i.buildout, 10000000)) e.push("Shared buildout cost must be between $0 and $10,000,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (!nonneg(i.leagueNights, 120)) e.push("League nights must be between 0 and 120 a month.");
  if (!nonneg(i.leagueRevenue, 1000000)) e.push("Revenue per league night must be between $0 and $1,000,000.");
  if (!nonneg(i.financedPct, 100)) e.push("Financed share of the build must be between 0% and 100%.");
  if (!nonneg(i.aprPct, 60)) e.push("Interest rate must be between 0% and 60%.");
  if (!(Number.isInteger(i.termMonths) && i.termMonths >= 1 && i.termMonths <= 360)) e.push("Loan term must be a whole number of months between 1 and 360.");
  if (!(Number.isFinite(i.targetPaybackMonths) && i.targetPaybackMonths >= 1 && i.targetPaybackMonths <= 240)) e.push("Target payback must be between 1 and 240 months.");
  if (e.length === 0 && i.processPct + i.reservePct + i.targetMargin >= 100) e.push("Card fees plus repair reserve plus target margin must be under 100%.");
  return e;
}

// profit as a function of a utilization multiplier s, without clamping walk-in hours at
// zero, so it is exactly linear in s and the break-even can be solved from two points.
function parts(i, s) {
  const availPerBay = (i.hoursPerDay * i.daysPerWeek * 52) / 12;
  const avail = i.bays * availPerBay;
  const availPeak = avail * (i.peakShare / 100);
  const availOff = avail - availPeak;
  const bookedPeak = availPeak * (i.peakUtil / 100) * s;
  const bookedOff = availOff * (i.offPeakUtil / 100) * s;
  const booked = bookedPeak + bookedOff;
  const wPeak = availPeak * (i.peakUtil / 100);
  const wOff = availOff * (i.offPeakUtil / 100);
  // blended rate is independent of s: both bookings scale together
  const blend = wPeak + wOff > 0 ? (wPeak * i.peakRate + wOff * i.offPeakRate) / (wPeak + wOff) : i.peakRate * (i.peakShare / 100) + i.offPeakRate * (1 - i.peakShare / 100);
  const memberHours = i.members * i.hoursPerMember;
  return { avail, availPeak, availOff, bookedPeak, bookedOff, booked, blend, memberHours, wPeak, wOff };
}

function profitAt(i, s, clamp = false) {
  const p = parts(i, s);
  const walkInRevenue = p.blend * (clamp ? Math.max(0, p.booked - p.memberHours) : p.booked - p.memberHours);
  const memberRevenue = i.members * i.memberFee;
  const fbRevenue = p.booked * i.players * i.fbSpend;
  const revenue = walkInRevenue + memberRevenue + i.leagueNights * i.leagueRevenue + fbRevenue;
  const fbCost = fbRevenue * (i.cogsPct / 100);
  const variable = revenue * (i.processPct / 100 + i.reservePct / 100);
  return revenue - fbCost - variable - fixedCosts(i, p.avail) - loanOf(i);
}

function fixedCosts(i, avail) {
  const openHours = (avail / i.bays) ; // venue open hours a month
  const staffCost = openHours * i.staff * i.wage * (1 + i.burdenPct / 100);
  return i.rent + i.utilities + i.softwarePerBay * i.bays + i.otherFixed + staffCost;
}

function figures(i) {
  const leagueRevenue = i.leagueNights * i.leagueRevenue;
  const payment = loanOf(i);
  const p = parts(i, 1);
  const f = i.processPct / 100;
  const r = i.reservePct / 100;
  const m = i.targetMargin / 100;
  const walkInHours = Math.max(0, p.booked - p.memberHours);
  const walkInRevenue = p.blend * walkInHours;
  const memberRevenue = i.members * i.memberFee;
  const fbRevenue = p.booked * i.players * i.fbSpend;
  const revenue = walkInRevenue + memberRevenue + leagueRevenue + fbRevenue;
  const fbCost = fbRevenue * (i.cogsPct / 100);
  const cardFees = revenue * f;
  const reserve = revenue * r;
  const openHours = p.avail / i.bays;
  const staffCost = openHours * i.staff * i.wage * (1 + i.burdenPct / 100);
  const fixed = fixedCosts(i, p.avail);
  const costs = fbCost + cardFees + reserve + fixed + payment;
  const profit = revenue - costs;
  const margin = revenue > 0 ? profit / revenue : null;
  const capex = i.bays * i.bayCost + i.buildout;
  const operating = profit + payment;
  const paybackMonths = operating > 0 ? capex / operating : null;
  const utilization = p.booked / p.avail;
  const revenuePerBookedHour = p.booked > 0 ? revenue / p.booked : null;
  const profitPerBay = profit / i.bays;
  // lowest rates for the target margin: scale both walk-in rates by k
  let rateScale = null;
  if (walkInRevenue > 0) {
    const needed = (fbCost + fixed + payment) / (1 - f - r - m);
    rateScale = (needed - memberRevenue - leagueRevenue - fbRevenue) / walkInRevenue;
  }
  const minPeakRate = rateScale === null ? null : Math.max(0, rateScale * i.peakRate);
  const minOffPeakRate = rateScale === null ? null : Math.max(0, rateScale * i.offPeakRate);
  // break-even utilization: profit is linear in the multiplier s
  const p0 = profitAt(i, 0);
  const p1 = profitAt(i, 1);
  let breakevenUtil = null;
  if (p1 - p0 > 1e-9 && p.booked > 0) {
    const s = -p0 / (p1 - p0);
    breakevenUtil = s > 0 ? (s * p.booked) / p.avail : 0;
  }
  // lowest peak rate for the payback target: operating profit is linear in the peak rate
  const peakWeight = p.wPeak + p.wOff > 0 ? p.wPeak / (p.wPeak + p.wOff) : 0;
  const peakWalkIn = peakWeight * walkInHours;
  const needOperating = capex / i.targetPaybackMonths;
  const minPaybackPeakRate = peakWalkIn > 0 && capex > 0 ? Math.max(0, i.peakRate + (needOperating - operating) / (peakWalkIn * (1 - f - r))) : null;
  const meetsPayback = paybackMonths !== null && paybackMonths <= i.targetPaybackMonths + 1e-9;
  const sensitivity = [-10, -20].map((d) => {
    const s = 1 + d / 100;
    const sp = profitAt(i, s, true);
    const op = sp + payment;
    return { change: d, utilization: utilization * s, profit: sp, annualProfit: sp * 12, operating: op, paybackMonths: op > 0 ? capex / op : null };
  });
  return {
    leagueRevenue, loanPayment: payment, financed: (capex * i.financedPct) / 100, operating, minPaybackPeakRate, meetsPayback, needOperating, sensitivity,
    avail: p.avail, openHours, booked: p.booked, bookedPeak: p.bookedPeak, bookedOff: p.bookedOff, memberHours: p.memberHours, walkInHours,
    blendRate: p.blend, utilization, walkInRevenue, memberRevenue, fbRevenue, revenue, fbCost, cardFees, reserve, staffCost, fixed, costs, profit, margin,
    profitPerBay, revenuePerBookedHour, capex, paybackMonths, paybackYears: paybackMonths === null ? null : paybackMonths / 12,
    rateScale, minPeakRate, minOffPeakRate, meets: margin !== null && margin >= m - 1e-12, breakevenUtil,
    annualProfit: profit * 12, memberOverbooked: p.memberHours > p.booked + 1e-9,
  };
}

export function solve(raw) {
  const input = norm(raw);
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const f = figures(input);
  return { ok: true, input, ...f, notes: buildNotes(input, f) };
}

function buildNotes(i, f) {
  const n = [];
  if (f.profit < 0) n.push(`The room loses ${cents(-f.profit)} a month at ${pct(f.utilization)} utilization. It needs ${f.breakevenUtil === null ? "more revenue per hour" : pct(f.breakevenUtil) + " of bay hours booked"} to break even.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. Lifting both walk-in rates by ${pct(f.rateScale - 1)} (peak ${cents(f.minPeakRate)}, off-peak ${cents(f.minOffPeakRate)}) would reach it.`);
  if (f.memberOverbooked) n.push(`Members use ${f.memberHours.toFixed(0)} bay hours a month but only ${f.booked.toFixed(0)} are booked in total. Raise utilization or lower the hours per member; walk-in revenue is counted as zero until then.`);
  if (f.paybackMonths !== null && !f.meetsPayback && f.minPaybackPeakRate !== null) n.push(`Payback is ${f.paybackMonths.toFixed(1)} months, past your ${i.targetPaybackMonths}-month target. A peak rate of at least ${cents(f.minPaybackPeakRate)} reaches it, ${cents(f.minPaybackPeakRate - i.peakRate)} more than now.`);
  if (f.profit < 0 && f.operating > 0) n.push(`The room covers its running costs but not the loan: after the ${money(f.loanPayment)} monthly payment it loses ${money(-f.profit)} a month.`);
  if (f.sensitivity[1].profit < 0 && f.profit >= 0) n.push(`If bookings come in 20% under plan, the room loses ${money(-f.sensitivity[1].profit)} a month.`);
  if (f.paybackMonths === null) n.push("The room makes no profit at these numbers, so the build never pays back.");
  else if (f.paybackMonths > 60) n.push(`Payback is ${(f.paybackMonths / 12).toFixed(1)} years. Most lenders and landlords want to see less than five.`);
  if (f.revenue > 0 && f.fbRevenue / f.revenue > 0.4) n.push(`Food and drink is ${((f.fbRevenue / f.revenue) * 100).toFixed(0)}% of revenue. Check the spend per player hour against what your own bar and kitchen can serve in a booked hour.`);
  return n;
}

export function compareScenarios(input, altOverrides) {
  const a = solve(input);
  if (!a.ok) return { ok: false, errors: a.errors };
  const alt = { ...input };
  for (const k of SCENARIO_KEYS) if (altOverrides && altOverrides[k] !== undefined) alt[k] = altOverrides[k];
  const b = solve(alt);
  if (!b.ok) return { ok: false, errors: b.errors.map((x) => `Scenario B: ${x}`) };
  const pick = (x, y) => (y > x + 0.5 ? "B" : x > y + 0.5 ? "A" : "tie");
  const byProfit = pick(a.profit, b.profit);
  const pa = a.paybackMonths === null ? Infinity : a.paybackMonths;
  const pb = b.paybackMonths === null ? Infinity : b.paybackMonths;
  const byPayback = pb < pa - 0.05 ? "B" : pa < pb - 0.05 ? "A" : "tie";
  const notes = [];
  if (byProfit === "tie") notes.push("The two scenarios make the same monthly profit.");
  else {
    const win = byProfit === "A" ? a : b;
    const lose = byProfit === "A" ? b : a;
    notes.push(`Scenario ${byProfit} makes ${money(win.profit - lose.profit)} more a month (${money(win.profit)} against ${money(lose.profit)}).`);
  }
  if (byPayback !== byProfit && byPayback !== "tie" && byProfit !== "tie") notes.push(`Scenario ${byPayback} pays back sooner. If cash is tighter than profit, Scenario ${byPayback} is the safer build even though Scenario ${byProfit} earns more once it is paid for.`);
  return { ok: true, a, b, winnerProfit: byProfit, winnerPayback: byPayback, profitDifference: b.profit - a.profit, notes };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    bays: 3, hoursPerDay: 14, daysPerWeek: 7, peakShare: 35, peakUtil: 50, offPeakUtil: 18, peakRate: 55, offPeakRate: 35,
    members: 25, memberFee: 150, hoursPerMember: 3, players: 2.5, fbSpend: 12, cogsPct: 30,
    staff: 1, wage: 17, burdenPct: 12, rent: 6500, utilities: 900, softwarePerBay: 150, otherFixed: 700,
    processPct: 3, reservePct: 4, bayCost: 28000, buildout: 45000, targetMargin: 30,
    leagueNights: 0, leagueRevenue: 0, financedPct: 0, aprPct: 9, termMonths: 60, targetPaybackMonths: 18,
  };
}

export function sampleScenario() {
  return { bays: 5, peakRate: 55, offPeakRate: 35, peakUtil: 32, offPeakUtil: 10, members: 45, memberFee: 150 };
}

export function resultText(r) {
  return [
    `Golf simulator room check: ${r.input.bays} bays, ${r.avail.toFixed(0)} bay hours a month, ${pct(r.utilization)} booked`,
    `Revenue ${cents(r.revenue)} a month (walk-in ${cents(r.walkInRevenue)}, members ${cents(r.memberRevenue)}, food and drink ${cents(r.fbRevenue)})`,
    `Costs ${cents(r.costs)} (staff ${cents(r.staffCost)}, fixed ${cents(r.fixed)})`,
    `Profit ${cents(r.profit)} a month, margin ${r.margin === null ? "n/a" : pct(r.margin)}, ${cents(r.profitPerBay)} per bay`,
    `Build cost ${money(r.capex)}; payback ${r.paybackMonths === null ? "never at these numbers" : `${r.paybackMonths.toFixed(1)} months (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even utilization: ${r.breakevenUtil === null ? "n/a" : pct(r.breakevenUtil)} of bay hours`,
    r.loanPayment > 0 ? `Loan payment ${cents(r.loanPayment)} a month is included in costs; payback is measured before it.` : "No loan payment entered.",
    `Lowest peak rate for a ${r.input.targetPaybackMonths}-month payback: ${r.minPaybackPeakRate === null ? "n/a" : cents(r.minPaybackPeakRate)}`,
    ...r.sensitivity.map((s) => `Bookings ${s.change}%: profit ${cents(s.profit)} a month, payback ${s.paybackMonths === null ? "never" : s.paybackMonths.toFixed(1) + " months"}`),
    `Lowest rates for a ${r.input.targetMargin}% margin: ${r.minPeakRate === null ? "n/a" : `peak ${cents(r.minPeakRate)}, off-peak ${cents(r.minOffPeakRate)}`}`,
    "Arithmetic on the numbers entered, not tax, legal, lending or financial advice.",
  ].join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["available_bay_hours", r.avail], ["booked_bay_hours", r.booked], ["utilization", r.utilization], ["blended_rate", r.blendRate], ["walk_in_revenue", r.walkInRevenue],
    ["member_revenue", r.memberRevenue], ["food_drink_revenue", r.fbRevenue], ["revenue", r.revenue], ["food_drink_cost", r.fbCost], ["card_fees", r.cardFees],
    ["repair_reserve", r.reserve], ["staff", r.staffCost], ["fixed_costs", r.fixed], ["total_costs", r.costs], ["monthly_profit", r.profit], ["margin", r.margin === null ? "" : r.margin],
    ["profit_per_bay", r.profitPerBay], ["build_cost", r.capex], ["payback_months", r.paybackMonths === null ? "" : r.paybackMonths],
    ["breakeven_utilization", r.breakevenUtil === null ? "" : r.breakevenUtil], ["minimum_peak_rate", r.minPeakRate === null ? "" : r.minPeakRate],
    ["minimum_off_peak_rate", r.minOffPeakRate === null ? "" : r.minOffPeakRate], ["annual_profit", r.annualProfit],
    ["league_revenue", r.leagueRevenue], ["loan_payment", r.loanPayment], ["operating_profit_before_loan", r.operating], ["minimum_peak_rate_for_payback_target", r.minPaybackPeakRate === null ? "" : r.minPaybackPeakRate],
    ...r.sensitivity.flatMap((s) => [[`profit_at_${-s.change}pct_fewer_bookings`, s.profit], [`payback_months_at_${-s.change}pct_fewer_bookings`, s.paybackMonths === null ? "" : s.paybackMonths]]),
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "golf-simulator-bay-profit-calculator";
export function serializeState(input, scenario) { return JSON.stringify({ app: APP, version: 1, input, scenario: scenario || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved golf simulator room scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, scenario: d.scenario && typeof d.scenario === "object" ? d.scenario : null };
}
