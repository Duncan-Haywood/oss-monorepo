// UK salary sacrifice calculator, 2026/27 rates. Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Compares the same pension contribution paid four ways: salary sacrifice, net pay arrangement, relief at source, and (as the baseline) no pension.
// Rates checked against GOV.UK in the building session: income tax England/Wales/NI 20% / 40% / 45% with a GBP 12,570 allowance, basic band GBP 37,700, additional rate above GBP 125,140
// and the allowance withdrawn GBP 1 for every GBP 2 over GBP 100,000; Scottish bands as gov.scot 2026/27 (19/20/21/42/45/48); employee NI 8% between GBP 12,570 and GBP 50,270 and 2% above;
// employer NI 15% above a GBP 5,000 secondary threshold. The Autumn Budget 2025 announced that from April 2029 only the first GBP 2,000 a year of salary-sacrificed pension
// contributions stays free of National Insurance; the 2029 toggle models that announcement, which is not yet in force. Student loan thresholds are the 2025/26 figures and move each April.
// Annual figures, standard tax code, one job, whole year at this pay, no benefits, no other income.
// NOT modelled: other tax years, tax codes other than the standard one, second jobs, the pension annual allowance and carry forward, the lifetime allowance regime, minimum wage checks,
// tapering of employer contributions, Marriage Allowance, Gift Aid, childcare schemes and anything announced after this was written. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Rates and thresholds for employers', 'Repaying your student loan', HMRC 'Salary sacrifice for employers' and the Autumn Budget 2025 policy paper on pension salary sacrifice; gov.scot 'Scottish Income Tax' for Scottish taxpayers";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const ADDITIONAL_THRESHOLD = 125140;
export const SACRIFICE_NI_CAP_2029 = 2000;
export const EMPLOYER_NI = { threshold: 5000, rate: 0.15 };
export const NI = { primary: 12570, upper: 50270, main: 0.08, above: 0.02 };
export const BANDS = {
  england: [
    { name: "Basic", rate: 0.2, upTo: 37700 },
    { name: "Higher", rate: 0.4, upTo: ADDITIONAL_THRESHOLD },
    { name: "Additional", rate: 0.45, upTo: Infinity },
  ],
  scotland: [
    { name: "Starter", rate: 0.19, upTo: 16537 - 12570 },
    { name: "Basic", rate: 0.2, upTo: 29526 - 12570 },
    { name: "Intermediate", rate: 0.21, upTo: 43662 - 12570 },
    { name: "Higher", rate: 0.42, upTo: 75000 - 12570 },
    { name: "Advanced", rate: 0.45, upTo: ADDITIONAL_THRESHOLD },
    { name: "Top", rate: 0.48, upTo: Infinity },
  ],
};
export const REGIONS = { england: "England, Wales or Northern Ireland", scotland: "Scotland" };
export const PLANS = {
  none: { label: "No student loan", threshold: 0, rate: 0 },
  1: { label: "Plan 1", threshold: 26065, rate: 0.09 },
  2: { label: "Plan 2", threshold: 28470, rate: 0.09 },
  4: { label: "Plan 4 (Scotland)", threshold: 32745, rate: 0.09 },
  5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
};
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
  if (!Number.isFinite(pensionPct) || pensionPct <= 0 || pensionPct > 100) errors.push("Enter the pension contribution as a percentage of salary above 0 and up to 100.");
  const region = String(i.region || "england");
  if (!REGIONS[region]) errors.push("Pick where you pay income tax.");
  const plan = String(i.plan || "none");
  if (!PLANS[plan]) errors.push("Pick a student loan plan, or none.");
  const pgl = i.pgl === true || i.pgl === "yes" || i.pgl === "true";
  const share = i.employerShare === undefined || i.employerShare === null || i.employerShare === "" ? 0 : Number(i.employerShare);
  if (!Number.isFinite(share) || share < 0 || share > 100) errors.push("Enter the share of the employer's NI saving that your employer adds to your pension as a percentage from 0 to 100.");
  const cap2029 = i.cap2029 === true || i.cap2029 === "yes" || i.cap2029 === "true";
  return { errors, salary, pensionPct, region, plan, pgl, share, cap2029 };
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

// Full-year position for one pension arrangement. `contrib` is the gross employee contribution.
export function annual(o) {
  const { salary, contrib, method, region, plan, pgl, cap2029, share } = o;
  const c = method === "none" ? 0 : contrib;
  const sacrifice = method === "sacrifice" ? c : 0;
  const netpay = method === "netpay" ? c : 0;
  const ras = method === "ras" ? c : 0;
  const incomeForTax = salary - sacrifice - netpay;
  const adjustedNet = salary - sacrifice - netpay - ras;
  const allowance = pos(PERSONAL_ALLOWANCE - pos(adjustedNet - TAPER_START) / 2);
  const taxable = pos(incomeForTax - allowance);
  const { tax, parts } = taxOn(taxable, BANDS[region], ras);
  // From April 2029 sacrificed pay above the cap is treated as pay for National Insurance.
  const niExempt = method === "sacrifice" ? (cap2029 ? Math.min(sacrifice, SACRIFICE_NI_CAP_2029) : sacrifice) : 0;
  const niPay = salary - niExempt;
  const ni = r2(pos(Math.min(niPay, NI.upper) - NI.primary) * NI.main + pos(niPay - NI.upper) * NI.above);
  const slPay = salary - sacrifice; // student loan is worked on pay after sacrifice but not after net pay or RAS
  const sl = r2(pos(slPay - PLANS[plan].threshold) * PLANS[plan].rate);
  const pg = pgl ? r2(pos(slPay - 21000) * 0.06) : 0;
  const fromPay = method === "ras" ? r2(c * 0.8) : method === "none" ? 0 : c;
  const takeHome = r2(salary - tax - ni - sl - pg - fromPay);
  const employerNi = r2(pos(salary - niExempt - EMPLOYER_NI.threshold) * EMPLOYER_NI.rate);
  const employerSaving = method === "sacrifice" ? r2(niExempt * EMPLOYER_NI.rate) : 0;
  const employerAdds = r2(employerSaving * (share / 100));
  const intoPension = r2(c + employerAdds);
  return { contrib: c, fromPay, tax, ni, sl, pg, takeHome, allowance, taxable, parts, employerNi, employerSaving, employerAdds, intoPension, niExempt };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { salary, pensionPct, region, plan, pgl, share, cap2029 } = p;
  const contrib = r2((salary * pensionPct) / 100);
  const base = { salary, contrib, region, plan, pgl, cap2029, share };
  const none = annual({ ...base, method: "none" });
  const methods = ["sacrifice", "netpay", "ras"];
  const compare = methods.map((m) => {
    const a = annual({ ...base, method: m });
    const costToYou = r2(none.takeHome - a.takeHome);
    return { method: m, label: METHODS[m], ...a, costToYou, perPound: a.intoPension > 0 ? r2(costToYou / a.intoPension) : 0, taxSaved: r2(none.tax - a.tax), niSaved: r2(none.ni - a.ni), loanSaved: r2(none.sl + none.pg - a.sl - a.pg) };
  });
  const sac = compare[0], net = compare[1], ras = compare[2];
  const bestEmployee = [...compare].sort((a, b) => a.perPound - b.perPound)[0];
  const sacVsNet = r2(net.costToYou - sac.costToYou);
  const bonus = r2(salary + 1000);
  const upNone = annual({ ...base, salary: bonus, contrib: 0, method: "none" });
  const marginal = r2((1 - (upNone.takeHome - none.takeHome) / 1000) * 100);
  const capHit = cap2029 ? null : annual({ ...base, cap2029: true, method: "sacrifice" });
  const capCost = capHit ? r2(capHit.ni - sac.ni) : 0;
  const findings = [];
  const obligations = [];

  findings.push({ severity: "info", title: `Putting ${pensionPct}% of ${money(salary)} (${money(contrib)} a year) into your pension by salary sacrifice costs you ${money(sac.costToYou)} in lost take-home pay, which is ${money(sac.perPound * 100)} of take-home for every GBP 100 that reaches the pension${share > 0 ? " counting your employer's added share" : ""}.` });
  findings.push({ severity: "info", title: `Same contribution by net pay arrangement costs ${money(net.costToYou)}; by relief at source ${money(ras.costToYou)}${region === "scotland" ? " (before any extra relief claimed later through Self Assessment)" : " (before any higher-rate relief claimed later through Self Assessment)"}. Salary sacrifice beats net pay by ${money(sacVsNet)} a year here because it also removes ${money(sac.niSaved)} of employee National Insurance${sac.loanSaved > 0 ? ` and ${money(sac.loanSaved)} of student loan` : ""}.` });
  if (sac.employerSaving > 0) findings.push({ severity: "medium", title: `Your employer saves ${money(sac.employerSaving)} a year of employer National Insurance (15%) on the sacrificed pay. Whether any of it reaches your pension is your employer's choice; ask. At ${share}% shared, ${money(sac.employerAdds)} is added.` });
  if (!cap2029 && capCost > 0) findings.push({ severity: "high", title: `From April 2029 only the first ${money(SACRIFICE_NI_CAP_2029)} a year of sacrificed pay stays free of National Insurance (announced in the Autumn Budget 2025, not yet in force). On these figures that would add ${money(capCost)} a year to your employee NI. Switch on the 2029 rule below to see the full picture.` });
  if (cap2029 && contrib > SACRIFICE_NI_CAP_2029) findings.push({ severity: "medium", title: `The 2029 cap is on: ${money(contrib - SACRIFICE_NI_CAP_2029)} of your ${money(contrib)} sacrifice is treated as pay for National Insurance, so only ${money(SACRIFICE_NI_CAP_2029)} keeps the NI saving. Income tax relief is unchanged.` });
  const adj = salary - contrib;
  if (salary > TAPER_START && salary <= ADDITIONAL_THRESHOLD) findings.push({ severity: "high", title: `Your pay is in the band where the personal allowance is withdrawn (${money(TAPER_START)} to ${money(ADDITIONAL_THRESHOLD)}). Pension contributions count against adjusted net income, so they can win back allowance: after this contribution your adjusted net income is ${money(adj)} and your allowance is ${money(sac.allowance)} (it was ${money(none.allowance)} without it). Effective relief on contributions in this band is far above the headline rate.` });
  if (salary - contrib < PERSONAL_ALLOWANCE) findings.push({ severity: "medium", title: "After the sacrifice your pay falls below the personal allowance, so part of the contribution saves no income tax. Check this is what you want." });
  findings.push({ severity: "medium", title: "Salary sacrifice cuts your contractual pay. That can lower mortgage affordability, life-cover multiples, and statutory pay such as maternity and sick pay, which are worked out on the reduced figure. Your employer must keep you at or above the National Minimum Wage after the sacrifice." });
  findings.push({ severity: "info", title: `Your marginal rate on the next GBP 1,000 of pay is ${marginal}% including National Insurance and any loan. Compare that with the relief you get on the pension.` });
  findings.push({ severity: "info", title: "Not modelled: other tax years, tax codes other than the standard one, second jobs, the pension annual allowance and carry forward, taxable benefits, and anything announced after this was written." });
  obligations.push({ ref: "Scheme", title: "Check your employer offers salary sacrifice", why: "Not every scheme does. It is an employment-contract change, so you agree it in writing and it applies from a set date, not backwards." });
  obligations.push({ ref: "Method", title: "Find out which pension tax method you are on", why: "Net pay and relief at source look alike on a payslip but pay out differently, especially for low earners and in Scotland. Ask payroll or your provider." });
  obligations.push({ ref: "Allowance", title: "Check the annual allowance", why: "Employer plus employee contributions count towards the pension annual allowance (GBP 60,000 for most people, lower for very high earners). This tool does not check it; the UK pension annual allowance calculator does." });
  obligations.push({ ref: "Verify", title: "Verify the rates", why: `Confirm every rate and the 2029 rule at ${VERIFY}. Rules change; this tool does not.` });
  return { errors: [], salary, pensionPct, contrib, region, regionLabel: REGIONS[region], plan, planLabel: PLANS[plan].label, pgl, share, cap2029, none, compare, bestEmployee: bestEmployee.method, sacVsNet, marginal, capCost, findings, obligations };
}

export const SAMPLE = { salary: 55000, pensionPct: 8, region: "england", plan: "2", pgl: "no", employerShare: 0, cap2029: "no" };

export function summaryText(r) {
  const L = ["UK salary sacrifice comparison (2026/27 rates)", "", `Gross salary: ${money(r.salary)} (${r.regionLabel})`, `Pension contribution: ${r.pensionPct}% = ${money(r.contrib)} a year`, `Student loan: ${r.planLabel}${r.pgl ? " plus Postgraduate Loan" : ""}`, `Employer shares ${r.share}% of its NI saving; 2029 NI cap on sacrifice: ${r.cap2029 ? "on" : "off"}`, "",
    `Take-home with no pension: ${money(r.none.takeHome)}`];
  for (const c of r.compare) L.push("", `${c.label}:`, `  take-home ${money(c.takeHome)}, cost to you ${money(c.costToYou)}, into pension ${money(c.intoPension)}`, `  income tax ${money(c.tax)}, employee NI ${money(c.ni)}, loans ${money(c.sl + c.pg)}`);
  L.push("", `Salary sacrifice beats net pay by ${money(r.sacVsNet)} a year.`, `Marginal rate on the next GBP 1,000: ${r.marginal}%`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
