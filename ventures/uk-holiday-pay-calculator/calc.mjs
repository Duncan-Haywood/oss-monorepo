// UK statutory holiday entitlement and holiday pay calculator (Great Britain).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: Working Time Regulations 1998 regs 13 and 13A (5.6 weeks a year, capped at 28 days),
// part-year starters and leavers pro rata by days employed in the leave year, and, for irregular-hours and part-year workers whose leave year starts on or after 1 April 2024,
// the 12.07% accrual method (holiday = 12.07% of hours worked; rolled-up holiday pay = 12.07% on top of pay, for those leave years).
// Holiday pay is one normal day's pay for each day taken; for irregular hours the "normal week" is the average over the last 52 paid weeks (you enter that average).
// NOT modelled: Northern Ireland, overtime and commission averaging, sick-leave and family-leave accrual, carry-over, contractual holiday above the statutory minimum other than the
// one total you can enter, and anything changed after this was written. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Holiday entitlement' (gov.uk/holiday-entitlement-rights) and 'Calculate holiday entitlement'; Working Time Regulations 1998 regs 13, 13A, 15A; Acas 'Holiday entitlement'";
export const WEEKS = 5.6;
export const MAX_DAYS = 28;
export const ACCRUAL = 0.1207;
export const MAX_HOURS_YEAR = 8784; // 366 days of 24 hours, an upper sanity bound

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const roundUpHalf = (n) => Math.ceil(r2(n) * 2 - 1e-9) / 2;

function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, t: dt.getTime() };
}
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const PATTERNS = { regular: "Regular days a week", irregular: "Irregular hours or part-year (12.07%)" };

export function parse(input) {
  const i = input || {};
  const errors = [];
  const pattern = i.pattern === undefined || i.pattern === "" ? "regular" : i.pattern;
  if (!PATTERNS[pattern]) errors.push("Pick how you work: regular days a week, or irregular hours.");
  const num = (key, label, { allowEmpty = false, min = 0, max = Infinity } = {}) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (allowEmpty) return null; errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`Enter ${label} as a number from ${min} to ${max === Infinity ? "any amount" : max}.`); return 0; }
    return n;
  };
  const out = { errors, pattern };
  const ys = dateParts(i.yearStart);
  if (!ys) errors.push("Enter the first day of your leave year as a date.");
  out.yearStart = ys;
  const join = i.join === undefined || i.join === "" ? null : dateParts(i.join);
  const leave = i.leave === undefined || i.leave === "" ? null : dateParts(i.leave);
  if (i.join && !join) errors.push("Enter the day you started as a date, or leave it empty if you started before this leave year.");
  if (i.leave && !leave) errors.push("Enter your last day as a date, or leave it empty if you are staying.");
  out.join = join; out.leave = leave;
  if (pattern === "regular") {
    out.daysPerWeek = num("daysPerWeek", "the days you work in a normal week", { min: 0.5, max: 7 });
    out.hoursPerDay = num("hoursPerDay", "your hours in a normal working day", { allowEmpty: true, min: 0, max: 24 }) || 0;
    out.weeklyPay = num("weeklyPay", "your gross pay for a normal week", { allowEmpty: true }) || 0;
    out.taken = num("taken", "the days of leave already taken (zero if none)", { allowEmpty: true }) || 0;
  } else if (pattern === "irregular") {
    out.hoursWorked = num("hoursWorked", "the hours you worked in the leave year (or expect to)", { max: MAX_HOURS_YEAR });
    out.hourlyRate = num("hourlyRate", "your hourly pay (zero to skip the money)", { allowEmpty: true }) || 0;
    out.takenHours = num("takenHours", "the hours of holiday already taken (zero if none)", { allowEmpty: true }) || 0;
  }
  out.bankHolidays = num("bankHolidays", "the bank holidays your employer counts as leave", { allowEmpty: true, max: 12 }) || 0;
  out.contractDays = num("contractDays", "your contract's holiday days a year", { allowEmpty: true, max: 366 });
  if (ys && join && join.t > Date.UTC(ys.y + 1, ys.mo - 1, ys.d) - DAY) errors.push("Your start date is after the end of this leave year.");
  if (join && leave && leave.t < join.t) errors.push("Your last day must not be before your start date.");
  if (ys && leave && leave.t < ys.t) errors.push("Your last day is before this leave year starts.");
  return out;
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { yearStart, join, leave } = p;
  const yearEndT = Date.UTC(yearStart.y + 1, yearStart.mo - 1, yearStart.d) - DAY;
  const yearDays = Math.round((yearEndT - yearStart.t) / DAY) + 1;
  const fromT = join && join.t > yearStart.t ? join.t : yearStart.t;
  const toT = leave && leave.t < yearEndT ? leave.t : yearEndT;
  const employed = Math.max(0, Math.round((toT - fromT) / DAY) + 1);
  const fraction = Math.min(1, employed / yearDays);
  const partYear = fraction < 1;
  const findings = [];
  const obligations = [];
  const res = { errors: [], pattern: p.pattern, yearStart: iso(yearStart.t), yearEnd: iso(yearEndT), yearDays, employedDays: employed, fraction, partYear };

  if (p.pattern === "regular") {
    const fullDays = Math.min(MAX_DAYS, r2(WEEKS * p.daysPerWeek));
    const capped = WEEKS * p.daysPerWeek > MAX_DAYS;
    const accrued = r2(fullDays * fraction);
    const entitled = roundUpHalf(accrued);
    const afterBank = r2(Math.max(0, entitled - p.bankHolidays));
    const remaining = r2(entitled - p.taken);
    const dailyPay = p.weeklyPay > 0 ? r2(p.weeklyPay / p.daysPerWeek) : 0;
    const value = r2(remaining * dailyPay);
    Object.assign(res, { fullDays, capped, accrued, entitled, afterBank, remaining, dailyPay, value, weeks: WEEKS, fullHours: p.hoursPerDay ? r2(fullDays * p.hoursPerDay) : 0, entitledHours: p.hoursPerDay ? r2(entitled * p.hoursPerDay) : 0, taken: p.taken, bankHolidays: p.bankHolidays });
    findings.push({ severity: "high", title: `Statutory holiday for a full leave year is ${fullDays} days: ${WEEKS} weeks x ${p.daysPerWeek} ${p.daysPerWeek === 1 ? "day" : "days"} a week${capped ? `, capped at the ${MAX_DAYS}-day maximum` : ""}.` });
    if (partYear) findings.push({ severity: "high", title: `You are employed ${employed} of ${yearDays} days in this leave year (${iso(fromT)} to ${iso(toT)}), so you accrue ${accrued} days, which rounds up to ${entitled}. Employers should not round down.` });
    if (p.contractDays !== null && p.contractDays > 0) {
      const contractShare = roundUpHalf(p.contractDays * fraction);
      res.contractShare = contractShare;
      if (contractShare < entitled) findings.push({ severity: "high", title: `Your contract gives ${contractShare} days for this period, below the statutory ${entitled}. The statutory minimum applies instead.` });
      else findings.push({ severity: "info", title: `Your contract gives ${contractShare} days for this period, at or above the statutory ${entitled}.` });
    }
    if (p.bankHolidays > 0) findings.push({ severity: "info", title: `If ${p.bankHolidays} bank holidays count towards your leave, you have ${afterBank} days left to choose.` });
    if (p.taken > entitled) findings.push({ severity: "medium", title: `You have taken ${r2(p.taken - entitled)} day(s) more than you have accrued. An employer can recover this from final pay only if your contract allows it.` });
    else if (p.taken > 0) findings.push({ severity: "info", title: `You have ${remaining} days of accrued holiday left.` });
    if (leave && remaining > 0) {
      findings.push({ severity: "high", title: p.weeklyPay > 0 ? `You are leaving with ${remaining} unused days. Your employer must pay for them: about ${money(value)} gross at ${money(dailyPay)} a day.` : `You are leaving with ${remaining} unused days, which your employer must pay for. Enter your weekly pay to see the amount.` });
      obligations.push({ ref: "Final pay", title: "Check the payslip", why: "Unused statutory holiday must be paid in the final pay. Ask for the calculation if the number differs from this result." });
    }
    if (p.weeklyPay > 0 && p.daysPerWeek > 0) findings.push({ severity: "info", title: `A day's holiday pay is ${money(dailyPay)} (weekly pay divided by days worked). If your pay varies, your employer should use your average pay instead.` });
  } else {
    const hoursYear = p.hoursWorked;
    const accruedHours = r2(hoursYear * ACCRUAL);
    const remaining = r2(accruedHours - p.takenHours);
    const holidayPay = r2(accruedHours * p.hourlyRate);
    const remainingPay = r2(remaining * p.hourlyRate);
    const uplift = r2(p.hoursWorked * p.hourlyRate * ACCRUAL);
    Object.assign(res, { hoursYear, accruedHours, remaining, holidayPay, remainingPay, uplift, hourlyRate: p.hourlyRate, takenHours: p.takenHours, accrual: ACCRUAL, bankHolidays: p.bankHolidays });
    findings.push({ severity: "high", title: `You accrue holiday at 12.07% of hours worked: ${hoursYear} hours worked gives ${accruedHours} hours of paid holiday.` });
    if (p.hourlyRate > 0) findings.push({ severity: "high", title: `That holiday is worth about ${money(holidayPay)} gross at ${money(p.hourlyRate)} an hour.` });
    if (p.takenHours > 0) findings.push({ severity: p.takenHours > accruedHours ? "medium" : "info", title: p.takenHours > accruedHours ? `You have taken ${r2(p.takenHours - accruedHours)} hours more than accrued so far.` : `You have ${remaining} hours of holiday left${p.hourlyRate > 0 ? `, worth about ${money(remainingPay)}` : ""}.` });
    findings.push({ severity: "medium", title: `If your employer uses rolled-up holiday pay, it is paid as 12.07% on top of each payslip (about ${money(uplift)} on these hours) and shown as a separate line. Check that the pay rate it is added to excludes the holiday element.` });
    if (leave && remaining > 0) {
      findings.push({ severity: "high", title: `You are leaving with ${remaining} unused hours, which your employer must pay for${p.hourlyRate > 0 ? ` (about ${money(remainingPay)} gross)` : ""}.` });
      obligations.push({ ref: "Final pay", title: "Check the payslip", why: "Unused statutory holiday must be paid in the final pay. Ask for the calculation if the number differs from this result." });
    }
    if (partYear) findings.push({ severity: "info", title: "Irregular-hours holiday is based on hours actually worked, so the part of the year you were employed does not need pro-rating here." });
  }
  findings.push({ severity: "info", title: "Not modelled: Northern Ireland, overtime and commission averaging, carry-over and carry-forward rules, holiday accrued during sick or family leave, and anything that changed after this was written." });
  obligations.push({ ref: "Ask", title: "Get your entitlement in writing", why: "Your employer must be able to tell you your entitlement and how it was worked out. A gap is usually rounding, a missed start date, or bank holidays counted twice." });
  obligations.push({ ref: "Help", title: "Contact Acas if it still differs", why: "Acas is free. A claim for unpaid holiday pay normally has to start within 3 months less a day of the underpayment (with early conciliation first)." });
  res.findings = findings;
  res.obligations = obligations;
  return res;
}

export const SAMPLE = { pattern: "regular", yearStart: "2026-01-01", join: "2026-04-14", leave: "", daysPerWeek: 5, hoursPerDay: 7.5, weeklyPay: 600, taken: 3, bankHolidays: 8, contractDays: 25, hoursWorked: 1000, hourlyRate: 12.5, takenHours: 0 };

export function summaryText(r) {
  const L = ["UK holiday entitlement and pay", "", `Leave year: ${r.yearStart} to ${r.yearEnd}`, `Days employed in the leave year: ${r.employedDays} of ${r.yearDays}`, ""];
  if (r.pattern === "regular") L.push(`Full-year statutory days: ${r.fullDays}`, `Accrued: ${r.accrued} days`, `Entitled (rounded up to half a day): ${r.entitled} days`, `Taken: ${r.taken}`, `Remaining: ${r.remaining}`, ...(r.dailyPay ? [`A day's holiday pay: ${money(r.dailyPay)}`, `Value of remaining days: ${money(r.value)}`] : []));
  else L.push(`Hours worked: ${r.hoursYear}`, `Holiday accrued at 12.07%: ${r.accruedHours} hours`, `Taken: ${r.takenHours} hours`, `Remaining: ${r.remaining} hours`, ...(r.hourlyRate ? [`Value of accrued holiday: ${money(r.holidayPay)}`, `Value of remaining holiday: ${money(r.remainingPay)}`] : []));
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax or legal advice. No warranty.");
  return L.join("\n");
}
