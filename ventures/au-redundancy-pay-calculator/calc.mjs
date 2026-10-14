// Australian redundancy pay under the National Employment Standards (Fair Work
// Act 2009 ss119-123). Written from memory, no live lookup:
//  - Entitled: employees dismissed for redundancy with at least 1 year of
//    continuous service. Not entitled: casuals, fixed-term/task employees,
//    apprentices/trainees, and employees of a "small business" (fewer than 15
//    employees, counting associated entities and regular casuals) at the time
//    of notice.
//  - Weeks of base pay by completed years: 1:4, 2:6, 3:7, 4:8, 5:10, 6:11,
//    7:13, 8:14, 9:16, 10+:12 (the 10+ step is lower than 9 on purpose).
//  - Minimum notice: <1y 1wk, 1-<3y 2wk, 3-<5y 3wk, 5y+ 4wk, +1wk if the
//    employee is 45+ and has at least 2 completed years. Unworked notice is
//    paid out at the full rate of pay.
//  - Accrued annual leave is paid out on termination.
// Dates are calendar days (UTC), never timestamps.

export const WEEKS_BY_YEAR = { 1: 4, 2: 6, 3: 7, 4: 8, 5: 10, 6: 11, 7: 13, 8: 14, 9: 16 };
export const WEEKS_10_PLUS = 12;
export const SMALL_BUSINESS_LIMIT = 15;
export const VERIFY = "Verify the entitlement on the Fair Work Ombudsman site (fairwork.gov.au) or the applicable award or agreement before you pay or sign anything.";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 86400000;
export function toDay(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / DAY;
}
const money = (n) => "A$" + (Math.round(n * 100) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Completed years between two day numbers (anniversary-based).
export function completedYears(start, end) {
  const a = new Date(start * DAY), b = new Date(end * DAY);
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  const before = b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (before) y--;
  return y;
}
export const redundancyWeeks = (years) => (years < 1 ? 0 : years >= 10 ? WEEKS_10_PLUS : WEEKS_BY_YEAR[years]);
export function noticeWeeks(years, age) {
  const base = years < 1 ? 1 : years < 3 ? 2 : years < 5 ? 3 : 4;
  return base + (age >= 45 && years >= 2 ? 1 : 0);
}

export const SAMPLE = {
  weeklyPay: "1850",
  daysPerWeek: "5",
  startDate: "2017-03-06",
  endDate: "2026-10-30",
  age: "47",
  employees: "62",
  employmentType: "permanent",
  noticeWorkedWeeks: "0",
  leaveDays: "12",
};

export function compute(input) {
  const errors = [];
  const num = (v) => Number(String(v ?? "").replace(/[A$,\s]/g, ""));
  const weekly = num(input.weeklyPay);
  if (String(input.weeklyPay ?? "").trim() === "" || !(weekly > 0)) errors.push("Enter weekly base pay (before tax) as a number, for example 1850.");
  const dpw = num(input.daysPerWeek || 5);
  if (!(dpw >= 1 && dpw <= 7)) errors.push("Days worked per week must be between 1 and 7.");
  const start = toDay(input.startDate), end = toDay(input.endDate);
  if (start === null) errors.push("Enter the start date as YYYY-MM-DD.");
  if (end === null) errors.push("Enter the last day of employment as YYYY-MM-DD.");
  if (start !== null && end !== null && end < start) errors.push("The last day is before the start date.");
  const age = num(input.age || 0);
  const employees = num(input.employees || 0);
  if (!(employees >= 1)) errors.push("Enter the number of employees the employer has (1 or more).");
  const type = String(input.employmentType || "permanent");
  const worked = Math.max(0, num(input.noticeWorkedWeeks || 0) || 0);
  const leaveDays = Math.max(0, num(input.leaveDays || 0) || 0);
  if (errors.length) return { errors };

  const years = completedYears(start, end);
  const findings = [];
  const smallBusiness = employees < SMALL_BUSINESS_LIMIT;
  const excluded = type !== "permanent";
  let weeks = redundancyWeeks(years);
  let redundancy = weeks * weekly;
  let reason = null;
  if (excluded) reason = `Employment type "${type}" is excluded from NES redundancy pay (casuals, fixed-term/task employees, apprentices and trainees).`;
  else if (years < 1) reason = "Under 1 year of continuous service: no NES redundancy pay.";
  else if (smallBusiness) reason = `Employer has ${employees} employee(s), fewer than ${SMALL_BUSINESS_LIMIT}: the small business exemption means no NES redundancy pay (an award, agreement or contract may still provide it).`;
  if (reason) { redundancy = 0; weeks = 0; findings.push({ severity: "high", title: reason }); }
  else findings.push({ severity: "info", title: `${years} completed year(s) of service = ${weeks} weeks of base pay.` });
  if (!reason && years >= 9 && years < 10) findings.push({ severity: "medium", title: "At 9 years the entitlement is 16 weeks, but it drops to 12 weeks from 10 years. Check the date of termination against the anniversary." });

  const nWeeks = noticeWeeks(years, age);
  const unworked = Math.max(0, nWeeks - worked);
  const noticePay = unworked * weekly;
  findings.push({ severity: "info", title: `Minimum notice is ${nWeeks} week(s)${age >= 45 && years >= 2 ? " (includes 1 extra week for age 45+ with 2+ years)" : ""}; ${unworked} unworked week(s) are paid out.` });
  const leavePay = leaveDays * (weekly / dpw);
  if (leaveDays) findings.push({ severity: "info", title: `${leaveDays} day(s) of accrued annual leave paid at ${money(weekly / dpw)} a day.` });
  const total = redundancy + noticePay + leavePay;
  findings.push({ severity: "info", title: "Not included: long service leave, any award/agreement/contract top-up, leave loading, tax treatment of the genuine redundancy payment (ATO tax-free limit)." });
  return { errors, years, weeks, redundancy, noticeWeeks: nWeeks, unworked, noticePay, leavePay, total, findings, weekly, start, end, smallBusiness, excluded };
}

export function summaryText(r) {
  const lines = ["Australian redundancy pay check (NES)", ""];
  lines.push(`Service: ${r.years} completed year(s), weekly base pay ${money(r.weekly)}`);
  lines.push(`Redundancy pay: ${r.weeks} week(s) = ${money(r.redundancy)}`);
  lines.push(`Notice: ${r.noticeWeeks} week(s) required, ${r.unworked} unworked = ${money(r.noticePay)}`);
  lines.push(`Accrued annual leave: ${money(r.leavePay)}`);
  lines.push(`Total (before tax): ${money(r.total)}`, "");
  for (const f of r.findings) lines.push(`- [${f.severity}] ${f.title}`);
  lines.push("", VERIFY, "Not legal or employment advice. No warranty.");
  return lines.join("\n");
}
