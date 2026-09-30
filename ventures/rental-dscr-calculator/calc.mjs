// Rental property DSCR: turns price, financing, rent and operating costs into
// NOI, cap rate, debt service coverage under both the lender-style (rent over
// PITIA) and the NOI definitions, cash-on-cash, break-even occupancy, the
// largest loan a target DSCR allows, a rate sensitivity table and a hold-period
// IRR. Deterministic and local. Pre-tax.

export const YEARS_MAX = 40;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

// Level monthly payment; interest-only when `io`.
export function loanPayment(amount, aprPct, years, io = false) {
  if (amount <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (io) return amount * r;
  if (years <= 0) return 0;
  const n = years * 12;
  return r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
}

// Largest loan whose level payment is `payment` a month.
export function maxLoanForPayment(payment, aprPct, years, io = false) {
  if (payment <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (io) return r === 0 ? 0 : payment / r;
  const n = years * 12;
  return r === 0 ? payment * n : (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export function balanceAfter(amount, aprPct, years, months, io = false) {
  if (amount <= 0) return 0;
  if (io) return amount;
  const r = aprPct / 100 / 12, pay = loanPayment(amount, aprPct, years);
  if (r === 0) return Math.max(0, amount - pay * months);
  return Math.max(0, amount * Math.pow(1 + r, months) - pay * ((Math.pow(1 + r, months) - 1) / r));
}

export function irr(flows) {
  const npv = (rate) => flows.reduce((a, f, t) => a + f / Math.pow(1 + rate, t), 0);
  let lo = -0.9, hi = 2;
  if (!(npv(lo) > 0 && npv(hi) < 0)) return null;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Year-1 operating picture. p percents are 0..1, money is per month unless named yearly.
export function operating(p) {
  const gross = p.rent * 12 + p.otherIncome * 12;
  const vacancy = gross * p.vacancy;
  const egi = gross - vacancy;
  const variable = egi * (p.management + p.maintenance);
  const fixed = p.propertyTax + p.insurance + p.hoa * 12 + p.utilities * 12;
  const opex = variable + fixed;
  const noi = egi - opex;
  const debt = loanPayment(p.loan, p.apr * 100, p.termYears, p.interestOnly) * 12;
  const pitia = debt + p.propertyTax + p.insurance + p.hoa * 12;
  return { gross, vacancy, egi, opex, fixed, variable, noi, debt, pitia,
    dscrNoi: debt > 0 ? noi / debt : null,
    // Lender-style: scheduled gross rent over principal, interest, tax, insurance and HOA.
    dscrRent: pitia > 0 ? (p.rent * 12 + p.otherIncome * 12) / pitia : null,
    cashFlow: noi - debt, capRate: p.price > 0 ? noi / p.price : 0,
    cashOnCash: p.cashInvested > 0 ? (noi - debt) / p.cashInvested : null,
    // Occupancy at which NOI just covers debt service.
    breakEven: gross > 0 ? Math.min(1.5, (fixed + debt) / (gross * (1 - p.management - p.maintenance))) : null };
}

export function hold(p) {
  const flows = [-p.cashInvested], rows = [];
  let cum = -p.cashInvested;
  for (let y = 1; y <= p.years; y++) {
    const g = Math.pow(1 + p.rentGrowth, y - 1), e = Math.pow(1 + p.expenseGrowth, y - 1);
    const gross = (p.rent + p.otherIncome) * 12 * g;
    const egi = gross * (1 - p.vacancy);
    const opex = egi * (p.management + p.maintenance) + p.fixedYear1 * e;
    const noi = egi - opex;
    const debt = y <= p.termYears || p.interestOnly ? loanPayment(p.loan, p.apr * 100, p.termYears, p.interestOnly) * 12 : 0;
    const cf = noi - debt;
    cum += cf;
    let net = cf;
    let sale = null;
    if (y === p.years) {
      const value = p.price * Math.pow(1 + p.appreciation, y);
      const bal = balanceAfter(p.loan, p.apr * 100, p.termYears, Math.min(y, p.termYears) * 12, p.interestOnly);
      sale = value * (1 - p.sellCost) - bal;
      net += sale;
      cum += sale;
    }
    flows.push(net);
    rows.push({ year: y, noi, debt, cashFlow: cf, sale, cumulative: cum });
  }
  const invested = -flows[0];
  const total = flows.slice(1).reduce((a, b) => a + b, 0);
  return { rows, flows, irr: irr(flows), multiple: invested > 0 ? total / invested : null, profit: total - invested };
}

function parseInput(raw) {
  const req = (key, name, max = Infinity) => {
    const v = parseNum(raw[key]);
    return v > 0 && v <= max ? { v } : { error: `Enter ${name}, above zero${max < Infinity ? ` and up to ${money(max)}` : ""}.` };
  };
  const o = {};
  for (const [key, name, max] of [["price", "the purchase price", 1e9], ["rent", "the monthly rent", 1e6]]) {
    const r = req(key, name, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  const num = (key, name, dflt, max) => {
    const v = opt(raw[key], dflt);
    return v >= 0 && v <= max ? { v } : { error: `${name} must be a number between 0 and ${money(max)}, or blank.` };
  };
  for (const [key, name, dflt, max] of [
    ["downPct", "Down payment, percent", 25, 100], ["apr", "Interest rate, percent", 7, 30], ["termYears", "Loan term, years", 30, 40],
    ["closingPct", "Closing costs, percent of price", 3, 20], ["rehab", "Rehab and reserves, dollars", 0, 1e8],
    ["otherIncome", "Other monthly income", 0, 1e6], ["vacancy", "Vacancy, percent", 5, 100],
    ["propertyTax", "Yearly property tax", 0, 1e7], ["insurance", "Yearly insurance", 0, 1e7], ["hoa", "Monthly HOA", 0, 1e5],
    ["utilities", "Monthly utilities you pay", 0, 1e5], ["management", "Property management, percent of rent", 0, 50],
    ["maintenance", "Maintenance and capex reserve, percent of rent", 5, 50], ["targetDscr", "Target DSCR", 1.2, 5],
    ["rentGrowth", "Yearly rent growth, percent", 3, 20], ["expenseGrowth", "Yearly expense growth, percent", 3, 20],
    ["appreciation", "Yearly appreciation, percent", 3, 20], ["sellCost", "Selling costs, percent", 6, 30], ["years", "Years to hold", 10, YEARS_MAX],
  ]) {
    const r = num(key, name, dflt, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  if (o.years < 1) return { error: "Years to hold must be at least 1." };
  if (o.downPct >= 100 && o.downPct !== 100) return { error: "Down payment must be under 100 percent." };
  const interestOnly = String(raw.interestOnly ?? "").toLowerCase() === "yes" || raw.interestOnly === true;
  const loan = o.price * (1 - o.downPct / 100);
  const cashInvested = o.price - loan + o.price * (o.closingPct / 100) + o.rehab;
  if (!(cashInvested > 0)) return { error: "Cash invested is zero, so returns on it are undefined. Enter a down payment or closing costs." };
  const p = { price: o.price, rent: o.rent, otherIncome: o.otherIncome, loan, apr: o.apr / 100, termYears: Math.round(o.termYears) || 30, interestOnly,
    cashInvested, vacancy: o.vacancy / 100, propertyTax: o.propertyTax, insurance: o.insurance, hoa: o.hoa, utilities: o.utilities,
    management: o.management / 100, maintenance: o.maintenance / 100, targetDscr: o.targetDscr, rentGrowth: o.rentGrowth / 100,
    expenseGrowth: o.expenseGrowth / 100, appreciation: o.appreciation / 100, sellCost: o.sellCost / 100, years: Math.round(o.years) };
  p.fixedYear1 = p.propertyTax + p.insurance + p.hoa * 12 + p.utilities * 12;
  return { p };
}

export function analyze(raw) {
  const r = parseInput(raw);
  if (r.error) return r;
  const p = r.p;
  const base = operating(p);
  const long = hold(p);
  const ratePts = [-1, 0, 1, 2, 3].map((d) => Math.max(0, p.apr * 100 + d));
  const rates = ratePts.map((pct, i) => {
    const q = { ...p, apr: pct / 100 };
    const o = operating(q);
    return { label: i === 1 ? "Your rate" : `${[-1, 0, 1, 2, 3][i] > 0 ? "+" : ""}${[-1, 0, 1, 2, 3][i]} point${Math.abs([-1, 0, 1, 2, 3][i]) === 1 ? "" : "s"}`, rate: pct, payment: o.debt / 12, dscrRent: o.dscrRent, dscrNoi: o.dscrNoi, cashFlow: o.cashFlow };
  });
  // Largest loan each definition allows at the target DSCR.
  const maxNoiDebt = base.noi / p.targetDscr;
  const rentGross = (p.rent + p.otherIncome) * 12;
  const maxPitiaDebt = rentGross / p.targetDscr - p.propertyTax - p.insurance - p.hoa * 12;
  const toLoan = (annualDebt) => maxLoanForPayment(Math.max(0, annualDebt) / 12, p.apr * 100, p.termYears, p.interestOnly);
  const maxLoanNoi = toLoan(maxNoiDebt), maxLoanRent = toLoan(maxPitiaDebt);
  const ltv = p.price > 0 ? p.loan / p.price : 0;
  const findings = [];
  const fmt = (v) => (v === null ? "n/a" : v.toFixed(2));
  findings.push({ severity: "info", title: `DSCR ${fmt(base.dscrRent)} on rent over PITIA, ${fmt(base.dscrNoi)} on NOI`, detail: `Year-1 NOI is about $${money(base.noi)} against $${money(base.debt)} of yearly debt service. Lenders that underwrite on the property's rent commonly use the rent-over-PITIA figure; conventional lenders use NOI. Ask which one and what minimum your lender applies.` });
  if (base.dscrRent !== null && base.dscrRent < p.targetDscr) findings.push({ severity: "medium", title: `Below your ${p.targetDscr.toFixed(2)} target`, detail: `At this price and rate the largest loan that clears the target is about $${money(maxLoanRent)} on the rent-over-PITIA test, against the $${money(p.loan)} you entered (${(ltv * 100).toFixed(0)}% of price). A bigger down payment, a lower price or a lower rate closes the gap.` });
  if (base.cashFlow < 0) findings.push({ severity: "medium", title: "Cash flow is negative in year 1", detail: `After operating costs and debt service you would put in about $${money(-base.cashFlow)} a year. Check the rent, vacancy and reserve assumptions.` });
  if (base.dscrNoi !== null && base.dscrRent !== null && base.dscrRent - base.dscrNoi > 0.4) findings.push({ severity: "info", title: "The two DSCR definitions are far apart here", detail: "Operating costs the lender-style test ignores (vacancy, maintenance, management, utilities) are large relative to rent. NOI is the more conservative reading of what the property actually earns." });
  if (base.breakEven !== null) findings.push({ severity: "info", title: `Break-even occupancy about ${(Math.min(base.breakEven, 1.5) * 100).toFixed(0)}%`, detail: "Occupancy below this leaves NOI short of debt service. Above 100% means the rent cannot cover debt even when full." });
  if (p.interestOnly) findings.push({ severity: "info", title: "Interest-only payments assumed", detail: "The balance does not fall, so a sale repays the full loan. Many interest-only periods end after 5 to 10 years and the payment then rises; that step is not modelled." });
  return { p, base, long, rates, maxLoanNoi, maxLoanRent, findings, ltv };
}

export function sampleInput() {
  return { price: "350000", downPct: "25", apr: "7.25", termYears: "30", closingPct: "3", rehab: "5000", rent: "2900", otherIncome: "0", vacancy: "5", propertyTax: "4200", insurance: "1800", hoa: "0", utilities: "0", management: "8", maintenance: "6", targetDscr: "1.2", rentGrowth: "3", expenseGrowth: "3", appreciation: "3", sellCost: "6", years: "10", interestOnly: "no" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Year", "NOI", "Debt service", "Cash flow", "Sale proceeds after loan", "Cumulative cash"]];
  for (const r of a.long.rows) rows.push([r.year, round2(r.noi), round2(r.debt), round2(r.cashFlow), r.sale === null ? "" : round2(r.sale), round2(r.cumulative)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
