// Axe-throwing / throwing-sports venue economics. A venue sells timed lane bookings to
// groups (priced per thrower), runs league nights that sell a season fee once per player,
// books corporate events and parties at a package price, sells drinks and snacks, and
// carries rent, insurance and coaches on the floor. The owner needs three numbers before
// signing the lease: monthly profit at a believable fill, how long the build takes to pay
// back, and the fill the venue must reach to break even.
//
//   laneSlots   = lanes * hours open a day * bookings per lane-hour * days a week * 52 / 12
//   leagueLanes = ceil(league players a night / throwers per lane)      (lanes a league night occupies)
//   walkSlots   = laneSlots - league nights * leagueLanes * league hours * bookings per lane-hour * 52 / 12
//   walkVisits  = walkSlots * fill * throwers per lane                  (walk-in and group throwers)
//   leagueRev   = enrolled * season fee * seasons a year / 12           (recurring per season, paid once per player)
//   throwers    = walkVisits + league visits + event guests
//   revenue     = walkVisits * price + leagueRev + events * event price + throwers * bar spend
//   variable    = bar cost + events * event cost + throwers * target and axe wear + card fees
//   profit      = revenue - variable - fixed - loan payment
//   payback     = build cost / (profit + loan payment)   (months; before the loan, so borrowing does not flatter it)
//   breakeven   = fill multiplier s with profit(s) = 0, as % of walk-in lane slots (exact: profit is linear in s)
//   minPrice    = price per thrower at which margin = target (exact)  and at which payback = target (exact)

export const SCENARIO_KEYS = ["lanes", "price", "fill", "leaguePlayers", "seasonFee", "events", "eventPrice"];

export function loanPayment(principal, aprPct, months) {
  if (!(principal > 0)) return 0;
  const r = aprPct / 1200;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

const loanOf = (i) => loanPayment(((i.buildCost + i.fitout) * i.financedPct) / 100, i.aprPct, i.termMonths);
const WEEKS = 52 / 12;

function leagueLanesOf(i) {
  return i.leagueNights > 0 && i.leaguePlayers > 0 ? Math.ceil(i.leaguePlayers / i.throwersPerLane) : 0;
}
const totalSlots = (i) => i.lanes * i.hoursPerDay * i.sessionsPerLaneHour * i.daysPerWeek * WEEKS;
const displacedSlots = (i) => i.leagueNights * leagueLanesOf(i) * i.leagueHours * i.sessionsPerLaneHour * WEEKS;
const walkSlots = (i) => totalSlots(i) - displacedSlots(i);

export function validateInput(i) {
  const e = [];
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(i.lanes, 1, 500)) e.push("Lanes must be a whole number between 1 and 500.");
  if (!(Number.isFinite(i.hoursPerDay) && i.hoursPerDay > 0 && i.hoursPerDay <= 24)) e.push("Hours open a day must be above 0 and at most 24.");
  if (!(Number.isFinite(i.daysPerWeek) && i.daysPerWeek > 0 && i.daysPerWeek <= 7)) e.push("Open days per week must be above 0 and at most 7.");
  if (!(Number.isFinite(i.sessionsPerLaneHour) && i.sessionsPerLaneHour > 0 && i.sessionsPerLaneHour <= 4)) e.push("Bookings per lane-hour must be above 0 and at most 4.");
  if (!int(i.throwersPerLane, 1, 20)) e.push("Throwers per lane must be a whole number between 1 and 20.");
  if (!nonneg(i.fill, 100)) e.push("Average fill must be between 0% and 100% of walk-in lane slots.");
  if (!nonneg(i.price, 500)) e.push("Price per thrower must be between $0 and $500.");
  if (!nonneg(i.barSpend, 200)) e.push("Drinks and snacks spend per thrower must be between $0 and $200.");
  if (!nonneg(i.barCogsPct, 100)) e.push("Drinks and snacks cost must be between 0% and 100%.");
  if (!int(i.leagueNights, 0, 7)) e.push("League nights per week must be a whole number between 0 and 7.");
  if (!int(i.leaguePlayers, 0, 5000)) e.push("League players per night must be a whole number between 0 and 5,000.");
  if (!(Number.isFinite(i.leagueHours) && i.leagueHours >= 0 && i.leagueHours <= 12)) e.push("League night length must be between 0 and 12 hours.");
  if (!nonneg(i.seasonFee, 2000)) e.push("League season fee per player must be between $0 and $2,000.");
  if (!int(i.seasonWeeks, 1, 52)) e.push("Weeks per league season must be a whole number between 1 and 52.");
  if (!int(i.seasonsPerYear, 0, 12)) e.push("League seasons a year must be a whole number between 0 and 12.");
  if (!int(i.events, 0, 2000)) e.push("Corporate events and parties a month must be a whole number between 0 and 2,000.");
  if (!int(i.eventGuests, 0, 5000)) e.push("Guests per event must be a whole number between 0 and 5,000.");
  if (!nonneg(i.eventPrice, 100000)) e.push("Event package price must be between $0 and $100,000.");
  if (!nonneg(i.eventCost, 100000)) e.push("Cost per event (food, host, supplies) must be between $0 and $100,000.");
  if (!nonneg(i.coaches, 200)) e.push("Coaches on duty must be between 0 and 200.");
  if (!nonneg(i.wage, 500)) e.push("Coach hourly wage must be between $0 and $500.");
  if (!nonneg(i.burdenPct, 100)) e.push("Payroll burden must be between 0% and 100%.");
  if (!nonneg(i.rent, 1000000)) e.push("Monthly rent must be between $0 and $1,000,000.");
  if (!nonneg(i.utilities, 1000000)) e.push("Monthly utilities must be between $0 and $1,000,000.");
  if (!nonneg(i.insurance, 1000000)) e.push("Monthly insurance must be between $0 and $1,000,000.");
  if (!nonneg(i.otherFixed, 1000000)) e.push("Monthly software, marketing and other fixed costs must be between $0 and $1,000,000.");
  if (!nonneg(i.processPct, 15)) e.push("Card and booking fees must be between 0% and 15%.");
  if (!nonneg(i.wearPerThrower, 100)) e.push("Axe and target replacement reserve must be between $0 and $100 per thrower.");
  if (!nonneg(i.buildCost, 50000000)) e.push("Lanes, targets, axes and safety build cost must be between $0 and $50,000,000.");
  if (!nonneg(i.fitout, 50000000)) e.push("Fit-out cost must be between $0 and $50,000,000.");
  if (!nonneg(i.targetMargin, 90)) e.push("Target margin must be between 0% and 90%.");
  if (!nonneg(i.financedPct, 100)) e.push("Financed share of the build must be between 0% and 100%.");
  if (!nonneg(i.aprPct, 60)) e.push("Interest rate must be between 0% and 60%.");
  if (!int(i.termMonths, 1, 360)) e.push("Loan term must be a whole number of months between 1 and 360.");
  if (!(Number.isFinite(i.targetPaybackMonths) && i.targetPaybackMonths >= 1 && i.targetPaybackMonths <= 240)) e.push("Target payback must be between 1 and 240 months.");
  if (e.length === 0) {
    if (i.leagueHours > i.hoursPerDay) e.push("A league night cannot be longer than the hours you are open.");
    else if (leagueLanesOf(i) > i.lanes) e.push("League players per night need more lanes than the venue has. Lower the players or add lanes.");
    else if (!(walkSlots(i) > 0)) e.push("League nights use all of your lane time, leaving none for walk-in bookings.");
    else if (i.processPct + i.targetMargin >= 100) e.push("Card fees plus target margin must be under 100%.");
  }
  return e;
}

export const openHours = (i) => i.hoursPerDay * i.daysPerWeek * WEEKS;

function fixedCosts(i) {
  const staffCost = openHours(i) * i.coaches * i.wage * (1 + i.burdenPct / 100);
  return { staffCost, fixed: staffCost + i.rent + i.utilities + i.insurance + i.otherFixed };
}

function leagueFigures(i) {
  const enrolled = i.leagueNights * i.leaguePlayers;
  return {
    enrolled,
    leagueVisits: (enrolled * i.seasonWeeks * i.seasonsPerYear) / 12,
    leagueRevenue: (enrolled * i.seasonFee * i.seasonsPerYear) / 12,
  };
}

// Profit with walk-in throwers scaled by s (league and events held). Linear in s, so break-even is solved from two points.
function profitAt(i, s) {
  const walk = walkSlots(i) * (i.fill / 100) * i.throwersPerLane * s;
  const { leagueVisits, leagueRevenue } = leagueFigures(i);
  const throwers = walk + leagueVisits + i.events * i.eventGuests;
  const barRevenue = throwers * i.barSpend;
  const revenue = walk * i.price + leagueRevenue + i.events * i.eventPrice + barRevenue;
  const variable = barRevenue * (i.barCogsPct / 100) + i.events * i.eventCost + throwers * i.wearPerThrower + revenue * (i.processPct / 100);
  return revenue - variable - fixedCosts(i).fixed - loanOf(i);
}

function figures(i) {
  const f = i.processPct / 100, m = i.targetMargin / 100;
  const total = totalSlots(i);
  const avail = walkSlots(i);
  const bookings = avail * (i.fill / 100);
  const visits = bookings * i.throwersPerLane;
  const { enrolled, leagueVisits, leagueRevenue } = leagueFigures(i);
  const eventGuests = i.events * i.eventGuests;
  const throwers = visits + leagueVisits + eventGuests;
  const walkRevenue = visits * i.price;
  const barRevenue = throwers * i.barSpend;
  const eventRevenue = i.events * i.eventPrice;
  const revenue = walkRevenue + leagueRevenue + eventRevenue + barRevenue;
  const barCost = barRevenue * (i.barCogsPct / 100);
  const eventCost = i.events * i.eventCost;
  const wear = throwers * i.wearPerThrower;
  const cardFees = revenue * f;
  const { staffCost, fixed } = fixedCosts(i);
  const payment = loanOf(i);
  const costs = barCost + eventCost + wear + cardFees + fixed + payment;
  const profit = revenue - costs;
  const margin = revenue > 0 ? profit / revenue : null;
  const capex = i.buildCost + i.fitout;
  const operating = profit + payment;
  const paybackMonths = operating > 0 ? capex / operating : null;
  const other = leagueRevenue + eventRevenue + barRevenue;
  let minPrice = null;
  if (visits > 0) {
    const needed = (barCost + eventCost + wear + fixed + payment) / (1 - f - m);
    minPrice = Math.max(0, (needed - other) / visits);
  }
  const needOperating = capex / i.targetPaybackMonths;
  const minPaybackPrice = visits > 0 && capex > 0 ? Math.max(0, i.price + (needOperating - operating) / (visits * (1 - f))) : null;
  const p0 = profitAt(i, 0), p1 = profitAt(i, 1);
  let breakevenFill = null;
  if (p1 - p0 > 1e-9 && visits > 0) {
    const s = -p0 / (p1 - p0);
    breakevenFill = s > 0 ? (s * bookings) / avail : 0;
  }
  const sensitivity = [-10, -20].map((d) => {
    const s = 1 + d / 100;
    const sp = profitAt(i, s);
    const op = sp + payment;
    return { change: d, fill: (bookings * s) / avail, profit: sp, annualProfit: sp * 12, paybackMonths: op > 0 ? capex / op : null };
  });
  return {
    total, avail, bookings, visits, enrolled, leagueVisits, eventGuests, throwers, walkRevenue, barRevenue, leagueRevenue, eventRevenue, revenue,
    barCost, eventCost, wear, cardFees, staffCost, fixed, loanPayment: payment, costs, profit, margin, capex, operating, paybackMonths,
    paybackYears: paybackMonths === null ? null : paybackMonths / 12, fillRate: avail > 0 ? bookings / avail : 0,
    revenuePerThrower: throwers > 0 ? revenue / throwers : null, profitPerThrower: throwers > 0 ? profit / throwers : null,
    minPrice, minPaybackPrice, needOperating, meets: margin !== null && margin >= m - 1e-12,
    meetsPayback: paybackMonths !== null && paybackMonths <= i.targetPaybackMonths + 1e-9, breakevenFill, sensitivity, annualProfit: profit * 12,
    leagueShare: revenue > 0 ? leagueRevenue / revenue : 0, eventShare: revenue > 0 ? eventRevenue / revenue : 0,
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
  if (f.profit < 0) n.push(`The venue loses ${money(-f.profit)} a month at ${pct(f.fillRate)} fill. It needs ${f.breakevenFill === null ? "more revenue per thrower" : pct(f.breakevenFill) + " of walk-in lane slots filled"} to break even.`);
  else if (f.meets) n.push(`Margin is ${pct(f.margin)}, which clears your target of ${i.targetMargin}%.`);
  else n.push(`Margin is ${pct(f.margin)}, below your target of ${i.targetMargin}%. A price of at least ${cents(f.minPrice)} per thrower reaches it, ${cents(f.minPrice - i.price)} more than now.`);
  if (f.paybackMonths !== null && !f.meetsPayback && f.minPaybackPrice !== null) n.push(`Payback is ${f.paybackMonths.toFixed(1)} months, past your ${i.targetPaybackMonths}-month target. A price of at least ${cents(f.minPaybackPrice)} per thrower reaches it.`);
  if (f.profit < 0 && f.operating > 0) n.push(`The venue covers its running costs but not the loan: after the ${money(f.loanPayment)} monthly payment it loses ${money(-f.profit)} a month.`);
  if (f.profit >= 0 && f.sensitivity[1].profit < 0) n.push(`If walk-in visits come in 20% under plan, the venue loses ${money(-f.sensitivity[1].profit)} a month. Weeknight walk-in fill is usually the part that disappoints.`);
  if (f.paybackMonths === null) n.push("The venue makes no operating profit at these numbers, so the build never pays back.");
  else if (f.paybackMonths > 60) n.push(`Payback is ${(f.paybackMonths / 12).toFixed(1)} years. Most lenders and landlords want to see less than five.`);
  if (f.leagueShare > 0.3) n.push(`Leagues are ${(f.leagueShare * 100).toFixed(0)}% of revenue. That income repeats each season, but only if players re-enrol; check your renewal rate before leaning on it.`);
  if (f.eventShare > 0.35) n.push(`Corporate events and parties are ${(f.eventShare * 100).toFixed(0)}% of revenue. They are lumpy and book on weekends; check the count against your lanes and weekend hours.`);
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
    lanes: 10, hoursPerDay: 8, daysPerWeek: 6, sessionsPerLaneHour: 1, throwersPerLane: 4, fill: 18, price: 22, barSpend: 6, barCogsPct: 30,
    leagueNights: 3, leaguePlayers: 40, leagueHours: 2, seasonFee: 100, seasonWeeks: 8, seasonsPerYear: 4,
    events: 12, eventGuests: 20, eventPrice: 600, eventCost: 150,
    coaches: 4, wage: 17, burdenPct: 12, rent: 14000, utilities: 1800, insurance: 2400, otherFixed: 3000,
    processPct: 3, wearPerThrower: 0.6, buildCost: 180000, fitout: 220000, targetMargin: 20,
    financedPct: 0, aprPct: 9, termMonths: 60, targetPaybackMonths: 36,
  };
}

export function sampleScenario() {
  return { lanes: 10, price: 26, fill: 12, leaguePlayers: 40, seasonFee: 120, events: 16, eventPrice: 700 };
}

export function resultText(r) {
  return [
    `Axe throwing venue check: ${r.avail.toFixed(0)} walk-in lane slots a month, ${pct(r.fillRate)} filled (${r.visits.toFixed(0)} walk-in throwers, ${r.throwers.toFixed(0)} throwers in all)`,
    `Revenue ${cents(r.revenue)} a month (walk-in ${cents(r.walkRevenue)}, leagues ${cents(r.leagueRevenue)}, events ${cents(r.eventRevenue)}, drinks and snacks ${cents(r.barRevenue)})`,
    `Costs ${cents(r.costs)} (coaches ${cents(r.staffCost)}, all fixed ${cents(r.fixed)})`,
    `Profit ${cents(r.profit)} a month, margin ${r.margin === null ? "n/a" : pct(r.margin)}`,
    `Build cost ${money(r.capex)}; payback ${r.paybackMonths === null ? "never at these numbers" : `${r.paybackMonths.toFixed(1)} months (${r.paybackYears.toFixed(1)} years)`}`,
    `Break-even fill: ${r.breakevenFill === null ? "n/a" : pct(r.breakevenFill)} of walk-in lane slots`,
    `Lowest price per thrower for a ${r.input.targetMargin}% margin: ${r.minPrice === null ? "n/a" : cents(r.minPrice)}; for a ${r.input.targetPaybackMonths}-month payback: ${r.minPaybackPrice === null ? "n/a" : cents(r.minPaybackPrice)}`,
    ...r.sensitivity.map((s) => `Walk-in visits ${s.change}%: profit ${cents(s.profit)} a month, payback ${s.paybackMonths === null ? "never" : s.paybackMonths.toFixed(1) + " months"}`),
    "Arithmetic on the numbers entered, not tax, legal, lending or financial advice.",
  ].join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["walk_in_lane_slots", r.avail], ["walk_in_throwers", r.visits], ["total_throwers", r.throwers], ["fill_rate", r.fillRate], ["walk_in_revenue", r.walkRevenue],
    ["league_revenue", r.leagueRevenue], ["event_revenue", r.eventRevenue], ["drinks_snacks_revenue", r.barRevenue], ["revenue", r.revenue],
    ["drinks_snacks_cost", r.barCost], ["event_cost", r.eventCost], ["axe_target_wear", r.wear], ["card_fees", r.cardFees], ["coaches", r.staffCost],
    ["fixed_costs", r.fixed], ["loan_payment", r.loanPayment], ["total_costs", r.costs], ["monthly_profit", r.profit], ["margin", r.margin === null ? "" : r.margin],
    ["build_cost", r.capex], ["payback_months", r.paybackMonths === null ? "" : r.paybackMonths], ["breakeven_fill", r.breakevenFill === null ? "" : r.breakevenFill],
    ["minimum_price_for_margin", r.minPrice === null ? "" : r.minPrice], ["minimum_price_for_payback", r.minPaybackPrice === null ? "" : r.minPaybackPrice],
    ["annual_profit", r.annualProfit],
    ...r.sensitivity.flatMap((s) => [[`profit_at_${-s.change}pct_fewer_visits`, s.profit], [`payback_months_at_${-s.change}pct_fewer_visits`, s.paybackMonths === null ? "" : s.paybackMonths]]),
  ];
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`)].join("\n");
}

const APP = "axe-throwing-venue-profit-calculator";
export function serializeState(input, scenario) { return JSON.stringify({ app: APP, version: 1, input, scenario: scenario || null }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved axe throwing venue scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input, scenario: d.scenario && typeof d.scenario === "object" ? d.scenario : null };
}
