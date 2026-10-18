// UK "£100k tax trap" calculator: what the next pound of pay really costs between GBP 100,000 and 125,140, and what a pension contribution
// that pulls adjusted net income back under GBP 100,000 really costs after tax, National Insurance, restored personal allowance and childcare.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled (England, Wales, Northern Ireland income tax; employee Class 1 NI):
// personal allowance 12,570 reduced by 1 for every 2 of adjusted net income over 100,000 (gone at 125,140); 20% on the first 37,700 of taxable income,
// 40% to 125,140 of taxable income, 45% above; employee NI 8% between 12,570 and 50,270 and 2% above. These bands are frozen for both years offered, so
// the year choice only labels the output; they are still inputs of the source, so check GOV.UK. A pension contribution is treated as reducing income by its
// gross amount (equivalent to salary sacrifice, net pay or relief at source plus a Self Assessment claim); only salary sacrifice also saves NI. NOT modelled:
// Scottish rates, savings and dividend income, the pension annual allowance and carry forward (warned at 60,000), the tapered annual allowance, student loan
// repayments, employer NI saving, and the 2,000 cap on NI-free salary sacrifice due from April 2029. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Income Tax: personal allowance (reduced above 100,000)', 'Tax-Free Childcare' and 'Pensions tax relief'";
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };
export const PA = 12570, TAPER_START = 100000, PA_GONE = 125140, BASIC_BAND = 37700, NI_PT = 12570, NI_UEL = 50270;
export const PENSION_ALLOWANCE = 60000;

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const pct = (x) => Math.round(x * 1000) / 10 + "%";

export function personalAllowance(ani) {
  if (ani <= TAPER_START) return PA;
  return Math.max(0, PA - (ani - TAPER_START) / 2);
}

// Income tax on `income` (taxable pay after any pension deduction), England/Wales/NI.
export function incomeTax(income) {
  const pa = personalAllowance(income);
  const taxable = Math.max(0, income - pa);
  const basic = Math.min(taxable, BASIC_BAND);
  const higher = Math.max(0, Math.min(taxable, PA_GONE) - BASIC_BAND);
  const additional = Math.max(0, taxable - PA_GONE);
  return basic * 0.2 + higher * 0.4 + additional * 0.45;
}

export function employeeNI(pay) {
  return Math.max(0, Math.min(pay, NI_UEL) - NI_PT) * 0.08 + Math.max(0, pay - NI_UEL) * 0.02;
}

// High Income Child Benefit Charge: 1% of the benefit per 200 of adjusted net income over 60,000, whole percents, full at 80,000.
export function hicbc(ani, benefit) {
  if (!(benefit > 0) || ani <= 60000) return 0;
  return benefit * Math.min(100, Math.floor((ani - 60000) / 200)) / 100;
}

// Position after tax, NI, any HICBC, and any pension contribution leaving your hands.
export function position(salary, contribution, method, benefit = 0) {
  const income = salary - contribution;
  const tax = incomeTax(income);
  const niBase = method === "sacrifice" ? salary - contribution : salary;
  const ni = employeeNI(niBase);
  const charge = hicbc(income, benefit);
  const takeHome = salary - tax - ni - charge - contribution;
  return { income, tax, ni, charge, takeHome, pa: personalAllowance(income) };
}

// Cost of the next 1,000 of pay to you, as a share, at a given gross pay (no pension change).
export function marginalRate(salary, benefit = 0) {
  const a = position(salary, 0, "none", benefit), b = position(salary + 1000, 0, "none", benefit);
  return 1 - (b.takeHome - a.takeHome) / 1000;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return null; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return null; }
    return n;
  };
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const method = i.method || "sacrifice";
  if (!["sacrifice", "personal"].includes(method)) errors.push("Pick how the contribution is paid.");
  const salary = num("salary", "your gross annual pay before this contribution");
  const contribution = num("contribution", "the gross pension contribution to test (zero to see the trap only)", true) ?? 0;
  const childBenefit = num("childBenefit", "your yearly Child Benefit (zero if none)", true) ?? 0;
  const childcare = num("childcare", "the yearly value of Tax-Free Childcare or free hours you would lose (zero if none)", true) ?? 0;
  if (salary !== null && salary > 5000000) errors.push("Pay above 5,000,000 looks like a typo.");
  if (salary !== null && contribution > salary) errors.push("The contribution cannot exceed your pay.");
  return { errors, year, method, salary: salary ?? 0, contribution, childBenefit, childcare };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const label = YEARS[p.year];
  const findings = [];
  const base = position(p.salary, 0, p.method, p.childBenefit);
  const marginal = marginalRate(p.salary, p.childBenefit);
  const inTrap = p.salary > TAPER_START && p.salary < PA_GONE;
  const toHundredK = Math.max(0, p.salary - TAPER_START);
  const toEdge = toHundredK; // contribution that brings adjusted net income to exactly 100,000
  const edge = position(p.salary, toEdge, p.method, p.childBenefit);
  const edgeCost = r2(base.takeHome - edge.takeHome);
  const test = p.contribution > 0 ? position(p.salary, p.contribution, p.method, p.childBenefit) : null;
  const testCost = test ? r2(base.takeHome - test.takeHome) : 0;
  const childcareRegained = test && test.income <= TAPER_START && base.income > TAPER_START ? p.childcare : 0;
  const edgeChildcare = toEdge > 0 && base.income > TAPER_START ? p.childcare : 0;

  if (p.salary <= TAPER_START) {
    findings.push({ severity: "info", title: `At ${money(p.salary)} you are not in the trap: the personal allowance is intact (${money(base.pa)}) and your marginal rate is ${pct(marginal)}. The 60% band starts at ${money(TAPER_START)} of adjusted net income.` });
  } else if (p.salary >= PA_GONE) {
    findings.push({ severity: "info", title: `At ${money(p.salary)} the personal allowance is already gone (taper ends at ${money(PA_GONE)}), so extra pay is taxed at ${pct(marginal)}. A pension contribution still restores allowance: the first ${money(p.salary - PA_GONE)} saves 45% plus NI, the next ${money(PA_GONE - TAPER_START)} saves about 62%.` });
  } else {
    findings.push({ severity: "high", title: `In ${label} your next pound of pay keeps only about ${pct(1 - marginal)}: a marginal rate of ${pct(marginal)} (40% tax, plus 20% from losing allowance, plus ${p.method === "sacrifice" ? "2% NI" : "NI"}). You have lost ${money(PA - base.pa)} of your ${money(PA)} personal allowance.` });
  }
  if (toEdge > 0) {
    findings.push({ severity: "medium", title: `A gross pension contribution of ${money(toEdge)} brings adjusted net income to exactly ${money(TAPER_START)}, restores the full allowance, and costs you ${money(edgeCost)} out of pocket (${pct(edgeCost / toEdge)} of the amount, i.e. ${pct(1 - edgeCost / toEdge)} relief)${p.method === "sacrifice" ? " using salary sacrifice" : ""}.` });
    if (edgeChildcare > 0) findings.push({ severity: "high", title: `At ${money(TAPER_START)} or below you also keep ${money(edgeChildcare)} a year of Tax-Free Childcare / free hours (lost entirely if either parent's adjusted net income is over ${money(TAPER_START)}). Net of that, the contribution is worth ${money(edgeChildcare - edgeCost)} a year to you on top of the pension.` });
  }
  if (p.childBenefit > 0 && base.income > 80000) findings.push({ severity: "info", title: `Your Child Benefit of ${money(p.childBenefit)} is fully clawed back at this income. Getting adjusted net income under ${money(80000)} would start to give it back, but that needs a much larger contribution.` });
  if (test) {
    findings.push({ severity: test.income <= TAPER_START ? "medium" : "info", title: `Your test contribution of ${money(p.contribution)} (${p.method === "sacrifice" ? "salary sacrifice" : "personal"}) takes adjusted net income to ${money(test.income)}, saves ${money(r2(base.tax - test.tax))} tax${p.method === "sacrifice" ? ` and ${money(r2(base.ni - test.ni))} NI` : ""}${base.charge - test.charge > 0 ? ` and ${money(r2(base.charge - test.charge))} of Child Benefit charge` : ""}, and costs ${money(testCost)} out of pocket: ${pct(1 - testCost / p.contribution)} effective relief.${childcareRegained > 0 ? ` It also brings back ${money(childcareRegained)} a year of childcare support.` : ""}` });
    if (p.contribution > PENSION_ALLOWANCE) findings.push({ severity: "high", title: `${money(p.contribution)} is above the ${money(PENSION_ALLOWANCE)} standard pension annual allowance. Unused allowance from the previous three years may cover it; this tool does not model that, and an excess is taxable.` });
  }
  const obligations = [
    { ref: "Verify", title: "Check the rates", why: `Allowances, bands and NI rates are set by government. Confirm the current figures at ${VERIFY.split(";")[0]}.` },
    { ref: "Pension", title: "Locked in until 55 (57 from 2028)", why: "Money in a pension cannot be withdrawn freely. 25% is normally tax-free to take later; the rest is taxed as income. The benefit here is relief now, not a discount on spending." },
    { ref: "Claim", title: "Personal payments need a claim", why: "If you pay into a personal pension (relief at source), the provider adds 20% and you claim the rest through Self Assessment or a tax code change. Salary sacrifice and net pay arrangements apply it automatically. Ask your payroll first." },
    { ref: "Adjusted", title: "Adjusted net income, not salary", why: "The 100,000 test uses taxable income after Gift Aid and gross pension payments, and includes savings interest, dividends and rental profit. This tool starts from the pay you enter." },
  ];
  return { errors: [], label, p, base, marginal, inTrap, toEdge, edge, edgeCost, test, testCost, childcareRegained, edgeChildcare, findings, obligations };
}

export const SAMPLE = { year: 2025, salary: 110000, method: "sacrifice", contribution: 10000, childBenefit: 0, childcare: 2000 };

// Marginal-rate table for the chart/table: pay -> marginal rate.
export function marginalTable(benefit = 0) {
  return [90000, 100000, 105000, 110000, 115000, 120000, 125140, 130000].map((s) => ({ salary: s, rate: marginalRate(s, benefit), pa: personalAllowance(s) }));
}

export function summaryText(r) {
  const L = [`UK 100k tax trap check, tax year ${r.label}`, "", `Pay: ${money(r.p.salary)}`, `Personal allowance left: ${money(r.base.pa)}`, `Marginal rate on the next pound: ${pct(r.marginal)}`, `Contribution to reach ${money(TAPER_START)}: ${money(r.toEdge)} (costs ${money(r.edgeCost)})`];
  if (r.test) L.push(`Test contribution ${money(r.p.contribution)}: costs ${money(r.testCost)}, adjusted net income ${money(r.test.income)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
