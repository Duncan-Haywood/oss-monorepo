// UK "60% tax trap" calculator for 2025/26 and 2026/27 (England, Wales and Northern Ireland bands).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: personal allowance GBP 12,570, withdrawn GBP 1 per GBP 2 of
// adjusted net income over GBP 100,000 (gone at GBP 125,140); income tax 20% on the first GBP 37,700 of taxable income, 40% to GBP 125,140, 45% above;
// employee Class 1 NI 8% from GBP 12,570 to GBP 50,270 and 2% above; self-employed Class 4 NI 6% / 2% on the same thresholds. These thresholds are frozen
// at the same values for both years. A pension contribution is modelled two ways: a personal pension with relief at source (provider adds 20%, the basic-rate
// band is extended by the gross contribution, and the contribution cuts adjusted net income) or salary sacrifice (salary falls, saving tax and NI).
// Scottish bands, Class 2 NI, student loans, the High Income Child Benefit Charge, savings/dividend income, the annual-allowance taper and Gift Aid are NOT
// modelled. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Tax on your private pension contributions', 'National Insurance rates and categories'; Income Tax Act 2007 s.35; Finance Act 2004 s.190";
export const PA = 12570;
export const TAPER_FROM = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_FROM = 125140;
export const NI_LOWER = 12570;
export const NI_UPPER = 50270;
export const ANNUAL_ALLOWANCE = 60000;
export const YEARS = { 2025: { label: "2025/26" }, 2026: { label: "2026/27" } };
export const TYPES = {
  employee: { label: "Employee (Class 1 NI)", main: 0.08, upper: 0.02 },
  selfemployed: { label: "Self-employed (Class 4 NI)", main: 0.06, upper: 0.02 },
};
export const METHODS = { ras: "Personal pension (relief at source)", sacrifice: "Salary sacrifice" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const income = num("income", "your yearly income (salary or taxable profit before any pension contribution)");
  const pension = num("pension", "your yearly pension contribution (zero if none)", true);
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const type = i.type || "employee";
  if (!TYPES[type]) errors.push("Pick employee or self-employed.");
  const method = i.method || "ras";
  if (!METHODS[method]) errors.push("Pick how the pension contribution is made.");
  if (!errors.length && pension > income) errors.push("The pension contribution cannot be more than your income.");
  return { errors, income, pension, year, type, method };
}

export const allowanceFor = (ani) => (ani <= TAPER_FROM ? PA : Math.max(0, PA - Math.floor((ani - TAPER_FROM) / 2)));

// Income tax on `income` when adjusted net income is `ani`; the basic-rate band (and the higher-rate limit) is widened by `ext`.
function incomeTax(income, ani, ext) {
  const allowance = allowanceFor(ani);
  const taxable = Math.max(0, income - allowance);
  const edges = [0, BASIC_BAND + ext, ADDITIONAL_FROM + ext, Infinity];
  const rates = [0.2, 0.4, 0.45];
  let tax = 0;
  for (let b = 0; b < 3; b++) { const lo = edges[b], hi = Math.min(taxable, edges[b + 1]); if (hi > lo) tax += (hi - lo) * rates[b]; }
  return { tax: r2(tax), allowance, taxable: r2(taxable) };
}

function ni(income, type) {
  const t = TYPES[type];
  const main = Math.max(0, Math.min(income, NI_UPPER) - NI_LOWER);
  const upper = Math.max(0, income - NI_UPPER);
  return r2(main * t.main + upper * t.upper);
}

// Everything for one position: gross income, pension contribution and method.
export function position(income, pension, method, type) {
  let earn = income, ext = 0, ani = income, cash = 0;
  if (pension > 0 && method === "sacrifice") { earn = income - pension; ani = earn; }
  else if (pension > 0) { ext = pension; ani = income - pension; cash = r2(pension * 0.8); }
  const it = incomeTax(earn, ani, ext);
  const n = ni(earn, type);
  return { income: earn, ani: r2(ani), allowance: it.allowance, taxable: it.taxable, incomeTax: it.tax, ni: n, pensionCash: cash, takeHome: r2(earn - it.tax - n - cash) };
}

// Share of the next `step` of pay that is lost to tax and NI at this position.
export function marginalRate(income, pension, method, type, step = 1000) {
  const a = position(income, pension, method, type), b = position(income + step, pension, method, type);
  return r2((1 - (b.takeHome - a.takeHome) / step) * 100) / 100;
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { income, pension, year, type, method } = p;
  const y = YEARS[year];
  const base = position(income, 0, method, type);
  const now = position(income, pension, method, type);
  const lostAllowance = r2(PA - base.allowance);
  const marginal = marginalRate(income, pension, method, type);
  const marginalNoPension = marginalRate(income, 0, method, type);

  const need = r2(Math.max(0, income - TAPER_FROM));
  let fix = null;
  if (need > 0) {
    const f = position(income, need, method, type);
    const cost = r2(base.takeHome - f.takeHome);
    fix = { gross: need, netCost: cost, costPerPound: r2(cost / need), saved: r2((base.incomeTax + base.ni) - (f.incomeTax + f.ni)), allowance: f.allowance, takeHome: f.takeHome, overAllowance: need > ANNUAL_ALLOWANCE };
  }
  const pensionCost = pension > 0 ? r2(base.takeHome - now.takeHome) : 0;

  // Marginal-rate ladder at fixed income points, no pension.
  const ladder = [60000, 90000, 100000, 110000, 120000, 125140, 130000].map((g) => ({ income: g, rate: marginalRate(g, 0, method, type) }));

  const findings = [];
  const obligations = [];
  if (income <= TAPER_FROM) {
    findings.push({ severity: "info", title: `At ${money(income)} you are below ${money(TAPER_FROM)}, so you keep the full ${money(PA)} personal allowance and are not in the 60% trap. Your marginal rate on the next ${money(1000)} is ${r2(marginal * 100)}%.` });
  } else if (income < ADDITIONAL_FROM) {
    findings.push({ severity: "high", title: `You are in the trap: ${money(lostAllowance)} of your ${money(PA)} personal allowance is withdrawn, and the next ${money(1000)} of income is taxed at ${r2(marginalNoPension * 100)}% once income tax${marginalNoPension > 0.6 ? " and NI" : ""} are counted (${r2(marginalNoPension * 100)}% is 40% tax plus 20% from losing allowance${marginalNoPension > 0.6 ? ", plus 2% NI" : ""}).` });
  } else {
    findings.push({ severity: "medium", title: `Above ${money(ADDITIONAL_FROM)} the personal allowance is gone altogether and the marginal rate drops back to ${r2(marginalNoPension * 100)}%. You lost ${money(PA)} of allowance, but a pension contribution of ${money(need)} would restore it.` });
  }
  if (fix) {
    findings.push({ severity: "high", title: `A gross pension contribution of ${money(fix.gross)} brings adjusted net income down to ${money(TAPER_FROM)} and restores the full allowance. It costs you about ${money(fix.netCost)} of take-home (${r2(fix.costPerPound * 100)}p per pound that goes into the pension) and saves ${money(fix.saved)} of tax and NI.` });
    if (fix.overAllowance) findings.push({ severity: "medium", title: `That contribution is over the ${money(ANNUAL_ALLOWANCE)} annual allowance for tax-relieved pension saving. Carry forward from the previous three years may cover it; confirm before paying in.` });
  }
  if (pension > 0) {
    findings.push({ severity: "info", title: `Your ${money(pension)} contribution (${METHODS[method].toLowerCase()}) costs ${money(pensionCost)} of take-home, ${r2((pensionCost / pension) * 100)}p per pound saved. Marginal rate on the next ${money(1000)} becomes ${r2(marginal * 100)}%.` });
    if (pension > ANNUAL_ALLOWANCE) findings.push({ severity: "medium", title: `${money(pension)} is over the ${money(ANNUAL_ALLOWANCE)} annual allowance; the excess may be taxed unless carry-forward applies.` });
  }
  if (income > TAPER_FROM && income < ADDITIONAL_FROM + 2000) findings.push({ severity: "medium", title: `Adjusted net income over ${money(TAPER_FROM)} also removes tax-free childcare and the 30 hours of free childcare in England if you rely on them, which can make the real cost of extra pay higher than 60%. Check eligibility on GOV.UK.` });
  if (income >= 60000 && income < 80000) findings.push({ severity: "info", title: "If you or a partner get Child Benefit, the High Income Child Benefit Charge (adjusted net income over GBP 60,000, ending at GBP 80,000) adds to the marginal rate here. It is not modelled; use the Child Benefit charge calculator." });
  findings.push({ severity: "info", title: "Not modelled: Scottish income tax bands, Class 2 NI, student loan repayments, savings and dividend income, Gift Aid (which also cuts adjusted net income), the annual-allowance taper for incomes over GBP 260,000 and anything that changed after this was written." });
  if (year === 2026) findings.push({ severity: "info", title: "2026/27 uses the same frozen thresholds as 2025/26. Confirm no change was made at the Budget." });

  if (pension > 0 || fix) {
    obligations.push(method === "sacrifice"
      ? { ref: "Employer", title: "Ask your employer for a salary sacrifice arrangement", why: "It must be agreed in writing before the pay is earned, and pay cannot fall below the National Minimum Wage. It saves NI as well as tax." }
      : { ref: "Claim", title: "Claim your higher-rate relief", why: "The provider adds 20% basic-rate relief at source. The rest comes back through your Self Assessment return or by asking HMRC to change your tax code; the restored allowance comes through the same claim." });
    obligations.push({ ref: "AA", title: "Stay inside the annual allowance", why: `Tax-relieved pension saving above ${money(ANNUAL_ALLOWANCE)} a year (including employer contributions) can create a tax charge unless carry-forward applies.` });
    obligations.push({ ref: "Access", title: "Remember the money is locked in", why: "Money paid into a pension normally cannot be taken out until the minimum pension age, and most withdrawals above the tax-free part are taxable." });
  }
  return { errors: [], label: y.label, year, type, method, income, pension, base, now, lostAllowance, marginal, marginalNoPension, fix, pensionCost, ladder, findings, obligations };
}

export const SAMPLE = { year: 2025, type: "employee", income: 110000, pension: 0, method: "ras" };

export function summaryText(r) {
  const L = [`UK 60% tax trap, ${r.label}`, "", `Income: ${money(r.income)} (${TYPES[r.type].label})`, `Pension contribution: ${money(r.pension)} (${METHODS[r.method]})`, `Personal allowance without a contribution: ${money(r.base.allowance)} (lost ${money(r.lostAllowance)})`, `Income tax: ${money(r.base.incomeTax)}`, `National Insurance: ${money(r.base.ni)}`, `Take-home before any contribution: ${money(r.base.takeHome)}`, `Marginal rate on the next GBP 1,000: ${r2(r.marginalNoPension * 100)}%`];
  if (r.pension > 0) L.push("", `With your contribution: allowance ${money(r.now.allowance)}, tax ${money(r.now.incomeTax)}, NI ${money(r.now.ni)}, take-home ${money(r.now.takeHome)} (cost ${money(r.pensionCost)})`);
  if (r.fix) L.push("", `To restore the allowance: ${money(r.fix.gross)} gross into the pension, net cost ${money(r.fix.netCost)} (${r2(r.fix.costPerPound * 100)}p per pound).`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
