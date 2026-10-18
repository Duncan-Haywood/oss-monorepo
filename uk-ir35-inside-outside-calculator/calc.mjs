// UK IR35: contractor take-home outside IR35 (own limited company, best salary and dividends) versus inside IR35 (umbrella company or deemed payment), 2026/27, England, Wales and Northern Ireland rates.
// Tax functions are copied from ../uk-sole-trader-vs-limited-company-calculator/calc.mjs (rates checked against published 2026/27 summaries there). Pure functions, no I/O. Not tax advice.
export const TAX_YEAR = "2026/27";

export const R = {
  personalAllowance: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalFrom: 125140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  dividendAllowance: 500,
  divOrdinary: 0.1075,
  divUpper: 0.3575,
  divAdditional: 0.3935,
  class4Lower: 12570,
  class4Upper: 50270,
  class4Main: 0.06,
  class4Upper2: 0.02,
  primaryThreshold: 12570,
  upperEarningsLimit: 50270,
  employeeNi: 0.08,
  employeeNiUpper: 0.02,
  secondaryThreshold: 5000,
  employerNi: 0.15,
  employmentAllowance: 10500,
  lowerEarningsLimit: 6500,
  ctSmall: 0.19,
  ctMain: 0.25,
  ctLower: 50000,
  ctUpper: 250000,
  ctMarginalFraction: 3 / 200,
  mtdThreshold: 50000,
};

const r2 = (n) => Math.round(n * 100) / 100;

export function personalAllowance(income) {
  if (income <= R.taperStart) return R.personalAllowance;
  return Math.max(0, R.personalAllowance - Math.floor((income - R.taperStart) / 2));
}

// Income tax on non-dividend income (earnings / self-employed profit).
export function incomeTax(nonDividend) {
  const pa = personalAllowance(nonDividend);
  const taxable = Math.max(0, nonDividend - pa);
  const basic = Math.min(taxable, R.basicBand);
  const higher = Math.min(Math.max(0, taxable - R.basicBand), R.additionalFrom - R.basicBand);
  const additional = Math.max(0, taxable - R.additionalFrom);
  return basic * R.basicRate + higher * R.higherRate + additional * R.additionalRate;
}

// Dividend tax, stacked on top of non-dividend income.
export function dividendTax(nonDividend, dividends) {
  if (dividends <= 0) return 0;
  const total = nonDividend + dividends;
  const pa = personalAllowance(total);
  const paLeftForDividends = Math.max(0, pa - nonDividend);
  const taxableNonDiv = Math.max(0, nonDividend - pa);
  let pos = taxableNonDiv; // position in the taxable-income stack
  let remaining = Math.max(0, dividends - paLeftForDividends);
  let tax = 0;
  let allowance = R.dividendAllowance;
  const slices = [
    [R.basicBand, R.divOrdinary],
    [R.additionalFrom, R.divUpper],
    [Infinity, R.divAdditional],
  ];
  for (const [top, rate] of slices) {
    if (remaining <= 0) break;
    if (pos >= top) continue;
    let slice = Math.min(remaining, top - pos);
    const free = Math.min(allowance, slice);
    allowance -= free;
    tax += (slice - free) * rate;
    pos += slice;
    remaining -= slice;
  }
  return tax;
}

export function class4(profit) {
  const main = Math.max(0, Math.min(profit, R.class4Upper) - R.class4Lower);
  const upper = Math.max(0, profit - R.class4Upper);
  return main * R.class4Main + upper * R.class4Upper2;
}

export function employeeNi(salary) {
  const main = Math.max(0, Math.min(salary, R.upperEarningsLimit) - R.primaryThreshold);
  const upper = Math.max(0, salary - R.upperEarningsLimit);
  return main * R.employeeNi + upper * R.employeeNiUpper;
}

export function employerNi(salary, employmentAllowance) {
  const gross = Math.max(0, salary - R.secondaryThreshold) * R.employerNi;
  return employmentAllowance ? Math.max(0, gross - R.employmentAllowance) : gross;
}

export function corporationTax(profit) {
  if (profit <= 0) return 0;
  if (profit <= R.ctLower) return profit * R.ctSmall;
  if (profit >= R.ctUpper) return profit * R.ctMain;
  return profit * R.ctMain - (R.ctUpper - profit) * R.ctMarginalFraction;
}

export function soleTrader(profit) {
  const it = incomeTax(profit);
  const ni = class4(profit);
  return { profit, incomeTax: r2(it), class4: r2(ni), tax: r2(it + ni), takeHome: r2(profit - it - ni) };
}

// costs = extra yearly running costs of the company (accountant, filing, software)
export function limitedCompany(profit, salary, costs = 0, employmentAllowance = false, retain = 0) {
  const erNi = employerNi(salary, employmentAllowance);
  const ctProfit = Math.max(0, profit - costs - salary - erNi);
  const ct = corporationTax(ctProfit);
  const retained = Math.min(Math.max(0, retain), Math.max(0, ctProfit - ct));
  const dividends = Math.max(0, ctProfit - ct - retained);
  const eeNi = employeeNi(salary);
  const it = incomeTax(salary);
  const dt = dividendTax(salary, dividends);
  const takeHome = salary - eeNi - it + dividends - dt;
  const tax = erNi + ct + eeNi + it + dt;
  return {
    salary, retained: r2(retained), dividends: r2(dividends), employerNi: r2(erNi), corporationTax: r2(ct), employeeNi: r2(eeNi),
    incomeTax: r2(it), dividendTax: r2(dt), costs, tax: r2(tax), takeHome: r2(takeHome),
  };
}

// Search salaries for the one that maximises take-home. When keepNiYear is true the
// salary stays at or above the lower earnings limit, so the year still counts for the
// State Pension without paying NI.
export function bestSalary(profit, costs = 0, employmentAllowance = false, keepNiYear = true, retain = 0) {
  const max = Math.max(0, profit - costs);
  const floor = keepNiYear ? Math.min(R.lowerEarningsLimit, max) : 0;
  let best = null;
  const candidates = new Set([floor, Math.min(R.secondaryThreshold, max), Math.min(R.personalAllowance, max)]);
  for (let s = floor; s <= Math.min(max, 150000); s += 100) candidates.add(s);
  for (const s of candidates) {
    if (s < floor || s > max) continue;
    // The search ignores retention: with it, the cheapest answer is always to leave money
    // untaxed in the company, which says nothing about the best salary.
    const c = limitedCompany(profit, s, costs, employmentAllowance, 0);
    if (!best || c.takeHome > best.takeHome + 0.005) best = c;
  }
  return limitedCompany(profit, best.salary, costs, employmentAllowance, retain);
}


// Inside IR35 through an umbrella company (or a deemed payment through your own company):
// the whole invoice, minus the umbrella's fee, has to cover the employer NI on your pay too,
// so gross pay G solves G + 15% * max(0, G - 5,000) = invoice - fee. Apprenticeship levy,
// employer pension contributions and holiday-pay accrual are not modelled.
export function insideIr35(invoice, yearlyFee = 0) {
  const available = Math.max(0, invoice - yearlyFee);
  const gross = available <= R.secondaryThreshold ? available : (available + R.secondaryThreshold * R.employerNi) / (1 + R.employerNi);
  const erNi = Math.max(0, gross - R.secondaryThreshold) * R.employerNi;
  const eeNi = employeeNi(gross);
  const it = incomeTax(gross);
  return { invoice, fee: yearlyFee, grossPay: r2(gross), employerNi: r2(erNi), employeeNi: r2(eeNi), incomeTax: r2(it), tax: r2(erNi + eeNi + it), takeHome: r2(gross - eeNi - it) };
}

// Outside IR35 through your own company: profit = invoice - expenses the company can claim.
export function outsideIr35(invoice, expenses, companyCosts, employmentAllowance = false, keepNiYear = true) {
  const profit = Math.max(0, invoice - expenses);
  const c = bestSalary(profit, companyCosts, employmentAllowance, keepNiYear, 0);
  return { invoice, expenses, ...c };
}

// Smallest yearly invoice that makes inside-IR35 take-home match `target` (bisection).
export function breakEvenInvoice(target, yearlyFee) {
  let lo = 0, hi = 2000000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (insideIr35(mid, yearlyFee).takeHome >= target) hi = mid; else lo = mid;
  }
  return r2(hi);
}

export const SAMPLE = { dayRate: "500", daysPerYear: "220", expenses: "1500", companyCosts: "1500", umbrellaFeeWeekly: "25", insideRate: "", employmentAllowance: "no", keepNiYear: "yes" };

export function compare(input) {
  const errors = [];
  const num = (v, d = 0) => (v === "" || v == null ? d : Number(v));
  const dayRate = num(input.dayRate, NaN);
  const days = num(input.daysPerYear, NaN);
  const expenses = num(input.expenses);
  const companyCosts = num(input.companyCosts);
  const feeWeekly = num(input.umbrellaFeeWeekly);
  const insideRate = input.insideRate === "" || input.insideRate == null ? null : Number(input.insideRate);
  if (!Number.isFinite(dayRate) || dayRate <= 0) errors.push("Enter a day rate above zero.");
  else if (dayRate > 5000) errors.push("Day rates above 5,000 are outside what this page models.");
  if (!Number.isFinite(days) || days <= 0 || days > 260) errors.push("Enter working days a year between 1 and 260.");
  if (!Number.isFinite(expenses) || expenses < 0) errors.push("Yearly business expenses must be zero or more.");
  if (!Number.isFinite(companyCosts) || companyCosts < 0) errors.push("Yearly company running costs must be zero or more.");
  if (!Number.isFinite(feeWeekly) || feeWeekly < 0) errors.push("Umbrella weekly fee must be zero or more.");
  if (insideRate !== null && (!Number.isFinite(insideRate) || insideRate <= 0)) errors.push("The inside-IR35 day rate, if given, must be above zero.");
  if (errors.length) return { ok: false, errors };

  const ea = input.employmentAllowance === "yes";
  const keep = input.keepNiYear !== "no";
  const invoice = dayRate * days;
  const yearlyFee = feeWeekly * 52;
  const out = outsideIr35(invoice, expenses, companyCosts, ea, keep);
  const inRate = insideRate ?? dayRate;
  const inside = insideIr35(inRate * days, yearlyFee);
  const diff = r2(out.takeHome - inside.takeHome);
  const needInvoice = breakEvenInvoice(out.takeHome, yearlyFee);
  const needDayRate = r2(needInvoice / days);
  const uplift = r2(needDayRate - dayRate);

  const rates = [300, 400, 500, 600, 700, 800].map((d) => d);
  if (!rates.includes(dayRate)) rates.push(dayRate);
  rates.sort((a, b) => a - b);
  const table = rates.map((d) => {
    const o = outsideIr35(d * days, expenses, companyCosts, ea, keep).takeHome;
    const i = insideIr35(d * days, yearlyFee).takeHome;
    return { dayRate: d, outside: o, inside: i, diff: r2(o - i), breakEvenDayRate: r2(breakEvenInvoice(o, yearlyFee) / days), current: d === dayRate };
  });

  const findings = [];
  findings.push({ severity: diff > 0 ? "high" : "info", title: `Inside IR35 at the same rate you take home about £${Math.round(Math.abs(diff)).toLocaleString("en-GB")} ${diff >= 0 ? "less" : "more"} a year`, detail: "Inside IR35 you are taxed as an employee: employer NI of 15% comes out of the fee-payer's budget, income tax and employee NI come out of your pay, and most business expenses and dividends stop working for you." });
  findings.push({ severity: "high", title: `To keep the same take-home inside IR35 you would need about £${Math.round(needDayRate).toLocaleString("en-GB")} a day (${uplift >= 0 ? "+" : "-"}£${Math.round(Math.abs(uplift)).toLocaleString("en-GB")})`, detail: "Use this when a client offers a rate inside IR35. It is the day rate at which the umbrella take-home equals your outside-IR35 take-home, before the benefits employment adds (holiday pay, sick pay, pension) and the ones you lose (expenses, flexibility)." });
  if (inside.grossPay < R.lowerEarningsLimit) findings.push({ severity: "medium", title: "Pay is below the lower earnings limit", detail: "Pay under £6,500 would not earn a State Pension qualifying year." });
  if (invoice > 100000) findings.push({ severity: "medium", title: "Income above £100,000 loses personal allowance", detail: "Between £100,000 and £125,140 the personal allowance is withdrawn, an effective rate near 60% on that slice, inside or outside IR35." });
  if (expenses > 0) findings.push({ severity: "info", title: "Expenses are claimed only outside IR35 here", detail: "Inside IR35 most business expenses are not allowable against employment income; travel and subsistence to a temporary workplace may still be claimed through the umbrella in some cases. This page does not model that." });
  findings.push({ severity: "info", title: "This page compares pay, not whether you are inside or outside", detail: "Your IR35 status is decided on the facts of the engagement (control, substitution, mutuality of obligation). Use HMRC's own CEST tool or take advice; this page only shows what each answer is worth." });

  return { ok: true, dayRate, days, invoice, expenses, companyCosts, yearlyFee, insideRate: inRate, out, inside, diff, needDayRate, uplift, table, findings, taxYear: TAX_YEAR };
}

export function summaryText(input, r) {
  const m = (n) => `£${Math.round(n).toLocaleString("en-GB")}`;
  return [
    `UK IR35 inside vs outside, ${r.taxYear}, England/Wales/NI rates`,
    `Day rate ${m(r.dayRate)} x ${r.days} days = ${m(r.invoice)} a year; expenses ${m(r.expenses)}; company costs ${m(r.companyCosts)}`,
    ``,
    `Outside IR35 (own company, salary ${m(r.out.salary)}, dividends ${m(r.out.dividends)}): total tax and NI ${m(r.out.tax)}; you keep ${m(r.out.takeHome)}`,
    `Inside IR35 (umbrella or deemed payment, rate ${m(r.insideRate)}/day, fee ${m(r.yearlyFee)}/yr): gross pay ${m(r.inside.grossPay)}, employer NI ${m(r.inside.employerNi)}, employee NI ${m(r.inside.employeeNi)}, income tax ${m(r.inside.incomeTax)}; you keep ${m(r.inside.takeHome)}`,
    ``,
    `Difference (outside minus inside): ${r.diff >= 0 ? "+" : "-"}${m(Math.abs(r.diff))} a year`,
    `Inside-IR35 day rate that matches outside take-home: ${m(r.needDayRate)}`,
    ``,
    `Not tax advice. Rates checked against published ${r.taxYear} summaries; confirm on GOV.UK. Scottish bands, student loans, pension contributions, VAT and holiday pay are not modelled.`,
  ].join("\n");
}
