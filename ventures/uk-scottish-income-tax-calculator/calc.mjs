// Scottish income tax and take-home pay calculator, 2026/27 Scottish bands.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Scottish bands checked against gov.scot "Scottish Income Tax: rates and bands 2026 to 2027" in the building session (proposed in the January 2026 Scottish Budget):
// starter 19%, basic 20%, intermediate 21%, higher 42%, advanced 45%, top 48%. Band tops as income with a full personal allowance of GBP 12,570: 16,537 / 29,526 / 43,662 / 75,000 / 125,140.
// Applied here to taxable income (income less personal allowance), which is how the bands work when the allowance is tapered above GBP 100,000.
// Employee National Insurance is not devolved and is the same as the rest of the UK (8% between GBP 12,570 and GBP 50,270, 2% above); the student loan and postgraduate loan
// thresholds are the 2025/26 figures and move each April. Annual figures, standard tax code (S1257L), one job, whole year at this pay, no benefits, no other income.
// NOT modelled: Scottish bands for any other year, tax codes other than the standard one, second jobs, taxable benefits, Marriage Allowance, Gift Aid, childcare schemes, employer
// NI and employer pension. The rest-of-UK figure is shown for comparison only. Every result names its source to verify.

export const VERIFY = "gov.scot 'Scottish Income Tax: rates and bands' and GOV.UK 'Income Tax rates and Personal Allowances', 'Rates and thresholds for employers' (employee NI), 'Repaying your student loan'";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const ADDITIONAL_THRESHOLD = 125140;
// Band widths in taxable income (income above the personal allowance).
export const SCOT_BANDS = [
  { name: "Starter", rate: 0.19, upTo: 16537 - 12570 },
  { name: "Basic", rate: 0.2, upTo: 29526 - 12570 },
  { name: "Intermediate", rate: 0.21, upTo: 43662 - 12570 },
  { name: "Higher", rate: 0.42, upTo: 75000 - 12570 },
  { name: "Advanced", rate: 0.45, upTo: ADDITIONAL_THRESHOLD },
  { name: "Top", rate: 0.48, upTo: Infinity },
];
export const RUK_BANDS = [
  { name: "Basic", rate: 0.2, upTo: 37700 },
  { name: "Higher", rate: 0.4, upTo: ADDITIONAL_THRESHOLD },
  { name: "Additional", rate: 0.45, upTo: Infinity },
];
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

// Tax on taxable income through a band table; `extend` widens every finite band top (relief at source).
export function taxOn(taxable, bands, extend = 0) {
  let prev = 0, tax = 0;
  const parts = [];
  for (const b of bands) {
    const top = b.upTo === Infinity ? Infinity : b.upTo + extend;
    const amount = pos(Math.min(taxable, top) - prev);
    parts.push({ name: b.name, rate: b.rate, amount: r2(amount), tax: r2(amount * b.rate) });
    tax += amount * b.rate;
    prev = top;
  }
  return { tax: r2(tax), parts };
}

// Full-year deductions for one pay and pension arrangement. `region` is "scotland" or "ruk".
export function annual(salary, pensionPct, method, plan, pgl, region = "scotland") {
  const contrib = r2((salary * pensionPct) / 100);
  const sacrifice = method === "sacrifice" ? contrib : 0;
  const netpay = method === "netpay" ? contrib : 0;
  const ras = method === "ras" ? contrib : 0;
  const incomeForTax = salary - sacrifice - netpay;
  const adjustedNet = salary - sacrifice - netpay - ras;
  const allowance = pos(PERSONAL_ALLOWANCE - pos(adjustedNet - TAPER_START) / 2);
  const taxable = pos(incomeForTax - allowance);
  const { tax, parts } = taxOn(taxable, region === "scotland" ? SCOT_BANDS : RUK_BANDS, ras);
  const niPay = salary - sacrifice;
  const ni = r2(pos(Math.min(niPay, NI.upper) - NI.primary) * NI.main + pos(niPay - NI.upper) * NI.above);
  const sl = r2(pos(niPay - PLANS[plan].threshold) * PLANS[plan].rate);
  const pg = pgl ? r2(pos(niPay - PGL.threshold) * PGL.rate) : 0;
  const pensionFromPay = method === "ras" ? r2(contrib * 0.8) : method === "none" ? 0 : contrib;
  const takeHome = r2(salary - tax - ni - sl - pg - pensionFromPay);
  return { contrib, pensionFromPay, tax, ni, sl, pg, takeHome, allowance, taxable, parts };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { salary, pensionPct, method, plan, pgl } = p;
  const a = annual(salary, pensionPct, method, plan, pgl);
  const ruk = annual(salary, pensionPct, method, plan, pgl, "ruk");
  const base = annual(salary, 0, "none", plan, pgl);
  const raised = annual(salary + 1000, 0, "none", plan, pgl);
  const marginal = r2((1 - (raised.takeHome - base.takeHome) / 1000) * 100);
  const deductions = r2(a.tax + a.ni + a.sl + a.pg);
  const effective = r2((deductions / salary) * 100);
  const taxDiff = r2(a.tax - ruk.tax); // positive = Scotland costs more
  const bands = a.parts.filter((x) => x.amount > 0);
  const findings = [];
  const obligations = [];

  findings.push({ severity: "info", title: `On a gross salary of ${money(salary)} in Scotland you take home ${money(a.takeHome)} a year, ${money(a.takeHome / 12)} a month. Income tax ${money(a.tax)}, National Insurance ${money(a.ni)}${a.sl ? `, student loan ${money(a.sl)}` : ""}${a.pg ? `, postgraduate loan ${money(a.pg)}` : ""}. Total deducted from pay: ${effective}% of gross.` });
  if (taxDiff > 0) findings.push({ severity: "medium", title: `The same salary in England, Wales or Northern Ireland would pay ${money(taxDiff)} a year less income tax (${money(ruk.tax)} against ${money(a.tax)}). Scotland taxes higher earners more.` });
  else if (taxDiff < 0) findings.push({ severity: "info", title: `The same salary in England, Wales or Northern Ireland would pay ${money(-taxDiff)} a year more income tax (${money(ruk.tax)} against ${money(a.tax)}). Scotland's lower starter, basic and intermediate rates favour middle and lower earners.` });
  else findings.push({ severity: "info", title: "At this income Scottish and rest-of-UK income tax come to the same amount." });
  const adj = method === "none" ? salary : salary - a.contrib;
  if (adj > TAPER_START && adj <= ADDITIONAL_THRESHOLD) findings.push({ severity: "high", title: `Your adjusted net income is between ${money(TAPER_START)} and ${money(ADDITIONAL_THRESHOLD)}, where the personal allowance is withdrawn. In Scotland that makes the real tax rate on each extra pound 67.5% (the 45% advanced rate plus the lost allowance), before National Insurance and loans. Your personal allowance is down to ${money(a.allowance)}.` });
  if (salary > ADDITIONAL_THRESHOLD) findings.push({ severity: "info", title: `Income above ${money(ADDITIONAL_THRESHOLD)} is taxed at the 48% top rate in Scotland, against 45% elsewhere in the UK, and you have no personal allowance.` });
  if (marginal >= 60) findings.push({ severity: "high", title: `If you earned GBP 1,000 more you would keep about ${money(1000 - marginal * 10)}: a marginal rate of ${marginal}%.` });
  else findings.push({ severity: "info", title: `If you earned GBP 1,000 more you would keep about ${money(1000 - marginal * 10)}: a marginal rate of ${marginal}% including National Insurance and any loan.` });
  if (plan !== "none" && a.sl > 0) findings.push({ severity: "info", title: `${PLANS[plan].label} takes ${PLANS[plan].rate * 100}% of pay over ${money(PLANS[plan].threshold)} (2025/26 threshold; it changes each April). It is collected through payroll but is a loan repayment, and the balance is written off at the end of its term.` });
  if (method === "sacrifice") findings.push({ severity: "medium", title: "Salary sacrifice cuts your contractual pay. That saves tax and National Insurance, but it can lower mortgage affordability figures and statutory pay, and your employer must keep you above the National Minimum Wage. A cap on the NI saving has been announced for later years; check the current rules." });
  if (method === "ras") findings.push({ severity: "medium", title: "With relief at source your pension provider claims 20% basic rate relief. In Scotland that is the relief rate even though your starter and basic bands are 19% and 20%; any extra relief at 21% or more is claimed through Self Assessment, so cash arrives later." });
  if (method === "netpay") findings.push({ severity: "info", title: "A net pay arrangement takes the contribution before tax but after National Insurance, so you get income tax relief at your top Scottish rate but no NI saving." });
  findings.push({ severity: "info", title: "Not modelled: other tax years, tax codes other than the standard one, second jobs, taxable benefits, Marriage Allowance, Gift Aid, childcare schemes, and anything announced after this was written." });

  obligations.push({ ref: "Residency", title: "Confirm you are a Scottish taxpayer", why: "HMRC decides this from where you live (your main place of residence), not where you work. Check the S in your tax code (S1257L). If it is missing, query it with HMRC." });
  obligations.push({ ref: "Payslip", title: "Check your tax code and payslip", why: "A different code changes every number here. Query a wrong code with HMRC." });
  obligations.push({ ref: "Pension", title: "Confirm the pension tax method with your employer", why: "Employers use one of three methods and it changes how much you keep. Ask payroll which one your scheme uses before comparing the figures above." });
  obligations.push({ ref: "Verify", title: "Verify the bands", why: `Scottish bands are set each year by the Scottish Parliament. Confirm them at ${VERIFY.split(" and ")[0]}.` });
  return { errors: [], salary, pensionPct, method, methodLabel: METHODS[method], plan, planLabel: PLANS[plan].label, pgl, ...a, effective, marginal, taxDiff, rukTax: ruk.tax, rukTakeHome: ruk.takeHome, bands, monthly: r2(a.takeHome / 12), weekly: r2(a.takeHome / 52), findings, obligations };
}

export const SAMPLE = { salary: 45000, pensionPct: 5, method: "sacrifice", plan: "4", pgl: "no" };

export function summaryText(r) {
  const L = ["Scottish income tax and take-home pay (2026/27 Scottish bands)", "", `Gross salary: ${money(r.salary)}`, `Pension: ${r.pensionPct}% by ${r.methodLabel}`, `Student loan: ${r.planLabel}${r.pgl ? " plus Postgraduate Loan" : ""}`, "",
    ...r.bands.map((b) => `${b.name} rate ${b.rate * 100}% on ${money(b.amount)}: ${money(b.tax)}`),
    `Income tax: ${money(r.tax)}`, `National Insurance: ${money(r.ni)}`, `Student loan: ${money(r.sl)}`, `Postgraduate loan: ${money(r.pg)}`, `Pension paid from your pay: ${money(r.pensionFromPay)}`, "",
    `Take-home pay per year: ${money(r.takeHome)}`, `Per month: ${money(r.monthly)}`, `Per week: ${money(r.weekly)}`, `Marginal rate on the next pound: ${r.marginal}%`,
    `Same salary in the rest of the UK: income tax ${money(r.rukTax)}, take-home ${money(r.rukTakeHome)}`];
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
