// UK sole trader vs limited company: what you keep from the same profit, 2026/27,
// England, Wales and Northern Ireland rates. Pure functions, no I/O. Bad input is
// rejected with a message, never clamped.
// Rates were checked against published 2026/27 summaries in the building session
// (dividend 10.75% / 35.75% / 39.35%, employer NI 15% over 5,000, frozen allowances);
// the page tells the reader to confirm them on GOV.UK. Scottish income tax bands differ
// and are NOT modelled. Not tax advice.

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

export const SAMPLE = { profit: "60000", costs: "1200", retain: "0", salaryMode: "best", salary: "12570", employmentAllowance: "no", keepNiYear: "yes" };

export function compare(input) {
  const errors = [];
  const profit = Number(input.profit);
  const costs = input.costs === "" || input.costs == null ? 0 : Number(input.costs);
  const retain = input.retain === "" || input.retain == null ? 0 : Number(input.retain);
  const salaryMode = input.salaryMode === "custom" ? "custom" : "best";
  if (!Number.isFinite(profit) || profit <= 0) errors.push("Enter the yearly profit before any tax or director pay, above zero.");
  else if (profit > 5000000) errors.push("Profit above 5,000,000 is outside what this page models.");
  if (!Number.isFinite(costs) || costs < 0) errors.push("Extra company running costs must be zero or more.");
  if (!Number.isFinite(retain) || retain < 0) errors.push("Profit left in the company must be zero or more.");
  let salary = null;
  if (salaryMode === "custom") {
    salary = Number(input.salary);
    if (!Number.isFinite(salary) || salary < 0) errors.push("Enter a director salary of zero or more.");
    else if (Number.isFinite(profit) && salary > profit - (Number.isFinite(costs) ? costs : 0)) errors.push("Salary cannot exceed profit after company costs.");
  }
  if (errors.length) return { ok: false, errors };

  const ea = input.employmentAllowance === "yes";
  const keep = input.keepNiYear !== "no";
  const st = soleTrader(profit);
  const lc = salaryMode === "custom" ? limitedCompany(profit, salary, costs, ea, retain) : bestSalary(profit, costs, ea, keep, retain);
  const diff = r2(lc.takeHome - st.takeHome);

  // sensitivity across profit levels, same settings
  const levels = [20000, 30000, 40000, 50000, 60000, 80000, 100000, 125000, 150000, 200000];
  if (!levels.includes(profit)) levels.push(profit);
  levels.sort((a, b) => a - b);
  const table = levels.map((p) => {
    const s = soleTrader(p).takeHome;
    const l = (salaryMode === "custom" && salary <= p - costs ? limitedCompany(p, salary, costs, ea, retain) : bestSalary(p, costs, ea, keep, retain)).takeHome;
    return { profit: p, soleTrader: s, limited: l, diff: r2(l - s), current: p === profit };
  });

  const findings = [];
  if (diff > 0) findings.push({ severity: "info", title: `Limited company keeps about £${Math.round(diff).toLocaleString("en-GB")} more a year on these numbers`, detail: "That is before the things this page does not model: bookkeeping time, the director's loan rules, IR35, mortgage lenders' treatment of dividends, and losing the option to claim some benefits. Check the gap is worth the admin." });
  else findings.push({ severity: "medium", title: `Staying a sole trader keeps about £${Math.round(-diff).toLocaleString("en-GB")} more a year on these numbers`, detail: "At this profit the company's running costs and the extra layers of tax outweigh its lower rates. A limited company can still make sense for liability protection or to retain profit." });
  if (profit > R.mtdThreshold) findings.push({ severity: "high", title: "Making Tax Digital for Income Tax applies to a sole trader at this level", detail: "From April 2026 sole traders with qualifying income above £50,000 keep digital records and send quarterly updates through software; the threshold falls to £30,000 in April 2027 and £20,000 in April 2028. A limited company is outside that scheme but has its own filings." });
  else if (profit > 20000) findings.push({ severity: "info", title: "Making Tax Digital for Income Tax will reach a sole trader at this level later", detail: "The qualifying-income threshold is £50,000 from April 2026, £30,000 from April 2027 and £20,000 from April 2028, on gross income before expenses." });
  if (lc.salary < R.lowerEarningsLimit) findings.push({ severity: "medium", title: "Salary is below the lower earnings limit", detail: "A salary under £6,500 does not earn a qualifying year for the State Pension. Raising it to at least £6,500 costs little and protects the year." });
  if (lc.dividends > 0) findings.push({ severity: "info", title: "Dividends are taxed at higher rates from April 2026", detail: "Ordinary-rate dividend tax is 10.75% and upper-rate 35.75% in 2026/27, after a £500 allowance. This is why the best split is sensitive to the year." });
  if (profit >= 100000 && profit <= 125140) findings.push({ severity: "high", title: "You are in the personal allowance taper", detail: "Between £100,000 and £125,140 of income the personal allowance is withdrawn, an effective rate near 60% on the slice. Pension contributions and salary choices matter most here." });
  if (retain > 0) findings.push({ severity: "info", title: `£${Math.round(lc.retained).toLocaleString("en-GB")} stays in the company and is not counted as take-home`, detail: "Retained profit has already borne corporation tax and will bear dividend tax when you later take it out, so it is deferred rather than saved. The sole trader figure is taxed on all profit whether or not you spend it." });
  else findings.push({ severity: "info", title: "This assumes you take all the profit out", detail: "Set \"profit you leave in the company\" to see the effect of retaining some. Money left in the company defers personal tax rather than removing it." });

  return { ok: true, profit, costs, st, lc, diff, table, findings, salaryMode, taxYear: TAX_YEAR };
}

export function summaryText(input, r) {
  const m = (n) => `£${Math.round(n).toLocaleString("en-GB")}`;
  return [
    `UK sole trader vs limited company, ${r.taxYear}, England/Wales/NI rates`,
    `Profit before tax and director pay: ${m(r.profit)}`,
    ``,
    `Sole trader:  income tax ${m(r.st.incomeTax)} + Class 4 NI ${m(r.st.class4)} = ${m(r.st.tax)}; you keep ${m(r.st.takeHome)}`,
    `Limited company (salary ${m(r.lc.salary)}, dividends ${m(r.lc.dividends)}, running costs ${m(r.lc.costs)}, left in company ${m(r.lc.retained)}):`,
    `  employer NI ${m(r.lc.employerNi)}, corporation tax ${m(r.lc.corporationTax)}, employee NI ${m(r.lc.employeeNi)}, income tax ${m(r.lc.incomeTax)}, dividend tax ${m(r.lc.dividendTax)}`,
    `  you keep ${m(r.lc.takeHome)}`,
    ``,
    `Difference (limited minus sole trader): ${r.diff >= 0 ? "+" : "-"}${m(Math.abs(r.diff))} a year`,
    ``,
    `Not tax advice. Rates checked against published ${r.taxYear} summaries; confirm on GOV.UK. Scottish bands, student loans, pension contributions and retained profit are not modelled.`,
  ].join("\n");
}
