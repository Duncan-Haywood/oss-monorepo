// Glamping unit payback maths: yurts, domes, cabins, safari tents, A-frames. Pure functions, no DOM, no network.
// Every figure is the owner's own input; nothing here is a market rate or a forecast.

export const SAMPLE = {
  units: "6", unitCost: "45000", sharedCost: "90000",
  peakDays: "100", peakAdr: "225", peakOcc: "55",
  shoulderDays: "120", shoulderAdr: "160", shoulderOcc: "35",
  offDays: "0", offAdr: "", offOcc: "",
  avgStay: "2.2", cleaningFee: "85", turnCost: "55", varNight: "9", platformPct: "12",
  fixedYear: "54000", maintPct: "3",
  loanPct: "70", rate: "8", loanYears: "20", targetYears: "7",
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
  const units = num(raw.units), unitCost = num(raw.unitCost);
  if (!(units >= 1 && Number.isInteger(units))) errors.push("Enter the number of units (a whole number, 1 or more).");
  if (!(unitCost > 0)) errors.push("Enter the all-in cost of one unit: the structure, deck, furniture, bedding, hot tub or stove (more than 0).");
  const sharedCost = opt(raw.sharedCost, 0), fixedYear = opt(raw.fixedYear, 0), maintPct = opt(raw.maintPct, 0);
  const avgStay = opt(raw.avgStay, 2), cleaningFee = opt(raw.cleaningFee, 0), turnCost = opt(raw.turnCost, 0);
  const varNight = opt(raw.varNight, 0), platformPct = opt(raw.platformPct, 0);
  const loanPct = opt(raw.loanPct, 0), rate = opt(raw.rate, 0), loanYears = opt(raw.loanYears, 20), targetYears = opt(raw.targetYears, 7);
  for (const [n, v] of [["Shared infrastructure cost", sharedCost], ["Yearly fixed costs", fixedYear], ["Yearly upkeep reserve", maintPct], ["Cleaning fee charged", cleaningFee], ["Cost per turnover", turnCost], ["Utilities and supplies per night", varNight]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(avgStay >= 1)) errors.push("Average stay must be 1 night or more.");
  if (!(platformPct >= 0 && platformPct < 50)) errors.push("Booking commission must be from 0 to under 50 percent.");
  if (!(maintPct <= 20)) errors.push("Yearly upkeep reserve is a percent of the build cost, 20 or less.");
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
    const adr = num(raw[key + "Adr"]), occ = num(raw[key + "Occ"]);
    if (!(adr >= 0)) errors.push(`Enter the average nightly rate for the ${label.toLowerCase()} season.`);
    if (!(occ >= 0 && occ <= 100)) errors.push(`Enter ${label.toLowerCase()} season occupancy as a percent (0 to 100).`);
    days += d;
    seasons.push({ key, label, days: d, adr, occ });
  }
  if (days > 366) errors.push("Season days add up to more than a year.");
  if (!seasons.length && !errors.length) errors.push("Enter at least one season with days, a nightly rate and occupancy.");
  return { errors, units, unitCost, sharedCost, fixedYear, maintPct, avgStay, cleaningFee, turnCost, varNight, platformPct, loanPct, rate, loanYears, targetYears, seasons };
}

// Level annual payment on an amortising loan; zero rate is straight-line.
export function annualPayment(loan, ratePct, years) {
  if (loan <= 0) return 0;
  const r = ratePct / 100;
  if (r === 0) return loan / years;
  return (loan * r) / (1 - Math.pow(1 + r, -years));
}

// Everything that scales with occupancy or the rate, for given multipliers.
function run(p, { occScale = 1, adrScale = 1, units = p.units } = {}) {
  const k = 1 - p.platformPct / 100;
  let nightsAvail = 0, nights = 0, lodging = 0, stays = 0;
  const seasons = p.seasons.map((s) => {
    const occ = Math.min(100, s.occ * occScale);
    const avail = units * s.days, sold = avail * occ / 100;
    const lod = sold * s.adr * adrScale, st = sold / p.avgStay;
    nightsAvail += avail; nights += sold; lodging += lod; stays += st;
    return { ...s, occ, avail, nights: sold, lodging: lod };
  });
  const cleaning = stays * p.cleaningFee;
  const guest = lodging + cleaning;
  const commission = guest * (1 - k);
  const variable = nights * p.varNight + stays * p.turnCost;
  const build = units * p.unitCost;
  const investment = build + p.sharedCost;
  const reserve = build * p.maintPct / 100;
  const noi = guest - commission - variable - p.fixedYear - reserve;
  const loan = investment * p.loanPct / 100;
  const debt = annualPayment(loan, p.rate, p.loanYears);
  const equity = investment - loan;
  const cashFlow = noi - debt;
  return { seasons, nightsAvail, nights, stays, lodging, cleaning, guest, commission, variable, build, investment, reserve, noi, loan, debt, equity, cashFlow };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const b = run(p);
  const blendedOcc = b.nightsAvail > 0 ? (b.nights / b.nightsAvail) * 100 : 0;
  const margin = b.guest - b.commission - b.variable; // what the bookings leave before fixed costs, reserve and debt
  const hurdle = p.fixedYear + b.reserve + b.debt;
  // Occupancy scale at which cash flow after debt is zero. Margin is linear in occupancy while no season is capped.
  const beScale = margin > 0 ? hurdle / margin : null;
  const breakEvenOcc = beScale === null ? null : blendedOcc * beScale;
  const maxSeasonOcc = Math.max(...p.seasons.map((s) => s.occ));
  const beReachable = beScale !== null && maxSeasonOcc * beScale <= 100;
  const dscr = b.debt > 0 ? b.noi / b.debt : null;
  const yieldOnCost = b.noi / b.investment;
  const cashOnCash = b.equity > 0 ? b.cashFlow / b.equity : null;
  const paybackEquity = b.equity > 0 && b.cashFlow > 0 ? b.equity / b.cashFlow : null;
  const paybackAll = b.noi > 0 ? b.investment / b.noi : null;
  // Rate scale: lodging revenue is linear in it. Solve for cash flow = 0 and for cash flow = equity / target years.
  const L = b.lodging, C = b.cleaning, k = 1 - p.platformPct / 100;
  const rateScaleFor = (cf) => (L > 0 ? ((cf + b.debt + b.variable + p.fixedYear + b.reserve) / k - C) / L : null);
  const beRateScale = rateScaleFor(0);
  const targetCash = b.equity > 0 ? b.equity / p.targetYears : 0;
  const targetRateScale = b.equity > 0 ? rateScaleFor(targetCash) : null;
  const avgAdr = b.nights > 0 ? b.lodging / b.nights : 0;
  const revPerUnit = b.guest / p.units;

  const sweep = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2].map((scale) => {
    const x = run(p, { occScale: scale });
    return { scale, occ: x.nightsAvail > 0 ? (x.nights / x.nightsAvail) * 100 : 0, noi: round2(x.noi), dscr: x.debt > 0 ? x.noi / x.debt : null, cashFlow: round2(x.cashFlow), payback: x.equity > 0 && x.cashFlow > 0 ? x.equity / x.cashFlow : null };
  });
  // Shared and fixed costs are held constant, which flatters large counts; so the table stops at twice the entered count.
  const counts = [...new Set([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40].filter((n) => n <= Math.max(4, p.units * 2)).concat(p.units))].sort((a, b2) => a - b2);
  const unitSweep = counts.map((n) => {
    const x = run(p, { units: n });
    return { units: n, investment: round2(x.investment), noi: round2(x.noi), noiPerUnit: round2(x.noi / n), yieldOnCost: x.noi / x.investment, payback: x.noi > 0 ? x.investment / x.noi : null };
  });

  const peak = b.seasons.find((s) => s.key === "peak");
  const peakShare = peak && b.lodging > 0 ? peak.lodging / b.lodging : null;
  const findings = [];
  if (b.cashFlow < 0) findings.push({ severity: "high", title: `After the loan payment the business loses about ${whole(-b.cashFlow)} a year at these rates and occupancy. ${beRateScale !== null && beRateScale > 0 ? `Rates would need to be about ${((beRateScale - 1) * 100).toFixed(0)}% ${beRateScale >= 1 ? "higher" : "lower"} across the board to cover it.` : ""}`.trim() });
  if (beScale !== null && !beReachable) findings.push({ severity: "high", title: `Break-even needs the busiest season above 100% full, which cannot happen. Rates, costs or the loan have to change, not occupancy.` });
  if (margin <= 0) findings.push({ severity: "high", title: `Each stay costs more to serve than it brings in, so more bookings lose more. Check the nightly rate against turnover cost and commission.` });
  if (dscr !== null && dscr < 1.25) findings.push({ severity: dscr < 1 ? "high" : "medium", title: `Debt coverage is ${dscr.toFixed(2)}: operating income is ${dscr.toFixed(2)} times the yearly loan payment. Lenders usually want a cushion above 1, often 1.2 to 1.3 or more; ask yours what it requires.` });
  if (paybackEquity !== null && paybackEquity > p.targetYears) findings.push({ severity: "medium", title: `Cash payback on your own money is ${paybackEquity.toFixed(1)} years, past your ${p.targetYears}-year target. Rates would need to be about ${targetRateScale !== null ? Math.max(0, (targetRateScale - 1) * 100).toFixed(0) : "–"}% higher to reach it at this occupancy.` });
  if (peakShare !== null && peakShare >= 0.7 && p.seasons.length > 1) findings.push({ severity: "medium", title: `${(peakShare * 100).toFixed(0)}% of lodging revenue comes from the peak season. A wet or smoky summer, a road closure or a bad review stretch hits most of the year's income.` });
  const hot = p.seasons.filter((s) => s.occ > 80);
  if (hot.length) findings.push({ severity: "medium", title: `${hot.map((s) => s.label.toLowerCase()).join(" and ")} occupancy above 80% is an optimistic planning figure for a new site. Check it against booked nights at comparable listings before relying on it.` });
  findings.push({ severity: "info", title: `Each unit brings in about ${whole(revPerUnit)} a year from guests (${whole(b.noi / p.units)} of operating income per unit), on a build cost of ${whole(p.unitCost)} plus its share of ${whole(p.sharedCost)} shared infrastructure.` });
  if (b.reserve > 0) findings.push({ severity: "info", title: `The ${p.maintPct}% upkeep reserve sets aside ${whole(b.reserve)} a year for repainting, linens, roof and deck repair and replacing furniture. Canvas and soft goods wear faster than wood and steel.` });
  if (p.platformPct >= 5) findings.push({ severity: "info", title: `${p.platformPct}% commission costs about ${whole(b.commission)} a year. Every booking you take directly keeps that share.` });
  if (b.cashFlow >= 0 && !findings.some((f) => f.severity !== "info")) findings.push({ severity: "info", title: `At these figures the business covers its costs and its loan, with about ${whole(b.cashFlow)} a year left over.` });

  return {
    errors: [], input: p, base: b, blendedOcc, avgAdr, margin, breakEvenOcc, beReachable, beRateScale, targetRateScale,
    dscr, yieldOnCost, cashOnCash, paybackEquity, paybackAll, revPerUnit, peakShare,
    seasons: b.seasons.map((s) => ({ key: s.key, label: s.label, days: s.days, adr: s.adr, occ: s.occ, nights: round2(s.nights), lodging: round2(s.lodging) })),
    totals: { guest: round2(b.guest), lodging: round2(b.lodging), cleaning: round2(b.cleaning), commission: round2(b.commission), variable: round2(b.variable), fixed: round2(p.fixedYear), reserve: round2(b.reserve), noi: round2(b.noi), debt: round2(b.debt), cashFlow: round2(b.cashFlow), investment: round2(b.investment), loan: round2(b.loan), equity: round2(b.equity) },
    findings, sweep, unitSweep,
  };
}

export function summaryText(r) {
  const p = r.input, t = r.totals;
  const yrs = (n) => (n === null ? "never at these figures" : `${n.toFixed(1)} years`);
  return [
    `Glamping: ${p.units} unit(s) at ${whole(p.unitCost)} plus ${whole(p.sharedCost)} shared infrastructure = ${whole(t.investment)} invested (${whole(t.equity)} your own money, ${whole(t.loan)} borrowed)`,
    `Year: ${Math.round(r.base.nights)} occupied nights (${r.blendedOcc.toFixed(0)}% of available), average ${dollars(r.avgAdr)} a night`,
    `Income ${whole(t.guest)}; commission ${whole(t.commission)}; turnovers, utilities and supplies ${whole(t.variable)}; fixed ${whole(t.fixed)}; upkeep reserve ${whole(t.reserve)}`,
    `Operating income ${whole(t.noi)} (${(r.yieldOnCost * 100).toFixed(1)}% of the investment); loan payments ${whole(t.debt)}; cash after the loan ${whole(t.cashFlow)}`,
    `Payback: ${yrs(r.paybackAll)} on the whole investment; ${yrs(r.paybackEquity)} on your own money${r.cashOnCash === null ? "" : ` (${(r.cashOnCash * 100).toFixed(1)}% cash on cash)`}`,
    `Debt coverage: ${r.dscr === null ? "no loan" : r.dscr.toFixed(2)}. Break-even: ${r.breakEvenOcc === null ? "not reachable at these rates" : `${r.breakEvenOcc.toFixed(0)}% full overall${r.beReachable ? "" : " (above 100% in the busiest season, so not reachable)"}`}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_vs_plan_pct,blended_occupancy_pct,operating_income,debt_coverage,cash_after_loan,payback_years_on_equity",
    ...r.sweep.map((x) => `${Math.round(x.scale * 100)},${x.occ.toFixed(1)},${x.noi.toFixed(2)},${x.dscr === null ? "" : x.dscr.toFixed(2)},${x.cashFlow.toFixed(2)},${x.payback === null ? "" : x.payback.toFixed(1)}`)].join("\n");
}
