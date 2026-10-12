// Mini-golf course profit maths: putt-putt courses, batting cages and small family fun centres.
// Pure functions, no DOM, no network. Every figure is the owner's own input; nothing here is a market rate or a forecast.

export const SAMPLE = {
  holes: "18", holeCost: "12000", sharedCost: "220000",
  peakDays: "88", peakRounds: "115", peakPrice: "11",
  shoulderDays: "88", shoulderRounds: "55", shoulderPrice: "10",
  offDays: "35", offRounds: "20", offPrice: "8",
  rainPct: "10",
  parties: "90", partyPrice: "180", partyCostPct: "30",
  concSpend: "4", concMargin: "55",
  laborHours: "22", wage: "17", cardPct: "2.5",
  fixedYear: "60000", maintPct: "3",
  loanPct: "65", rate: "8.5", loanYears: "15", targetYears: "8",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const round2 = (n) => Math.round(n * 100) / 100;
const SEASONS = [["peak", "Peak"], ["shoulder", "Shoulder"], ["off", "Off"]];

export function parse(raw) {
  const errors = [];
  const holes = num(raw.holes), holeCost = num(raw.holeCost);
  if (!(holes >= 1 && holes <= 200 && Number.isInteger(holes))) errors.push("Enter the number of holes (a whole number from 1 to 200; use 1 per cage or attraction for a batting-cage or fun-centre build).");
  if (!(holeCost > 0)) errors.push("Enter the build cost of one hole: turf or concrete, obstacles, borders and its share of the paths (more than 0).");
  const sharedCost = opt(raw.sharedCost, 0), fixedYear = opt(raw.fixedYear, 0), maintPct = opt(raw.maintPct, 0);
  const rainPct = opt(raw.rainPct, 0), parties = opt(raw.parties, 0), partyPrice = opt(raw.partyPrice, 0), partyCostPct = opt(raw.partyCostPct, 0);
  const concSpend = opt(raw.concSpend, 0), concMargin = opt(raw.concMargin, 0);
  const laborHours = opt(raw.laborHours, 0), wage = opt(raw.wage, 0), cardPct = opt(raw.cardPct, 0);
  const loanPct = opt(raw.loanPct, 0), rate = opt(raw.rate, 0), loanYears = opt(raw.loanYears, 15), targetYears = opt(raw.targetYears, 8);
  for (const [n, v] of [["Shared build cost", sharedCost], ["Yearly fixed costs", fixedYear], ["Parties per year", parties], ["Price per party", partyPrice], ["Concession and arcade spend per round", concSpend], ["Staff hours per open day", laborHours], ["Hourly wage", wage]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(maintPct >= 0 && maintPct <= 20)) errors.push("Yearly upkeep reserve is a percent of the course build cost, 0 to 20.");
  if (!(rainPct >= 0 && rainPct <= 90)) errors.push("Weather lost days must be from 0 to 90 percent of open days.");
  if (!(partyCostPct >= 0 && partyCostPct <= 100)) errors.push("Party cost (food, favours, host) must be from 0 to 100 percent of the party price.");
  if (!(concMargin >= 0 && concMargin <= 100)) errors.push("Concession margin must be from 0 to 100 percent.");
  if (!(cardPct >= 0 && cardPct <= 10)) errors.push("Card processing fee must be from 0 to 10 percent of sales.");
  if (!(loanPct >= 0 && loanPct <= 100)) errors.push("Share financed must be from 0 to 100 percent.");
  if (!(rate >= 0 && rate <= 40)) errors.push("Loan interest rate must be from 0 to 40 percent a year.");
  if (!(loanYears >= 1 && loanYears <= 40)) errors.push("Loan term must be from 1 to 40 years.");
  if (!(targetYears > 0 && targetYears <= 50)) errors.push("Target payback must be more than 0 and at most 50 years.");
  const seasons = [];
  let days = 0;
  for (const [key, label] of SEASONS) {
    const d = opt(raw[key + "Days"], 0);
    if (!(d >= 0 && d <= 365)) { errors.push(`${label} season days must be from 0 to 365.`); continue; }
    if (d === 0) continue;
    const rounds = num(raw[key + "Rounds"]), price = num(raw[key + "Price"]);
    if (!(rounds >= 0)) errors.push(`Enter the rounds played per open day in the ${label.toLowerCase()} season.`);
    if (!(price >= 0)) errors.push(`Enter the price per round for the ${label.toLowerCase()} season.`);
    days += d;
    seasons.push({ key, label, days: d, rounds, price });
  }
  if (days > 366) errors.push("Season days add up to more than a year.");
  if (!seasons.length && !errors.length) errors.push("Enter at least one season with days, rounds per day and a price per round.");
  return { errors, holes, holeCost, sharedCost, fixedYear, maintPct, rainPct, parties, partyPrice, partyCostPct, concSpend, concMargin, laborHours, wage, cardPct, loanPct, rate, loanYears, targetYears, seasons };
}

// Level annual payment on an amortising loan; zero rate is straight-line.
export function annualPayment(loan, ratePct, years) {
  if (loan <= 0) return 0;
  const r = ratePct / 100;
  if (r === 0) return loan / years;
  return (loan * r) / (1 - Math.pow(1 + r, -years));
}

// One year at given multipliers. volScale scales rounds per day (and so concessions); priceScale scales the price per round only;
// rain overrides the share of open days lost to weather. Parties and the party price are held as entered.
function run(p, { volScale = 1, priceScale = 1, rain = p.rainPct } = {}) {
  const c = p.cardPct / 100, m = p.concMargin / 100;
  let openDays = 0, rounds = 0, roundsRev = 0;
  const seasons = p.seasons.map((s) => {
    const open = s.days * (1 - rain / 100), r = open * s.rounds * volScale, rev = r * s.price * priceScale;
    openDays += open; rounds += r; roundsRev += rev;
    return { ...s, openDays: open, played: r, revenue: rev };
  });
  const conc = rounds * p.concSpend, concCost = conc * (1 - m);
  const partyRev = p.parties * p.partyPrice, partyCost = partyRev * p.partyCostPct / 100;
  const revenue = roundsRev + conc + partyRev;
  const cardFees = revenue * c;
  const labor = openDays * p.laborHours * p.wage;
  const build = p.holes * p.holeCost, investment = build + p.sharedCost;
  const reserve = build * p.maintPct / 100;
  const noi = revenue - concCost - partyCost - cardFees - labor - p.fixedYear - reserve;
  const loan = investment * p.loanPct / 100, debt = annualPayment(loan, p.rate, p.loanYears), equity = investment - loan;
  return { seasons, openDays, rounds, roundsRev, conc, concCost, partyRev, partyCost, revenue, cardFees, labor, build, investment, reserve, noi, loan, debt, equity, cashFlow: noi - debt };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const b = run(p);
  const c = p.cardPct / 100, m = p.concMargin / 100;
  const perOpenDay = b.openDays > 0 ? b.rounds / b.openDays : 0;
  // Cash after the loan is linear in volScale: volume part (rounds and concessions) plus a part that does not move with attendance.
  const volumeContribution = b.roundsRev * (1 - c) + b.conc * (m - c);
  const fixedPart = b.partyRev * (1 - c) - b.partyCost - b.labor - p.fixedYear - b.reserve - b.debt;
  const beScale = volumeContribution > 0 ? Math.max(0, -fixedPart / volumeContribution) : null;
  const breakEvenRoundsPerDay = beScale === null ? null : perOpenDay * beScale;
  const breakEvenRoundsYear = beScale === null ? null : b.rounds * beScale;
  const dscr = b.debt > 0 ? b.noi / b.debt : null;
  const yieldOnCost = b.noi / b.investment;
  const cashOnCash = b.equity > 0 ? b.cashFlow / b.equity : null;
  const paybackEquity = b.equity > 0 && b.cashFlow > 0 ? b.equity / b.cashFlow : null;
  const paybackAll = b.noi > 0 ? b.investment / b.noi : null;
  // Price per round scaled across all seasons: only round revenue moves, and card fees take their share of it.
  const priceScaleFor = (cf) => (b.roundsRev > 0 ? 1 + (cf - b.cashFlow) / (b.roundsRev * (1 - c)) : null);
  const bePriceScale = priceScaleFor(0);
  const targetCash = b.equity > 0 ? b.equity / p.targetYears : 0;
  const targetPriceScale = b.equity > 0 ? priceScaleFor(targetCash) : null;
  const avgPrice = b.rounds > 0 ? b.roundsRev / b.rounds : 0;
  const revPerRound = b.rounds > 0 ? (b.roundsRev + b.conc) / b.rounds : 0;

  const cell = (x) => ({ noi: round2(x.noi), dscr: x.debt > 0 ? x.noi / x.debt : null, cashFlow: round2(x.cashFlow), payback: x.equity > 0 && x.cashFlow > 0 ? x.equity / x.cashFlow : null });
  const sweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2].map((scale) => {
    const x = run(p, { volScale: scale });
    return { scale, roundsPerDay: x.openDays > 0 ? x.rounds / x.openDays : 0, rounds: x.rounds, ...cell(x) };
  });
  const priceSteps = [-20, -10, 0, 10, 20], attSteps = [0.7, 0.85, 1, 1.15, 1.3];
  const grid = priceSteps.map((pc) => ({ priceChange: pc, cells: attSteps.map((a) => ({ scale: a, cashFlow: round2(run(p, { volScale: a, priceScale: 1 + pc / 100 }).cashFlow) })) }));
  const rainSteps = [...new Set([0, 5, 10, 15, 20, 30, p.rainPct])].sort((a, z) => a - z);
  const rainSweep = rainSteps.map((rain) => {
    const x = run(p, { rain });
    return { rain, openDays: x.openDays, rounds: x.rounds, ...cell(x) };
  });

  const roundShare = b.revenue > 0 ? b.roundsRev / b.revenue : 0;
  const peak = b.seasons.find((s) => s.key === "peak");
  const peakShare = peak && b.roundsRev > 0 ? peak.revenue / b.roundsRev : null;
  const findings = [];
  if (b.cashFlow < 0) findings.push({ severity: "high", title: `After the loan payment the course loses about ${whole(-b.cashFlow)} a year at these rounds and prices.${bePriceScale !== null && bePriceScale > 1 ? ` Prices would need to be about ${((bePriceScale - 1) * 100).toFixed(0)}% higher across the board to cover it.` : ""}` });
  if (volumeContribution <= 0) findings.push({ severity: "high", title: `Each extra round loses money once card fees and concession costs are counted, so more visitors lose more. Check the price per round against card fees and concession margin.` });
  if (dscr !== null && dscr < 1.25) findings.push({ severity: dscr < 1 ? "high" : "medium", title: `Debt coverage is ${dscr.toFixed(2)}: operating income is ${dscr.toFixed(2)} times the yearly loan payment. Lenders usually want a cushion above 1, often 1.2 to 1.3 or more; ask yours what it requires.` });
  if (paybackEquity !== null && paybackEquity > p.targetYears) findings.push({ severity: "medium", title: `Cash payback on your own money is ${paybackEquity.toFixed(1)} years, past your ${p.targetYears}-year target. Prices would need to be about ${targetPriceScale !== null ? Math.max(0, (targetPriceScale - 1) * 100).toFixed(0) : "–"}% higher to reach it at this attendance.` });
  if (peakShare !== null && peakShare >= 0.6 && p.seasons.length > 1) findings.push({ severity: "medium", title: `${(peakShare * 100).toFixed(0)}% of round revenue comes from the peak season. A wet summer or a slow school-holiday stretch hits most of the year's income; see the weather table.` });
  const wetDrop = rainSweep.find((x) => x.rain === 20);
  if (wetDrop && wetDrop.cashFlow < 0 && b.cashFlow >= 0) findings.push({ severity: "medium", title: `If 20% of open days are lost to weather, cash after the loan turns negative (${whole(wetDrop.cashFlow)} a year). Check how much cash you would hold for a bad season.` });
  if (p.parties > 0) findings.push({ severity: "info", title: `${p.parties} parties at ${whole(p.partyPrice)} bring in ${whole(b.partyRev)} and leave about ${whole(b.partyRev - b.partyCost)} after party costs. They are entered as parties you expect to hold, so weather does not reduce them here.` });
  findings.push({ severity: "info", title: `Each round brings in about ${dollars(revPerRound)} from the round itself and concessions (${dollars(avgPrice)} average price plus ${dollars(p.concSpend)} spend), before staff, fixed costs and the loan.` });
  if (b.reserve > 0) findings.push({ severity: "info", title: `The ${p.maintPct}% upkeep reserve sets aside ${whole(b.reserve)} a year for turf, paint, lighting and obstacle repairs, and for replacing worn pieces.` });
  if (b.labor > 0) findings.push({ severity: "info", title: `Staff cost ${whole(b.labor)} a year (${p.laborHours} hours on each of about ${Math.round(b.openDays)} open days at ${dollars(p.wage)}), ${(roundShare > 0 ? b.labor / b.revenue * 100 : 0).toFixed(0)}% of sales. Days lost to weather are counted as unstaffed.` });
  if (b.cashFlow >= 0 && !findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the course covers its costs and its loan, with about ${whole(b.cashFlow)} a year left over.` });

  return {
    errors: [], input: p, base: b, perOpenDay, volumeContribution, breakEvenRoundsPerDay, breakEvenRoundsYear, bePriceScale, targetPriceScale,
    dscr, yieldOnCost, cashOnCash, paybackEquity, paybackAll, avgPrice, revPerRound, peakShare,
    perHoleInvestment: b.investment / p.holes, perHoleNoi: b.noi / p.holes,
    seasons: b.seasons.map((s) => ({ key: s.key, label: s.label, days: s.days, openDays: round2(s.openDays), roundsPerDay: s.rounds, price: s.price, rounds: round2(s.played), revenue: round2(s.revenue) })),
    totals: { revenue: round2(b.revenue), roundsRevenue: round2(b.roundsRev), concessions: round2(b.conc), concessionCost: round2(b.concCost), partyRevenue: round2(b.partyRev), partyCost: round2(b.partyCost), cardFees: round2(b.cardFees), labor: round2(b.labor), fixed: round2(p.fixedYear), reserve: round2(b.reserve), noi: round2(b.noi), debt: round2(b.debt), cashFlow: round2(b.cashFlow), investment: round2(b.investment), loan: round2(b.loan), equity: round2(b.equity) },
    findings, sweep, grid, rainSweep,
  };
}

export function summaryText(r) {
  const p = r.input, t = r.totals;
  const yrs = (n) => (n === null ? "never at these figures" : `${n.toFixed(1)} years`);
  return [
    `Mini-golf: ${p.holes} hole(s) at ${whole(p.holeCost)} plus ${whole(p.sharedCost)} shared (clubhouse, landscaping, lighting, permits) = ${whole(t.investment)} invested (${whole(t.equity)} your own money, ${whole(t.loan)} borrowed)`,
    `Year: ${Math.round(r.base.rounds)} rounds over about ${Math.round(r.base.openDays)} open days after ${p.rainPct}% weather loss (${r.perOpenDay.toFixed(0)} a day), average ${dollars(r.avgPrice)} a round`,
    `Sales ${whole(t.revenue)} (rounds ${whole(t.roundsRevenue)}, concessions and arcade ${whole(t.concessions)}, parties ${whole(t.partyRevenue)}); concession cost ${whole(t.concessionCost)}; party cost ${whole(t.partyCost)}; card fees ${whole(t.cardFees)}; staff ${whole(t.labor)}; fixed ${whole(t.fixed)}; upkeep reserve ${whole(t.reserve)}`,
    `Operating income ${whole(t.noi)} (${(r.yieldOnCost * 100).toFixed(1)}% of the investment); loan payments ${whole(t.debt)}; cash after the loan ${whole(t.cashFlow)}`,
    `Payback: ${yrs(r.paybackAll)} on the whole investment; ${yrs(r.paybackEquity)} on your own money${r.cashOnCash === null ? "" : ` (${(r.cashOnCash * 100).toFixed(1)}% cash on cash)`}`,
    `Debt coverage: ${r.dscr === null ? "no loan" : r.dscr.toFixed(2)}. Break-even: ${r.breakEvenRoundsPerDay === null ? "not reachable at these prices" : `${r.breakEvenRoundsPerDay.toFixed(0)} rounds per open day (${Math.round(r.breakEvenRoundsYear)} a year) versus ${r.perOpenDay.toFixed(0)} planned`}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["attendance_vs_plan_pct,rounds_per_open_day,operating_income,debt_coverage,cash_after_loan,payback_years_on_equity",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.roundsPerDay.toFixed(1)},${x.noi.toFixed(2)},${x.dscr === null ? "" : x.dscr.toFixed(2)},${x.cashFlow.toFixed(2)},${x.payback === null ? "" : x.payback.toFixed(1)}`)].join("\n");
}
