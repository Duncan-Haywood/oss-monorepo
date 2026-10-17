// UK umbrella company take-home calculator for agency contractors in England, Wales and Northern Ireland, 2026/27 rates (income tax and employee NI thresholds frozen; employer NI 15% over GBP 5,000).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: the agency pays the umbrella a day rate; the umbrella keeps a weekly margin, then pays employer
// National Insurance (15% above a GBP 5,000 a year secondary threshold), the 0.5% Apprenticeship Levy and an optional employer pension, and pays you the rest as employment income
// (which includes 12.07% holiday pay). Income tax (personal allowance GBP 12,570 tapered over GBP 100,000; 20%, 40%, 45%), employee Class 1 NI (8% to GBP 50,270, 2% above) and student
// loan are then taken from that gross pay on an annual basis. NOT modelled: Scotland, tax codes other than the standard one, pay-period (weekly) NI and cumulative tax timing,
// the employer NI threshold being applied per pay period (so a part-year contractor's threshold is slightly smaller than modelled), expenses or other deductions, enrolment fees,
// the employment allowance, Postgraduate Loan, employee pension contributions, benefits. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Rates and thresholds for employers 2026 to 2027' (employer NI, Apprenticeship Levy), 'Income Tax rates and Personal Allowances', 'Repaying your student loan' and 'Umbrella companies' guidance";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_THRESHOLD = 125140;
export const RATES = { basic: 0.2, higher: 0.4, additional: 0.45 };
export const NI = { primary: 12570, upper: 50270, main: 0.08, above: 0.02 };
export const EMPLOYER_NI = { threshold: 5000, rate: 0.15 };
export const LEVY_RATE = 0.005;
export const HOLIDAY_UPLIFT = 0.1207;
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
  const blank = (v) => v === undefined || v === null || v === "";
  const dayRate = Number(i.dayRate);
  if (blank(i.dayRate) || !Number.isFinite(dayRate) || dayRate <= 0) errors.push("Enter the day rate your agency pays the umbrella as more than zero.");
  else if (dayRate > 5000) errors.push("A day rate above GBP 5,000 looks like a typo.");
  const daysPerWeek = blank(i.daysPerWeek) ? 5 : Number(i.daysPerWeek);
  if (!Number.isFinite(daysPerWeek) || daysPerWeek <= 0 || daysPerWeek > 7) errors.push("Enter days worked per week between 0.5 and 7.");
  const weeks = blank(i.weeks) ? 46 : Number(i.weeks);
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) errors.push("Enter weeks worked per year between 1 and 52.");
  const margin = blank(i.margin) ? 25 : Number(i.margin);
  if (!Number.isFinite(margin) || margin < 0 || margin > 500) errors.push("Enter the umbrella's weekly margin between 0 and 500 pounds.");
  const employerPension = blank(i.employerPension) ? 3 : Number(i.employerPension);
  if (!Number.isFinite(employerPension) || employerPension < 0 || employerPension > 30) errors.push("Enter the employer pension as a percentage between 0 and 30.");
  const plan = String(i.plan || "none");
  if (!PLANS[plan]) errors.push("Pick a student loan plan, or none.");
  const target = blank(i.target) ? null : Number(i.target);
  if (target !== null && (!Number.isFinite(target) || target <= 0)) errors.push("Enter a target annual take-home as more than zero, or leave it blank.");
  return { errors, dayRate, daysPerWeek, weeks, margin, employerPension, plan, target };
}

// Employee deductions on an annual gross pay.
export function employee(gross, plan) {
  const allowance = pos(PERSONAL_ALLOWANCE - pos(gross - TAPER_START) / 2);
  const taxable = pos(gross - allowance);
  const basicPart = Math.min(taxable, BASIC_BAND);
  const higherPart = pos(Math.min(taxable, ADDITIONAL_THRESHOLD) - BASIC_BAND);
  const addPart = pos(taxable - ADDITIONAL_THRESHOLD);
  const tax = r2(basicPart * RATES.basic + higherPart * RATES.higher + addPart * RATES.additional);
  const ni = r2(pos(Math.min(gross, NI.upper) - NI.primary) * NI.main + pos(gross - NI.upper) * NI.above);
  const sl = r2(pos(gross - PLANS[plan].threshold) * PLANS[plan].rate);
  return { tax, ni, sl, takeHome: r2(gross - tax - ni - sl), allowance };
}

// What the umbrella can pay out as gross, given the annual money it receives after its margin.
export function grossFromAvailable(available, employerPensionPct) {
  const p = employerPensionPct / 100;
  const flat = available / (1 + LEVY_RATE + p);
  if (flat <= EMPLOYER_NI.threshold) return flat;
  return (available + EMPLOYER_NI.rate * EMPLOYER_NI.threshold) / (1 + LEVY_RATE + p + EMPLOYER_NI.rate);
}

export function run(dayRate, daysPerWeek, weeks, margin, employerPension, plan) {
  const invoice = r2(dayRate * daysPerWeek * weeks);
  const marginYear = r2(Math.min(margin * weeks, invoice));
  const available = invoice - marginYear;
  const gross = r2(grossFromAvailable(available, employerPension));
  const employerNi = r2(pos(gross - EMPLOYER_NI.threshold) * EMPLOYER_NI.rate);
  const levy = r2(gross * LEVY_RATE);
  const pension = r2((gross * employerPension) / 100);
  const e = employee(gross, plan);
  const holiday = r2(gross - gross / (1 + HOLIDAY_UPLIFT));
  return { invoice, marginYear, available, gross, employerNi, levy, pension, holiday, ...e };
}

// Day rate that produces a target annual take-home, by bisection.
export function dayRateFor(target, daysPerWeek, weeks, margin, employerPension, plan) {
  let lo = 1, hi = 20000;
  for (let n = 0; n < 80; n++) {
    const mid = (lo + hi) / 2;
    if (run(mid, daysPerWeek, weeks, margin, employerPension, plan).takeHome < target) lo = mid; else hi = mid;
  }
  return r2((lo + hi) / 2);
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { dayRate, daysPerWeek, weeks, margin, employerPension, plan, target } = p;
  const a = run(dayRate, daysPerWeek, weeks, margin, employerPension, plan);
  const noMargin = run(dayRate, daysPerWeek, weeks, 0, employerPension, plan);
  const plus10 = run(dayRate, daysPerWeek, weeks, margin + 10, employerPension, plan);
  const daysWorked = daysPerWeek * weeks;
  const share = r2((a.takeHome / a.invoice) * 100);
  const perDay = r2(a.takeHome / daysWorked);
  const marginCost = r2(noMargin.takeHome - a.takeHome);
  const tenCost = r2(a.takeHome - plus10.takeHome);
  const neededRate = target ? dayRateFor(target, daysPerWeek, weeks, margin, employerPension, plan) : null;
  const findings = [];
  const obligations = [];

  findings.push({ severity: "info", title: `Your agency pays ${money(a.invoice)} a year to the umbrella (${money(dayRate)} a day over ${daysWorked} days). You take home ${money(a.takeHome)}: ${share}% of it, ${money(perDay)} per day worked, ${money(a.takeHome / 12)} a month averaged over the year.` });
  findings.push({ severity: "info", title: `Of the ${money(a.invoice)}: umbrella margin ${money(a.marginYear)}, employer National Insurance ${money(a.employerNi)}, Apprenticeship Levy ${money(a.levy)}${a.pension ? `, employer pension ${money(a.pension)} (paid into your pension, not lost)` : ""}. What is left is your gross pay of ${money(a.gross)}, of which ${money(a.holiday)} is holiday pay.` });
  findings.push({ severity: "info", title: `Employer National Insurance is the biggest deduction most contractors do not see. It is 15% of gross pay over GBP 5,000, and it comes out of your day rate before your pay is worked out, not out of your payslip.` });
  if (margin > 0) findings.push({ severity: marginCost > 1500 ? "medium" : "info", title: `The umbrella margin of ${money(margin)} a week costs you about ${money(marginCost)} a year of take-home pay after tax and NI on the extra money. Each extra GBP 10 a week of margin costs about ${money(tenCost)} a year. Compare umbrellas on what the weekly margin covers.` });
  if (a.gross > TAPER_START && a.gross <= ADDITIONAL_THRESHOLD) findings.push({ severity: "high", title: `Your gross pay of ${money(a.gross)} is in the band from ${money(TAPER_START)} to ${money(ADDITIONAL_THRESHOLD)} where the personal allowance is withdrawn: an effective 60% tax rate on that slice. Ask whether a limited company or an employer pension contribution suits you better.` });
  if (a.gross > 50270 && p.employerPension === 0) findings.push({ severity: "medium", title: "You pay 40% tax on pay above GBP 50,270 and have no employer pension. An umbrella can usually take a pension contribution from your gross pay, which saves tax and employer NI; ask whether it is salary sacrifice." });
  if (a.sl) findings.push({ severity: "info", title: `${PLANS[plan].label} takes ${money(a.sl)} a year of pay over ${money(PLANS[plan].threshold)}. It is collected through the umbrella's payroll.` });
  if (neededRate) findings.push({ severity: "info", title: `To take home ${money(target)} a year on these assumptions you need an agency day rate of about ${money(neededRate)}. That is ${money(neededRate - dayRate)} ${neededRate >= dayRate ? "more" : "less"} than the ${money(dayRate)} entered.` });
  findings.push({ severity: "info", title: "Since 6 April 2026 the recruitment agency, not the umbrella alone, can be made liable for unpaid PAYE where an umbrella fails to pay HMRC, and agencies must check umbrellas more closely. It is a reason to use an umbrella your agency recommends and to check you receive a payslip and an HMRC record." });
  findings.push({ severity: "info", title: "Not modelled: Scottish income tax, tax codes other than the standard one, weekly NI and tax timing, expenses claims, enrolment fees, Postgraduate Loan and anything announced after this was written." });

  obligations.push({ ref: "Payslip", title: "Ask for a written breakdown of the day rate", why: "A compliant umbrella gives you a payslip showing gross pay, holiday pay, employer NI, levy, margin and each deduction. If you cannot reconcile it to your agency day rate, ask in writing." });
  obligations.push({ ref: "Margin", title: "Get the weekly margin and any extra fees in writing", why: "Compare margin, enrolment or exit fees, insurance charges and how holiday pay is paid. Fees outside the weekly margin reduce what you keep." });
  obligations.push({ ref: "Verify", title: "Check your umbrella with HMRC", why: "Use the GOV.UK guidance on checking an umbrella company, and confirm your pay appears in your HMRC online account. Confirm the thresholds at GOV.UK." });
  if (a.gross > 40000) obligations.push({ ref: "Compare", title: "Compare with a limited company", why: "At this level of pay a personal service company may keep more of the day rate, but IR35 and accountancy costs apply. Use the sole trader vs limited company and IR35 calculators." });
  return { errors: [], dayRate, daysPerWeek, weeks, margin, employerPension, plan, planLabel: PLANS[plan].label, target, neededRate, daysWorked, ...a, share, perDay, marginCost, tenCost, monthly: r2(a.takeHome / 12), weekly: r2(a.takeHome / weeks), findings, obligations };
}

export const SAMPLE = { dayRate: 400, daysPerWeek: 5, weeks: 46, margin: 25, employerPension: 3, plan: "none", target: "" };

export function summaryText(r) {
  const L = ["UK umbrella company take-home (England, Wales and Northern Ireland, 2026/27 rates)", "", `Agency day rate: ${money(r.dayRate)} x ${r.daysPerWeek} days x ${r.weeks} weeks = ${money(r.invoice)}`, `Umbrella margin: ${money(r.margin)} a week`, `Employer pension: ${r.employerPension}% of gross`, `Student loan: ${r.planLabel}`, "",
    `Umbrella margin: ${money(r.marginYear)}`, `Employer National Insurance: ${money(r.employerNi)}`, `Apprenticeship Levy: ${money(r.levy)}`, `Employer pension: ${money(r.pension)}`, `Gross pay (incl. holiday pay ${money(r.holiday)}): ${money(r.gross)}`, "",
    `Income tax: ${money(r.tax)}`, `National Insurance: ${money(r.ni)}`, `Student loan: ${money(r.sl)}`, "",
    `Take-home pay per year: ${money(r.takeHome)} (${r.share}% of the agency's payment)`, `Per month: ${money(r.monthly)}`, `Per week worked: ${money(r.weekly)}`, `Per day worked: ${money(r.perDay)}`];
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
