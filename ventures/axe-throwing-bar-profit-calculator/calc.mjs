// Axe throwing bar / venue economics. A bar sells timed jump
// sessions at a ticket price, books private events at a flat package price, sells
// leagues and food and drinks, and carries heavy fixed costs (a 20,000+ sq ft lease, floor
// staff, insurance). The owner needs three numbers before signing the lease: monthly
// profit at a believable fill rate, how long the build takes to pay back, and the fill
// rate the bar must reach to break even.
//
//   capacity   = throwers per session * sessions per day * days per week * 52 / 12   (thrower slots a month)
//   visits     = capacity * fill                                                      (walk-in and league player throwers)
//   revenue    = visits * ticket + parties * partyPrice + members * fee + visits * snackSpend
//   variable   = food and drink cost + party cost * parties + (card fees + repair reserve) * revenue
//   profit     = revenue - variable - fixed - loan payment
//   payback    = build cost / (profit + loan payment)   (months; before the loan, so borrowing does not flatter it)
//   breakeven  = fill multiplier s with profit(s) = 0, as % of thrower slots (exact: profit is linear in s)
//   minTicket  = ticket at which margin = target (exact)  and at which payback = target (exact)

export const SCENARIO_KEYS = ["capacity", "ticket", "fill", "parties", "partyPrice", "members", "memberFee"];

export function loanPayment(principal, aprPct, months) {
  if (!(principal > 0)) return 0;
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

const loanOf = (i) => loanPayment(((i.buildCost + i.fitout) * i.financedPct) / 100, i.aprPct, i.termMonths);

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!(Number.isInteger(i.capacity) && i.capacity >= 1 && i.capacity <= 2000)) e.push("Throwers per session must be a whole number between 1 and 2,000.");
  if (!(Number.isInteger(i.sessions) && i.sessions >= 1 && i.sessions <= 24)) e.push("Sessions per day must be a whole number between 1 and 24.");
  if (!pos(i.daysPerWeek, 7)) e.push("Open days per week must be above 0 and at most 7.");
  if (!nonneg(i.fill, 100)) e.push("Average fill must be between 0% and 100% of thrower slots.");
  if (!nonneg(i.ticket, 500)) e.push("Ticket price must be between $0 and $500.");
  if (!nonneg(i.snackSpend, 200)) e.push("Food and drink spend per visit must be between $0 and $200.");
  if (!nonneg(i.snackCogsPct, 100)) e.push("Food and drink cost must be between 0% and 100%.");
  if (!(Number.isInteger(i.parties) && i.parties >= 0 && i.parties <= 2000)) e.push("Parties a month must be a whole number between 0 and 2,000.");
  if (!nonneg(i.partyPrice, 10000)) e.push("Party package price must be between $0 and $10,000.");
  if (!nonneg(i.partyCost, 10000)) e.push("Cost per party (food, host, supplies) must be between $0 and $10,000.");
  if (!(Number.isInteger(i.members) && i.members >= 0 && i.members <= 20000)) e.push("League players must be a whole number between 0 and 20,000.");
  if (!nonneg(i.memberFee, 1000)) e.push("Monthly league player fee must be between $0 and $1,000.");
  if (!nonneg(i.staff, 200)) e.push("Coaches and bar staff on duty must be between 0 and 200.");
  if (!nonneg(i.wage, 500)) e.push("Staff hourly wage must be between $0 and $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.rent, 1000000)) e.push("Monthly rent must be between $0 and $1,000,000.");
  if (!nonneg(i.utilities, 1000000)) e.push("Monthly utilities must be between $0 and $1,000,000.");
  if (!nonneg(i.insurance, 1000000)) e.push("Monthly insurance must be between $0 and $1,000,000.");
  if (!nonneg(i.otherFixed, 1000000)) e.push("Monthly software, marketing and other fixed costs must be between $0 and $1,000,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card and booking fees must be between 0% and 15%.");
  if (!nonneg(i.reservePct, 30)) e.push("Equipment repair and replacement reserve must be between 0% and 30% of revenue.");
  if (!nonneg(i.buildCost, 50000000)) e.push("Lanes, targets and axes cost must be between $0 and $50,000,000.");
  if (!nonneg(i.fitout, 50000000)) e.push("Fit-out cost must be between $0 and $50,000,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (!nonneg(i.financedPct, 100)) e.push("Financed share of the build must be between 0% and 100%.");
  if (!nonneg(i.aprPct, 60)) e.push("Interest rate must be between 0% and 60%.");
  if (!(Number.isInteger(i.termMonths) && i.termMonths >= 1 && i.termMonths <= 360)) e.push("Loan term must be a whole number of months between 1 and 360.");
  if (!(Number.isFinite(i.targetPaybackMonths) && i.targetPaybackMonths >= 1 && i.targetPaybackMonths <= 240)) e.push("Target payback must be between 1 and 240 months.");
  if (e.length === 0 && i.processPct + i.reservePct + i.targetMargin >= 100) e.push("Card fees plus repair reserve plus target margin must be under 100%.");
  return e;
}

const slots = (i) => i.capacity * i.sessions * i.daysPerWeek * 52 / 12;
export const SESSION_HOURS = 1.75; // door-to-door hours per session slot, including changeover
const openHours = (i) => i.sessions * SESSION_HOURS * i.daysPerWeek * 52 / 12;

function fixedCosts(i) {
  const staffCost = openHours(i) * i.staff * i.wage * (1 + i.burdenPct / 100);
  return { staffCost, fixed: staffCost + i.rent + i.utilities + i.insurance + i.otherFixed };
}

// Profit with the visit count scaled by s. Linear in s, so break-even is solved from two points.
function profitAt(i, s) {
  const visits = slots(i) * (i.fill / 100) * s;
  const revenue = visits * (i.ticket + i.snackSpend) + i.parties * i.partyPrice + i.members * i.memberFee;
  const variable = visits * i.snackSpend * (i.snackCogsPct / 100) + i.parties * i.partyCost + revenue * (i.processPct + i.reservePct) / 100;
  return revenue - variable - fixedCosts(i).fixed - loanOf(i);
}

function figures(i) {
  const f = i.processPct / 100, r = i.reservePct / 100, m = i.targetMargin / 100;
  const avail = slots(i);
  const visits = avail * (i.fill / 100);
  const ticketRevenue = visits * i.ticket;
  const snackRevenue = visits * i.snackSpend;
  const partyRevenue = i.parties * i.partyPrice;
  const memberRevenue = i.members * i.memberFee;
  const revenue = ticketRevenue + snackRevenue + partyRevenue + memberRevenue;
  const snackCost = snackRevenue * (i.snackCogsPct / 100);
  const partyCost = i.parties * i.partyCost;
  const cardFees = revenue * f;
  const reserve = revenue * r;
  const { staffCost, fixed } = fixedCosts(i);
  const payment = loanOf(i);
  const costs = snackCost + partyCost + cardFees + reserve + fixed + payment;
  const profit = revenue - costs;
  const margin = revenue > 0 ? profit / revenue : null;
  const capex = i.buildCost + i.fitout;
  const operating = profit + payment;
  const paybackMonths = operating > 0 ? capex / operating : null;
  const other = snackRevenue + partyRevenue + memberRevenue;
  let minTicket = null;
  if (visits > 0) {
    const needed = (snackCost + partyCost + fixed + payment) / (1 - f - r - m);
    minTicket = Math.max(0, (needed - other) / visits);
  }
  const needOperating = capex / i.targetPaybackMonths;
  const minPaybackTicket = visits > 0 && capex > 0 ? Math.max(0, i.ticket + (needOperating - operating) / (visits * (1 - f - r))) : null;
  const p0 = profitAt(i, 0), p1 = profitAt(i, 1);
  let breakevenFill = null;
  if (p1 - p0 > 1e-9 && visits > 0) {
    const s = -p0 / (p1 - p0);
    breakevenFill = s > 0 ? (s * visits) / avail : 0;
  }
  const sensitivity = [-10, -20].map((d) => {
    const s = 1 + d / 100;
    const sp = profitAt(i, s);
    const op = sp + payment;
    return { change: d, fill: (visits * s) / avail, profit: sp, annualProfit: sp * 12, paybackMonths: op > 0 ? capex / op : null };
  });
  return {
    avail, visits, ticketRevenue, snackRevenue, partyRevenue, memberRevenue, revenue, snackCost, partyCost, cardFees, reserve, staffCost, fixed,
    loanPayment: payment, costs, profit, margin, capex, operating, paybackMonths, paybackYears: paybackMonths === null ? null : paybackMonths / 12,
    fillRate: avail > 0 ? visits / avail : 0, revenuePerVisit: visits > 0 ? revenue / visits : null, profitPerVisit: visits > 0 ? profit / visits : null,
    minTicket, minPaybackTicket, needOperating, meets: margin !== null && margin >= m - 1e-12,
    meetsPayback: paybackMonths !== null && paybackMonths <= i.targetPaybackMonths + 1e-9, breakevenFill, sensitivity, annualProfit: profit * 12,
    partyShare: revenue > 0 ? partyRevenue / revenue : 0,
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
  if (f.profit < 0) n.push(`The bar loses ${money(-f.profit)} a month at ${pct(f.fillRate)} fill. It needs ${f.breakevenFill === null ? "more revenue per visit" : pct(f.breakevenFill) + " of thrower slots filled"} to break even.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. A ticket of at least ${cents(f.minTicket)} reaches it, ${cents(f.minTicket - i.ticket)} more than now.`);
  if (f.paybackMonths !== null && !f.meetsPayback && f.minPaybackTicket !== null) n.push(`Payback is ${f.paybackMonths.toFixed(1)} months, past your ${i.targetPaybackMonths}-month target. A ticket of at least ${cents(f.minPaybackTicket)} reaches it.`);
  if (f.profit < 0 && f.operating > 0) n.push(`The bar covers its running costs but not the loan: after the ${money(f.loanPayment)} monthly payment it loses ${money(-f.profit)} a month.`);
  if (f.profit >= 0 && f.sensitivity[1].profit < 0) n.push(`If attendance comes in 20% under plan, the bar loses ${money(-f.sensitivity[1].profit)} a month. Weekday afternoon fill is usually the part that disappoints.`);
  if (f.paybackMonths === null) n.push("The bar makes no operating profit at these numbers, so the build never pays back.");
  else if (f.paybackMonths > 60) n.push(`Payback is ${(f.paybackMonths / 12).toFixed(1)} years. Most lenders and landlords want to see less than five.`);
  if (f.partyShare > 0.35) n.push(`Parties are ${(f.partyShare * 100).toFixed(0)}% of revenue. That income lands on weekends and is capped by your event lanes; check the count against the rooms and weekend hours you have.`);
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
    const win = byProfit === "A" ? a : b, lose = byProfit === "A" ? b : a;
    notes.push(`Scenario ${byProfit} makes ${money(win.profit - lose.profit)} more a month (${money(win.profit)} against ${money(lose.profit)}).`);
  }
  if (byPayback !== byProfit && byPayback !== "tie" && byProfit !== "tie") notes.push(`Scenario ${byPayback} pays back sooner. If cash is tighter than profit, it is the safer build even though Scenario ${byProfit} earns more once paid for.`);
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
    capacity: 32, sessions: 5, daysPerWeek: 6, fill: 28, ticket: 27, snackSpend: 10, snackCogsPct: 28,
    parties: 24, partyPrice: 520, partyCost: 150, members: 48, memberFee: 40,
    staff: 5, wage: 16, burdenPct: 12, rent: 10000, utilities: 1800, insurance: 2600, otherFixed: 2400,
    processPct: 3, reservePct: 3, buildCost: 100000, fitout: 180000, targetMargin: 20,
    financedPct: 0, aprPct: 9, termMonths: 84, targetPaybackMonths: 24,
  };
}

export function sampleScenario() {
  return { capacity: 32, ticket: 32, fill: 22, parties: 24, partyPrice: 520, members: 48, memberFee: 40 };
}

export function resultText(r) {
  return [
    `Axe throwing bar check: ${r.avail.toFixed(0)} thrower slots a month, ${pct(r.fillRate)} filled (${r.visits.toFixed(0)} visits)`,
    `Revenue ${cents(r.revenue)} a month (tickets ${cents(r.ticketRevenue)}, food and drinks ${cents(r.snackRevenue)}, parties ${cents(r.partyRevenue)}, league players ${cents(r.memberRevenue)})`,
    `Costs ${cents(r.costs)} (staff ${cents(r.staffCost)}, all fixed ${cents(r.fixed)})`,
    `Profit ${cents(r.profit)} a month, margin ${r.margin === null ? "n/a" : pct(r.margin)}`,
    `Build cost ${money(r.capex)}; payback ${r.paybackMonths === null ? "never at these numbers" : `${r.paybackMonths.toFixed(1)} months (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even fill: ${r.breakevenFill === null ? "n/a" : pct(r.breakevenFill)} of thrower slots`,
    `Lowest ticket for a ${r.input.targetMargin}% margin: ${r.minTicket === null ? "n/a" : cents(r.minTicket)}; for a ${r.input.targetPaybackMonths}-month payback: ${r.minPaybackTicket === null ? "n/a" : cents(r.minPaybackTicket)}`,
    ...r.sensitivity.map((s) => `Attendance ${s.change}%: profit ${cents(s.profit)} a month, payback ${s.paybackMonths === null ? "never" : s.paybackMonths.toFixed(1) + " months"}`),
    "Arithmetic on the numbers entered, not tax, legal, lending or financial advice.",
  ].join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["thrower_slots", r.avail], ["visits", r.visits], ["fill_rate", r.fillRate], ["ticket_revenue", r.ticketRevenue], ["snack_revenue", r.snackRevenue],
    ["party_revenue", r.partyRevenue], ["member_revenue", r.memberRevenue], ["revenue", r.revenue], ["snack_cost", r.snackCost], ["party_cost", r.partyCost],
    ["card_fees", r.cardFees], ["repair_reserve", r.reserve], ["staff", r.staffCost], ["fixed_costs", r.fixed], ["loan_payment", r.loanPayment], ["total_costs", r.costs],
    ["monthly_profit", r.profit], ["margin", r.margin === null ? "" : r.margin], ["build_cost", r.capex], ["payback_months", r.paybackMonths === null ? "" : r.paybackMonths],
    ["breakeven_fill", r.breakevenFill === null ? "" : r.breakevenFill], ["minimum_ticket_for_margin", r.minTicket === null ? "" : r.minTicket],
    ["minimum_ticket_for_payback", r.minPaybackTicket === null ? "" : r.minPaybackTicket], ["annual_profit", r.annualProfit],
    ...r.sensitivity.flatMap((s) => [[`profit_at_${-s.change}pct_fewer_visits`, s.profit], [`payback_months_at_${-s.change}pct_fewer_visits`, s.paybackMonths === null ? "" : s.paybackMonths]]),
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "axe-throwing-bar-profit-calculator";
export function serializeState(input, scenario) { return JSON.stringify({ app: APP, version: 1, input, scenario: scenario || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved axe throwing bar scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, scenario: d.scenario && typeof d.scenario === "object" ? d.scenario : null };
}
