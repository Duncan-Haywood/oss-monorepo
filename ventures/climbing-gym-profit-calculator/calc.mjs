// Climbing gym / bouldering gym economics. A gym sells day passes, recurring memberships,
// youth programs and birthday parties, plus rentals and a small shop, against heavy fixed
// costs (a 10,000-25,000 sq ft lease, front desk, route setters, insurance). Owners need
// three numbers before signing the lease: monthly profit at a believable membership count,
// how long the build takes to pay back, and the share of the plan the gym must hit to break even.
//
//   visits     = day passes + members * visits per member                   (climber visits a month)
//   revenue    = day passes * price + members * fee + kids * tuition + parties * partyPrice + visits * shop spend
//   variable   = shop cost + youth coaching + party cost * parties + (card fees + hold/rope reserve) * revenue
//   profit     = revenue - variable - fixed - loan payment
//   payback    = build cost / (profit + loan payment)   (months; before the loan, so borrowing does not flatter it)
//   breakeven  = demand multiplier s on day passes and members with profit(s) = 0 (exact: profit is linear in s)
//   minPass    = day-pass price at which margin = target (exact) and at which payback = target (exact)
//   minFee     = membership fee at which margin = target (exact)

export const SCENARIO_KEYS = ["dayPasses", "dayPassPrice", "members", "memberFee", "kids", "tuition", "parties"];

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
  const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!whole(i.capacity, 1, 3000)) e.push("Comfortable capacity must be a whole number of climbers between 1 and 3,000.");
  if (!nonneg(i.openHours, 168) || !(i.openHours > 0)) e.push("Open hours per week must be above 0 and at most 168.");
  if (!nonneg(i.visitHours, 12) || !(i.visitHours > 0)) e.push("Average visit length must be above 0 and at most 12 hours.");
  if (!whole(i.dayPasses, 0, 200000)) e.push("Day passes a month must be a whole number between 0 and 200,000.");
  if (!nonneg(i.dayPassPrice, 500)) e.push("Day pass price must be between $0 and $500.");
  if (!whole(i.members, 0, 50000)) e.push("Members must be a whole number between 0 and 50,000.");
  if (!nonneg(i.memberFee, 1000)) e.push("Monthly membership fee must be between $0 and $1,000.");
  if (!nonneg(i.memberVisits, 100)) e.push("Visits per member a month must be between 0 and 100.");
  if (!whole(i.kids, 0, 20000)) e.push("Youth program kids must be a whole number between 0 and 20,000.");
  if (!nonneg(i.tuition, 2000)) e.push("Monthly youth tuition must be between $0 and $2,000.");
  if (!nonneg(i.coachingPct, 100)) e.push("Youth coaching cost must be between 0% and 100% of tuition.");
  if (!whole(i.parties, 0, 2000)) e.push("Parties a month must be a whole number between 0 and 2,000.");
  if (!nonneg(i.partyPrice, 10000)) e.push("Party package price must be between $0 and $10,000.");
  if (!nonneg(i.partyCost, 10000)) e.push("Cost per party must be between $0 and $10,000.");
  if (!nonneg(i.shopSpend, 200)) e.push("Rentals, shop and cafe spend per visit must be between $0 and $200.");
  if (!nonneg(i.shopCogsPct, 100)) e.push("Shop and cafe cost must be between 0% and 100%.");
  if (!nonneg(i.staff, 200)) e.push("Front desk and floor staff on duty must be between 0 and 200.");
  if (!nonneg(i.wage, 500)) e.push("Staff hourly wage must be between $0 and $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.setters, 1000000)) e.push("Monthly route-setting cost must be between $0 and $1,000,000.");
  if (!nonneg(i.rent, 1000000)) e.push("Monthly rent must be between $0 and $1,000,000.");
  if (!nonneg(i.utilities, 1000000)) e.push("Monthly utilities must be between $0 and $1,000,000.");
  if (!nonneg(i.insurance, 1000000)) e.push("Monthly insurance must be between $0 and $1,000,000.");
  if (!nonneg(i.otherFixed, 1000000)) e.push("Monthly software, marketing and other fixed costs must be between $0 and $1,000,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card and billing fees must be between 0% and 15%.");
  if (!nonneg(i.reservePct, 30)) e.push("Hold, rope and auto-belay replacement reserve must be between 0% and 30% of revenue.");
  if (!nonneg(i.buildCost, 50000000)) e.push("Walls and equipment cost must be between $0 and $50,000,000.");
  if (!nonneg(i.fitout, 50000000)) e.push("Fit-out cost must be between $0 and $50,000,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (!nonneg(i.financedPct, 100)) e.push("Financed share of the build must be between 0% and 100%.");
  if (!nonneg(i.aprPct, 60)) e.push("Interest rate must be between 0% and 60%.");
  if (!whole(i.termMonths, 1, 360)) e.push("Loan term must be a whole number of months between 1 and 360.");
  if (!(Number.isFinite(i.targetPaybackMonths) && i.targetPaybackMonths >= 1 && i.targetPaybackMonths <= 240)) e.push("Target payback must be between 1 and 240 months.");
  if (e.length === 0 && i.processPct + i.reservePct + i.targetMargin >= 100) e.push("Card fees plus replacement reserve plus target margin must be under 100%.");
  return e;
}

const weeksPerMonth = 52 / 12;
const visitsAt = (i, s) => (i.dayPasses + i.members * i.memberVisits) * s;

function fixedCosts(i) {
  const staffCost = i.openHours * weeksPerMonth * i.staff * i.wage * (1 + i.burdenPct / 100);
  return { staffCost, fixed: staffCost + i.setters + i.rent + i.utilities + i.insurance + i.otherFixed };
}

// Profit with day passes and members scaled by s. Linear in s, so break-even is solved from two points.
function profitAt(i, s) {
  const visits = visitsAt(i, s);
  const revenue = i.dayPasses * s * i.dayPassPrice + i.members * s * i.memberFee + i.kids * i.tuition + i.parties * i.partyPrice + visits * i.shopSpend;
  const variable = visits * i.shopSpend * (i.shopCogsPct / 100) + i.kids * i.tuition * (i.coachingPct / 100) + i.parties * i.partyCost + revenue * (i.processPct + i.reservePct) / 100;
  return revenue - variable - fixedCosts(i).fixed - loanOf(i);
}

function figures(i) {
  const f = i.processPct / 100, r = i.reservePct / 100, m = i.targetMargin / 100;
  const visits = visitsAt(i, 1);
  const passRevenue = i.dayPasses * i.dayPassPrice;
  const memberRevenue = i.members * i.memberFee;
  const youthRevenue = i.kids * i.tuition;
  const partyRevenue = i.parties * i.partyPrice;
  const shopRevenue = visits * i.shopSpend;
  const revenue = passRevenue + memberRevenue + youthRevenue + partyRevenue + shopRevenue;
  const shopCost = shopRevenue * (i.shopCogsPct / 100);
  const coachingCost = youthRevenue * (i.coachingPct / 100);
  const partyCost = i.parties * i.partyCost;
  const cardFees = revenue * f;
  const reserve = revenue * r;
  const { staffCost, fixed } = fixedCosts(i);
  const payment = loanOf(i);
  const c0 = shopCost + coachingCost + partyCost;
  const costs = c0 + cardFees + reserve + fixed + payment;
  const profit = revenue - costs;
  const margin = revenue > 0 ? profit / revenue : null;
  const capex = i.buildCost + i.fitout;
  const operating = profit + payment;
  const paybackMonths = operating > 0 ? capex / operating : null;
  const needed = (c0 + fixed + payment) / (1 - f - r - m);
  const minPassPrice = i.dayPasses > 0 ? Math.max(0, (needed - (revenue - passRevenue)) / i.dayPasses) : null;
  const minMemberFee = i.members > 0 ? Math.max(0, (needed - (revenue - memberRevenue)) / i.members) : null;
  const needOperating = capex / i.targetPaybackMonths;
  const minPaybackPassPrice = i.dayPasses > 0 && capex > 0 ? Math.max(0, i.dayPassPrice + (needOperating - operating) / (i.dayPasses * (1 - f - r))) : null;
  const p0 = profitAt(i, 0), p1 = profitAt(i, 1);
  let breakevenDemand = null;
  if (p1 - p0 > 1e-9) breakevenDemand = Math.max(0, -p0 / (p1 - p0));
  const sensitivity = [-10, -20].map((d) => {
    const s = 1 + d / 100;
    const sp = profitAt(i, s);
    const op = sp + payment;
    return { change: d, members: i.members * s, dayPasses: i.dayPasses * s, profit: sp, annualProfit: sp * 12, paybackMonths: op > 0 ? capex / op : null };
  });
  const hoursAvailable = i.capacity * i.openHours * weeksPerMonth;
  const utilisation = hoursAvailable > 0 ? (visits * i.visitHours) / hoursAvailable : 0;
  return {
    visits, passRevenue, memberRevenue, youthRevenue, partyRevenue, shopRevenue, revenue, shopCost, coachingCost, partyCost, cardFees, reserve, staffCost, fixed,
    loanPayment: payment, costs, profit, margin, capex, operating, paybackMonths, paybackYears: paybackMonths === null ? null : paybackMonths / 12,
    revenuePerVisit: visits > 0 ? revenue / visits : null, profitPerVisit: visits > 0 ? profit / visits : null, profitPerMember: i.members > 0 ? profit / i.members : null,
    minPassPrice, minMemberFee, minPaybackPassPrice, needOperating, meets: margin !== null && margin >= m - 1e-12,
    meetsPayback: paybackMonths !== null && paybackMonths <= i.targetPaybackMonths + 1e-9, breakevenDemand,
    breakevenMembers: breakevenDemand === null ? null : breakevenDemand * i.members, breakevenDayPasses: breakevenDemand === null ? null : breakevenDemand * i.dayPasses,
    sensitivity, annualProfit: profit * 12, utilisation, memberShare: revenue > 0 ? memberRevenue / revenue : 0,
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
  if (f.profit < 0) n.push(`The gym loses ${money(-f.profit)} a month. It needs ${f.breakevenDemand === null ? "more revenue per climber" : `${pct(f.breakevenDemand)} of planned demand (${Math.ceil(f.breakevenMembers)} members and ${Math.ceil(f.breakevenDayPasses)} day passes)`} to break even.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%.${f.minMemberFee === null ? "" : ` A membership fee of at least ${cents(f.minMemberFee)} reaches it, ${cents(f.minMemberFee - i.memberFee)} more than now.`}${f.minPassPrice === null ? "" : ` A day pass of at least ${cents(f.minPassPrice)} reaches it.`}`);
  if (f.paybackMonths !== null && !f.meetsPayback && f.minPaybackPassPrice !== null) n.push(`Payback is ${f.paybackMonths.toFixed(1)} months, past your ${i.targetPaybackMonths}-month target. A day pass of at least ${cents(f.minPaybackPassPrice)} reaches it.`);
  if (f.profit < 0 && f.operating > 0) n.push(`The gym covers its running costs but not the loan: after the ${money(f.loanPayment)} monthly payment it loses ${money(-f.profit)} a month.`);
  if (f.profit >= 0 && f.sensitivity[1].profit < 0) n.push(`If members and day passes come in 20% under plan, the gym loses ${money(-f.sensitivity[1].profit)} a month. Membership growth in the first year is usually the part that disappoints.`);
  if (f.paybackMonths === null) n.push("The gym makes no operating profit at these numbers, so the build never pays back.");
  else if (f.paybackMonths > 60) n.push(`Payback is ${(f.paybackMonths / 12).toFixed(1)} years. Most lenders and landlords want to see less than five.`);
  if (f.utilisation > 0.35) n.push(`The plan puts ${(f.utilisation * 100).toFixed(0)}% of climber-hours against your comfortable capacity on average. Climbing is peaky (weeknights, weekends), so evenings would be crowded: check the headcount against your floor and queue for the walls.`);
  if (f.memberShare > 0.6) n.push(`Memberships are ${(f.memberShare * 100).toFixed(0)}% of revenue. That is steady income, but one price change or a competitor opening nearby moves it; the sensitivity table shows the cost of losing members.`);
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
    capacity: 120, openHours: 80, visitHours: 2,
    dayPasses: 1300, dayPassPrice: 22, members: 430, memberFee: 72, memberVisits: 6,
    kids: 60, tuition: 160, coachingPct: 40, parties: 25, partyPrice: 350, partyCost: 90,
    shopSpend: 4, shopCogsPct: 45,
    staff: 3, wage: 17, burdenPct: 12, setters: 7000, rent: 21000, utilities: 3500, insurance: 2500, otherFixed: 3500,
    processPct: 3, reservePct: 3, buildCost: 550000, fitout: 250000, targetMargin: 20,
    financedPct: 0, aprPct: 9, termMonths: 84, targetPaybackMonths: 36,
  };
}

export function sampleScenario() {
  return { dayPasses: 1300, dayPassPrice: 22, members: 500, memberFee: 64, kids: 60, tuition: 160, parties: 25 };
}

export function resultText(r) {
  return [
    `Climbing gym check: ${r.visits.toFixed(0)} climber visits a month (${r.input.dayPasses} day passes, ${r.input.members} members), ${pct(r.utilisation)} average use of comfortable capacity`,
    `Revenue ${cents(r.revenue)} a month (day passes ${cents(r.passRevenue)}, memberships ${cents(r.memberRevenue)}, youth ${cents(r.youthRevenue)}, parties ${cents(r.partyRevenue)}, shop ${cents(r.shopRevenue)})`,
    `Costs ${cents(r.costs)} (staff ${cents(r.staffCost)}, all fixed ${cents(r.fixed)})`,
    `Profit ${cents(r.profit)} a month, margin ${r.margin === null ? "n/a" : pct(r.margin)}`,
    `Build cost ${money(r.capex)}; payback ${r.paybackMonths === null ? "never at these numbers" : `${r.paybackMonths.toFixed(1)} months (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even: ${r.breakevenDemand === null ? "n/a" : `${pct(r.breakevenDemand)} of planned demand (${Math.ceil(r.breakevenMembers)} members, ${Math.ceil(r.breakevenDayPasses)} day passes)`}`,
    `Lowest day pass for a ${r.input.targetMargin}% margin: ${r.minPassPrice === null ? "n/a" : cents(r.minPassPrice)}; lowest membership fee: ${r.minMemberFee === null ? "n/a" : cents(r.minMemberFee)}; day pass for a ${r.input.targetPaybackMonths}-month payback: ${r.minPaybackPassPrice === null ? "n/a" : cents(r.minPaybackPassPrice)}`,
    ...r.sensitivity.map((s) => `Demand ${s.change}%: profit ${cents(s.profit)} a month, payback ${s.paybackMonths === null ? "never" : s.paybackMonths.toFixed(1) + " months"}`),
    "Arithmetic on the numbers entered, not tax, legal, lending or financial advice.",
  ].join("\n");
}

export function resultCsv(r) {
  const n = (v) => (v === null ? "" : v);
  const rows = [
    ["visits", r.visits], ["utilisation", r.utilisation], ["day_pass_revenue", r.passRevenue], ["membership_revenue", r.memberRevenue], ["youth_revenue", r.youthRevenue],
    ["party_revenue", r.partyRevenue], ["shop_revenue", r.shopRevenue], ["revenue", r.revenue], ["shop_cost", r.shopCost], ["youth_coaching_cost", r.coachingCost],
    ["party_cost", r.partyCost], ["card_fees", r.cardFees], ["replacement_reserve", r.reserve], ["staff", r.staffCost], ["fixed_costs", r.fixed], ["loan_payment", r.loanPayment],
    ["total_costs", r.costs], ["monthly_profit", r.profit], ["margin", n(r.margin)], ["build_cost", r.capex], ["payback_months", n(r.paybackMonths)],
    ["breakeven_demand", n(r.breakevenDemand)], ["breakeven_members", n(r.breakevenMembers)], ["minimum_day_pass_for_margin", n(r.minPassPrice)],
    ["minimum_member_fee_for_margin", n(r.minMemberFee)], ["minimum_day_pass_for_payback", n(r.minPaybackPassPrice)], ["annual_profit", r.annualProfit],
    ...r.sensitivity.flatMap((s) => [[`profit_at_${-s.change}pct_less_demand`, s.profit], [`payback_months_at_${-s.change}pct_less_demand`, n(s.paybackMonths)]]),
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "climbing-gym-profit-calculator";
export function serializeState(input, scenario) { return JSON.stringify({ app: APP, version: 1, input, scenario: scenario || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved climbing gym scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, scenario: d.scenario && typeof d.scenario === "object" ? d.scenario : null };
}
