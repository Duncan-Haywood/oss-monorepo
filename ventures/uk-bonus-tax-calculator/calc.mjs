// UK bonus tax calculator, 2026/27 rates. Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Shows what a bonus is really worth after income tax, National Insurance, student loan, the personal allowance taper and the High Income Child Benefit Charge,
// paid in cash against paid (partly or wholly) into a pension by salary sacrifice.
// Rates checked against GOV.UK in the building session: income tax England/Wales/NI 20% / 40% / 45% with a GBP 12,570 allowance, basic band GBP 37,700, additional rate above GBP 125,140
// and the allowance withdrawn GBP 1 for every GBP 2 over GBP 100,000; Scottish bands as gov.scot 2026/27 (19/20/21/42/45/48); employee NI 8% between GBP 12,570 and GBP 50,270 and 2% above;
// employer NI 15% above a GBP 5,000 secondary threshold; High Income Child Benefit Charge 1% of the benefit per GBP 200 of adjusted net income between GBP 60,000 and GBP 80,000.
// Student loan thresholds are the 2025/26 figures and move each April. The bonus is taxed as ordinary pay in the year it is paid; employers withhold at the marginal rate through PAYE, and any difference is settled by the tax code or Self Assessment.
// NOT modelled: other tax years, tax codes other than the standard one, a second job, benefits in kind, pension annual allowance and carry forward, the April 2029 NI cap on salary sacrifice,
// bonuses taxed in a different year from when they are earned, clawback, and anything announced after this was written. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Tax on your bonus' guidance, 'National Insurance rates and categories', 'Repaying your student loan', 'High Income Child Benefit Charge'; gov.scot 'Scottish Income Tax' for Scottish taxpayers";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const ADDITIONAL_THRESHOLD = 125140;
export const HICBC = { start: 60000, end: 80000 };
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

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const pos = (n) => (n > 0 ? n : 0);

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
  const salary = num(i.salary);
  if (!Number.isFinite(salary) || salary <= 0) errors.push("Enter your annual gross salary, before the bonus, as more than zero.");
  else if (salary > 10000000) errors.push("A salary above GBP 10,000,000 looks like a typo.");
  const bonus = num(i.bonus);
  if (!Number.isFinite(bonus) || bonus <= 0) errors.push("Enter the gross bonus as more than zero.");
  else if (bonus > 10000000) errors.push("A bonus above GBP 10,000,000 looks like a typo.");
  const pensionPct = i.pensionPct === undefined || i.pensionPct === null || i.pensionPct === "" ? 0 : Number(i.pensionPct);
  if (!Number.isFinite(pensionPct) || pensionPct < 0 || pensionPct > 100) errors.push("Enter the share of the bonus to sacrifice into your pension as a percentage from 0 to 100.");
  const region = String(i.region || "england");
  if (!REGIONS[region]) errors.push("Pick where you pay income tax.");
  const plan = String(i.plan || "none");
  if (!PLANS[plan]) errors.push("Pick a student loan plan, or none.");
  const pgl = i.pgl === true || i.pgl === "yes" || i.pgl === "true";
  const childBenefit = i.childBenefit === undefined || i.childBenefit === null || i.childBenefit === "" ? 0 : Number(i.childBenefit);
  if (!Number.isFinite(childBenefit) || childBenefit < 0 || childBenefit > 20000) errors.push("Enter the Child Benefit you receive in a year (GBP 0 if none, up to GBP 20,000).");
  return { errors, salary, bonus, pensionPct, region, plan, pgl, childBenefit };
}

// Tax on taxable income through a band table.
export function taxOn(taxable, bands) {
  let prev = 0, tax = 0;
  for (const b of bands) {
    tax += pos(Math.min(taxable, b.upTo) - prev) * b.rate;
    prev = b.upTo;
  }
  return r2(tax);
}

// Full-year position for gross pay `pay` of which `sacrifice` is given up for pension by salary sacrifice.
export function position({ pay, sacrifice = 0, region, plan, pgl, childBenefit }) {
  const net = pay - sacrifice; // adjusted net income, as nothing else changes it here
  const allowance = pos(PERSONAL_ALLOWANCE - pos(net - TAPER_START) / 2);
  const tax = taxOn(pos(net - allowance), BANDS[region]);
  const ni = r2(pos(Math.min(net, NI.upper) - NI.primary) * NI.main + pos(net - NI.upper) * NI.above);
  const sl = r2(pos(net - PLANS[plan].threshold) * PLANS[plan].rate);
  const pg = pgl ? r2(pos(net - 21000) * 0.06) : 0;
  const hicbcPct = childBenefit > 0 ? Math.min(100, Math.floor(pos(net - HICBC.start) / 200)) : 0;
  const hicbc = r2((childBenefit * hicbcPct) / 100);
  const takeHome = r2(net - tax - ni - sl - pg - hicbc);
  return { net, allowance, tax, ni, sl, pg, hicbc, hicbcPct, takeHome, employerNi: r2(pos(net - EMPLOYER_NI.threshold) * EMPLOYER_NI.rate) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { salary, bonus, pensionPct, region, plan, pgl, childBenefit } = p;
  const base = { region, plan, pgl, childBenefit };
  const before = position({ ...base, pay: salary });
  const cash = position({ ...base, pay: salary + bonus });
  const sacAmount = r2((bonus * pensionPct) / 100);
  const mixed = position({ ...base, pay: salary + bonus, sacrifice: sacAmount });
  const view = (after, sac) => {
    const kept = r2(after.takeHome - before.takeHome);
    const lost = r2(bonus - sac - kept);
    return { sac, kept, inHand: kept, intoPension: sac, taken: lost, tax: r2(after.tax - before.tax), ni: r2(after.ni - before.ni), loans: r2(after.sl + after.pg - before.sl - before.pg), hicbc: r2(after.hicbc - before.hicbc), takeHome: after.takeHome, allowance: after.allowance };
  };
  const cashV = view(cash, 0);
  const mixedV = view(mixed, sacAmount);
  // Sweep: how much each share of the bonus put into a pension costs in take-home pay and what it buys.
  const sweep = [0, 25, 50, 75, 100].map((pct) => {
    const s = r2((bonus * pct) / 100);
    const v = view(position({ ...base, pay: salary + bonus, sacrifice: s }), s);
    return { pct, ...v, takeHomeGiven: r2(cashV.kept - v.kept) };
  });
  // Amounts that bring adjusted net income to the two cliffs.
  const total = salary + bonus;
  const toTaper = total > TAPER_START ? r2(Math.min(bonus, total - TAPER_START)) : 0;
  const toHicbc = childBenefit > 0 && total > HICBC.start ? r2(Math.min(bonus, total - HICBC.start)) : 0;
  const atTaper = toTaper > 0 ? position({ ...base, pay: total, sacrifice: toTaper }) : null;
  const afterHicbc = toHicbc > 0 ? position({ ...base, pay: total, sacrifice: toHicbc }).hicbc : cash.hicbc;
  const hicbcCut = r2(cash.hicbc - afterHicbc);
  const marginalCash = r2((1 - (cash.takeHome - position({ ...base, pay: salary + bonus - 1000 }).takeHome) / 1000) * 100);
  const findings = [];
  const obligations = [];
  findings.push({ severity: "info", title: `Of a ${money(bonus)} gross bonus on a ${money(salary)} salary you keep ${money(cashV.kept)} paid in cash. That is ${r2(100 - (cashV.taken / bonus) * 100)}% of it: ${money(cashV.tax)} goes in income tax, ${money(cashV.ni)} in National Insurance${cashV.loans > 0 ? `, ${money(cashV.loans)} in student loan` : ""}${cashV.hicbc > 0 ? ` and ${money(cashV.hicbc)} in extra Child Benefit charge` : ""}.` });
  if (marginalCash >= 60) findings.push({ severity: "high", title: `The last GBP 1,000 of this bonus is hit at an effective ${marginalCash}%. Part of your bonus lands in a band where the personal allowance is withdrawn or Child Benefit is clawed back, so the usual 40% understates what you lose.` });
  if (total > TAPER_START && salary < TAPER_START) findings.push({ severity: "high", title: `The bonus takes your income from ${money(salary)} to ${money(total)}, over the ${money(TAPER_START)} point where the personal allowance is withdrawn at GBP 1 for every GBP 2. Your allowance falls from ${money(before.allowance)} to ${money(cash.allowance)}.` });
  if (toTaper > 0) findings.push({ severity: "high", title: `Sacrificing ${money(toTaper)} of the bonus into your pension brings adjusted net income back to ${money(Math.max(TAPER_START, total - toTaper))}${total - toTaper <= TAPER_START ? ", restoring your full personal allowance" : ""}. Your take-home from the bonus would be ${money(atTaper.takeHome - before.takeHome)} against ${money(cashV.kept)} in cash, with ${money(toTaper)} extra in your pension.` });
  if (childBenefit > 0 && total > HICBC.start) findings.push({ severity: "high", title: `Child Benefit of ${money(childBenefit)} a year: with this bonus your adjusted net income is ${money(total)}, so ${cash.hicbcPct}% of it (${money(cash.hicbc)}) must be paid back through the High Income Child Benefit Charge${hicbcCut > 0 ? `. Sacrificing ${money(toHicbc)} of the bonus would cut the charge to ${money(afterHicbc)}` : ""}.` });
  if (pensionPct > 0) findings.push({ severity: "info", title: `Sending ${pensionPct}% of the bonus (${money(sacAmount)}) to your pension by salary sacrifice leaves ${money(mixedV.kept)} in hand, ${money(cashV.kept - mixedV.kept)} less than all in cash, for ${money(sacAmount)} in the pension. Each GBP 1 in the pension costs ${sacAmount > 0 ? money(r2((cashV.kept - mixedV.kept) / sacAmount)) : "GBP 0"} of take-home.` });
  findings.push({ severity: "medium", title: "Employers usually withhold tax on a bonus at your highest rate through PAYE, which can look worse (or better) than the true annual figure. This tool shows the annual result; any over- or under-payment is settled through your tax code or Self Assessment. A bonus is taxed in the year it is paid." });
  findings.push({ severity: "medium", title: "Salary sacrifice needs your employer's agreement and must normally be arranged before the bonus is awarded. It cuts contractual pay, which can affect mortgage affordability and statutory pay." });
  findings.push({ severity: "info", title: "Not modelled: other tax years, tax codes other than the standard one, second jobs, benefits in kind, the pension annual allowance and carry forward, the April 2029 NI cap on salary sacrifice, and anything announced after this was written." });
  obligations.push({ ref: "Timing", title: "Ask when the bonus is paid and how it can be sacrificed", why: "Pension sacrifice usually has to be agreed before the bonus is awarded, and your employer can refuse it. Ask HR or payroll early." });
  obligations.push({ ref: "Allowance", title: "Check the pension annual allowance", why: "Employee plus employer contributions count toward the annual allowance (GBP 60,000 for most people, lower for very high earners). This tool does not check it; the UK pension annual allowance calculator does." });
  if (childBenefit > 0) obligations.push({ ref: "Child Benefit", title: "Report the High Income Child Benefit Charge", why: "If adjusted net income passes GBP 60,000 you must register for Self Assessment and report the charge, or stop the benefit. Do not ignore it." });
  obligations.push({ ref: "Verify", title: "Verify the rates", why: `Confirm every rate and threshold at ${VERIFY}. Rules change; this tool does not.` });
  return { errors: [], salary, bonus, pensionPct, sacAmount, region, regionLabel: REGIONS[region], plan, planLabel: PLANS[plan].label, pgl, childBenefit, before, cash, cashV, mixedV, sweep, toTaper, toHicbc, marginalCash, findings, obligations };
}

export const SAMPLE = { salary: 85000, bonus: 20000, pensionPct: 50, region: "england", plan: "2", pgl: "no", childBenefit: 1355 };

export function summaryText(r) {
  const L = ["UK bonus tax calculation (2026/27 rates)", "", `Salary: ${money(r.salary)} (${r.regionLabel}); gross bonus: ${money(r.bonus)}`, `Student loan: ${r.planLabel}${r.pgl ? " plus Postgraduate Loan" : ""}; Child Benefit received: ${money(r.childBenefit)} a year`, "",
    `Bonus paid in cash: you keep ${money(r.cashV.kept)}`, `  income tax ${money(r.cashV.tax)}, employee NI ${money(r.cashV.ni)}, loans ${money(r.cashV.loans)}, Child Benefit charge ${money(r.cashV.hicbc)}`, `  marginal rate on the last GBP 1,000: ${r.marginalCash}%`, "",
    `${r.pensionPct}% of the bonus (${money(r.sacAmount)}) sacrificed to pension: you keep ${money(r.mixedV.kept)} in hand plus ${money(r.sacAmount)} in the pension`, "", "Share to pension | in hand | into pension | take-home given up", ...r.sweep.map((s) => `${s.pct}% | ${money(s.kept)} | ${money(s.sac)} | ${money(s.takeHomeGiven)}`), "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty."];
  return L.join("\n");
}
