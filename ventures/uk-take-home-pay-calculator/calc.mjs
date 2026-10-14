// UK take-home pay calculator for employees in England, Wales and Northern Ireland, 2025/26 rates (frozen thresholds, so also the 2026/27 figures at the time of writing).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: income tax (personal allowance GBP 12,570 tapered by GBP 1 per GBP 2 of adjusted net income over
// GBP 100,000; 20% basic to GBP 37,700 of taxable income; 40% higher; 45% above GBP 125,140), employee Class 1 National Insurance (8% between GBP 12,570 and GBP 50,270, 2% above),
// student loan and postgraduate loan deductions, and a pension contribution taken by salary sacrifice, a net pay arrangement or relief at source. Annual figures, assuming
// a standard tax code (1257L), one job, the whole year at this pay, no benefits in kind, no other income. NOT modelled: Scotland (different income tax bands), Class 1 NI on
// a monthly rather than annual basis, tax codes other than the standard one, second jobs, taxable benefits, Marriage Allowance, Blind Person's Allowance, Gift Aid, childcare
// schemes, employer NI and employer pension. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Rates and thresholds for employers 2025 to 2026' (employee NI), 'Repaying your student loan' and 'Tax on your private pension contributions'";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_THRESHOLD = 125140;
export const RATES = { basic: 0.2, higher: 0.4, additional: 0.45 };
export const NI = { primary: 12570, upper: 50270, main: 0.08, above: 0.02 };
export const PLANS = {
  none: { label: "No student loan", threshold: 0, rate: 0 },
  1: { label: "Plan 1", threshold: 26065, rate: 0.09 },
  2: { label: "Plan 2", threshold: 28470, rate: 0.09 },
  4: { label: "Plan 4 (Scotland)", threshold: 32745, rate: 0.09 },
  5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
};
export const PGL = { threshold: 21000, rate: 0.06 };
export const METHODS = { none: "No pension contribution", sacrifice: "Salary sacrifice", netpay: "Net pay arrangement", ras: "Relief at source" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const pos = (n) => (n > 0 ? n : 0);

export function parse(input) {
  const i = input || {};
  const errors = [];
  const salary = Number(i.salary);
  if (i.salary === undefined || i.salary === null || i.salary === "" || !Number.isFinite(salary) || salary <= 0) errors.push("Enter your annual gross salary as more than zero.");
  else if (salary > 10000000) errors.push("A salary above GBP 10,000,000 looks like a typo.");
  const pensionPct = i.pensionPct === undefined || i.pensionPct === null || i.pensionPct === "" ? 0 : Number(i.pensionPct);
  if (!Number.isFinite(pensionPct) || pensionPct < 0 || pensionPct > 100) errors.push("Enter your pension contribution as a percentage between 0 and 100.");
  const method = String(i.method || "none");
  if (!METHODS[method]) errors.push("Pick how the pension is paid, or none.");
  const plan = String(i.plan || "none");
  if (!PLANS[plan]) errors.push("Pick a student loan plan, or none.");
  const pgl = i.pgl === true || i.pgl === "yes" || i.pgl === "true";
  return { errors, salary, pensionPct, method, plan, pgl };
}

// Full-year deductions for one pay and pension arrangement.
export function annual(salary, pensionPct, method, plan, pgl) {
  const contrib = r2((salary * pensionPct) / 100);
  const sacrifice = method === "sacrifice" ? contrib : 0;
  const netpay = method === "netpay" ? contrib : 0;
  const ras = method === "ras" ? contrib : 0;
  const incomeForTax = salary - sacrifice - netpay;
  const adjustedNet = salary - sacrifice - netpay - ras;
  const allowance = pos(PERSONAL_ALLOWANCE - pos(adjustedNet - TAPER_START) / 2);
  const taxable = pos(incomeForTax - allowance);
  const basicTop = BASIC_BAND + ras;
  const addTop = ADDITIONAL_THRESHOLD + ras;
  const basicPart = Math.min(taxable, basicTop);
  const higherPart = pos(Math.min(taxable, addTop) - basicTop);
  const addPart = pos(taxable - addTop);
  const tax = r2(basicPart * RATES.basic + higherPart * RATES.higher + addPart * RATES.additional);
  const niPay = salary - sacrifice;
  const ni = r2(pos(Math.min(niPay, NI.upper) - NI.primary) * NI.main + pos(niPay - NI.upper) * NI.above);
  const slPay = salary - sacrifice;
  const sl = r2(pos(slPay - PLANS[plan].threshold) * PLANS[plan].rate);
  const pg = pgl ? r2(pos(slPay - PGL.threshold) * PGL.rate) : 0;
  const pensionFromPay = method === "ras" ? r2(contrib * 0.8) : method === "none" ? 0 : contrib;
  const takeHome = r2(salary - tax - ni - sl - pg - pensionFromPay);
  return { contrib, pensionFromPay, tax, ni, sl, pg, takeHome, allowance, taxable, higherPart, addPart };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { salary, pensionPct, method, plan, pgl } = p;
  const a = annual(salary, pensionPct, method, plan, pgl);
  const base = annual(salary, 0, "none", plan, pgl);
  const raised = annual(salary + 1000, 0, "none", plan, pgl);
  const marginal = r2((1 - (raised.takeHome - base.takeHome) / 1000) * 100);
  const deductions = r2(a.tax + a.ni + a.sl + a.pg);
  const effective = r2((deductions / salary) * 100);
  const compare = pensionPct > 0 ? ["sacrifice", "netpay", "ras"].map((m) => {
    const x = annual(salary, pensionPct, m, plan, pgl);
    return { method: m, label: METHODS[m], takeHome: x.takeHome, costToYou: r2(base.takeHome - x.takeHome), intoPension: x.contrib };
  }) : [];
  const findings = [];
  const obligations = [];

  findings.push({ severity: "info", title: `On a gross salary of ${money(salary)} you take home ${money(a.takeHome)} a year, ${money(a.takeHome / 12)} a month. Income tax ${money(a.tax)}, National Insurance ${money(a.ni)}${a.sl ? `, student loan ${money(a.sl)}` : ""}${a.pg ? `, postgraduate loan ${money(a.pg)}` : ""}. Total deducted from pay: ${effective}% of gross.` });
  const adj = salary - a.contrib;
  if (adj > TAPER_START && adj <= ADDITIONAL_THRESHOLD) findings.push({ severity: "high", title: `Your adjusted net income of ${money(adj)} is in the band from ${money(TAPER_START)} to ${money(ADDITIONAL_THRESHOLD)} where the personal allowance is withdrawn. Your personal allowance is down to ${money(a.allowance)}, and the real tax rate on each extra pound is 60% (before NI and loans). A pension contribution is the standard way to claw it back.` });
  if (salary > ADDITIONAL_THRESHOLD && method !== "ras") findings.push({ severity: "info", title: `Income above ${money(ADDITIONAL_THRESHOLD)} is taxed at 45% and you have no personal allowance.` });
  if (a.higherPart > 0 && method === "none") findings.push({ severity: "medium", title: `Part of your pay is taxed at 40%. A pension contribution comes off that slice first, so each GBP 100 you add costs less than GBP 100 of take-home pay. Try the pension box to see by how much.` });
  if (marginal >= 60) findings.push({ severity: "high", title: `If you earned GBP 1,000 more you would keep about ${money(1000 - marginal * 10)}: a marginal rate of ${marginal}%.` });
  else findings.push({ severity: "info", title: `If you earned GBP 1,000 more you would keep about ${money(1000 - marginal * 10)}: a marginal rate of ${marginal}% including National Insurance and any loan.` });
  if (plan !== "none" && a.sl > 0) findings.push({ severity: "info", title: `${PLANS[plan].label} takes ${PLANS[plan].rate * 100}% of pay over ${money(PLANS[plan].threshold)}. It is collected through payroll like a tax but is a loan repayment, and the balance is written off at the end of its term.` });
  if (method === "sacrifice") findings.push({ severity: "medium", title: "Salary sacrifice cuts your contractual pay. That saves both tax and National Insurance, but it can lower mortgage affordability figures and statutory pay, and your employer must keep you above the National Minimum Wage. A cap on the NI saving has been announced for later years; check the current rules." });
  if (method === "ras") findings.push({ severity: "medium", title: "With relief at source your pension provider claims 20% basic rate relief. Any higher or additional rate relief is given by extending your bands in this estimate, but in real life you claim it through Self Assessment or a tax code change, so cash arrives later." });
  if (method === "netpay") findings.push({ severity: "info", title: "A net pay arrangement takes the contribution before tax but after National Insurance, so you get income tax relief at your top rate but no NI saving. If your pay is low enough that you pay no tax, you get no relief at all." });
  findings.push({ severity: "info", title: "Not modelled: Scottish income tax bands, tax codes other than the standard one, second jobs, taxable benefits, Marriage Allowance, Gift Aid, childcare vouchers and anything announced after this was written." });

  obligations.push({ ref: "Payslip", title: "Check your tax code and payslip", why: "Your payslip should show tax code 1257L for a standard employee. A different code changes every number here. Query a wrong code with HMRC." });
  obligations.push({ ref: "Pension", title: "Confirm the pension tax method with your employer", why: "Employers use one of three methods and it changes how much you keep. Ask payroll which one your scheme uses before comparing the figures above." });
  if (marginal >= 60) obligations.push({ ref: "Allowance", title: "Consider a pension contribution to restore the allowance", why: "Contributing to a pension lowers adjusted net income and can bring it below the point where the personal allowance starts to be lost." });
  obligations.push({ ref: "Verify", title: "Verify the thresholds", why: `Thresholds change at each Budget. Confirm them at ${VERIFY.split(",")[0].replace("GOV.UK ", "")} on GOV.UK.` });
  return { errors: [], salary, pensionPct, method, methodLabel: METHODS[method], plan, planLabel: PLANS[plan].label, pgl, ...a, effective, marginal, monthly: r2(a.takeHome / 12), weekly: r2(a.takeHome / 52), daily: r2(a.takeHome / 260), compare, findings, obligations };
}

export const SAMPLE = { salary: 45000, pensionPct: 5, method: "sacrifice", plan: "2", pgl: "no" };

export function summaryText(r) {
  const L = ["UK take-home pay (England, Wales and Northern Ireland, 2025/26 rates)", "", `Gross salary: ${money(r.salary)}`, `Pension: ${r.pensionPct}% by ${r.methodLabel}`, `Student loan: ${r.planLabel}${r.pgl ? " plus Postgraduate Loan" : ""}`, "",
    `Income tax: ${money(r.tax)}`, `National Insurance: ${money(r.ni)}`, `Student loan: ${money(r.sl)}`, `Postgraduate loan: ${money(r.pg)}`, `Pension paid from your pay: ${money(r.pensionFromPay)}`, "",
    `Take-home pay per year: ${money(r.takeHome)}`, `Per month: ${money(r.monthly)}`, `Per week: ${money(r.weekly)}`, `Marginal rate on the next pound: ${r.marginal}%`];
  if (r.compare.length) { L.push("", "Same pension percentage by method (cost to you in take-home):"); for (const c of r.compare) L.push(`  ${c.label}: costs you ${money(c.costToYou)}, puts ${money(c.intoPension)} in the pension`); }
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
