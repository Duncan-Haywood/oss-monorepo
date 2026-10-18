// UK Statutory Sick Pay (SSP). Rules written from memory, no live lookup:
//  - Before 6 April 2026: flat weekly rate (GBP 118.75 for 2025/26), payable
//    only if average weekly earnings are at least the lower earnings limit
//    (GBP 125), and not for the first 3 qualifying days of a period of
//    incapacity for work (PIW).
//  - From 6 April 2026 (Employment Rights Act): payable from day one, no lower
//    earnings limit, at the LOWER of the flat rate (GBP 123.25 for 2026/27)
//    and 80% of average weekly earnings.
//  - A PIW is 4 or more consecutive calendar days of sickness. SSP is paid
//    for qualifying days only, daily rate = weekly rate / qualifying days a
//    week, for up to 28 weeks per entitlement.
// Dates are calendar days (UTC), never timestamps.

export const OLD_RATE = 118.75;
export const NEW_RATE = 123.25;
export const LEL = 125;
export const CHANGE_DAY = Date.UTC(2026, 3, 6) / 86400000;
export const RATE_YEAR_END = Date.UTC(2027, 3, 6) / 86400000;
export const MAX_WEEKS = 28;
export const WAITING_DAYS = 3;
export const VERIFY = "Verify the rate and rules on GOV.UK (Statutory Sick Pay) or with the HMRC Employers' Helpline before you pay.";

const DAY = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAMES = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

export function toDay(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / DAY;
}
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
// ISO weekday: 1 = Monday ... 7 = Sunday.
const weekday = (n) => ((new Date(n * DAY).getUTCDay() + 6) % 7) + 1;
const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2);

export function parseDays(text) {
  const out = new Set();
  const tokens = String(text || "").toLowerCase().match(/[a-z]+/g) || [];
  for (const t of tokens) {
    const k = NAMES[t.slice(0, 3)];
    if (!k) return null;
    out.add(k);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

export const SAMPLE = {
  weeklyEarnings: "310",
  qualifyingDays: "Mon Tue Wed Thu Fri",
  startDate: "2026-05-04",
  endDate: "2026-05-22",
  waitingServed: "0",
};

export function compute(input) {
  const errors = [];
  const earnings = Number(String(input.weeklyEarnings ?? "").replace(/[£,\s]/g, ""));
  if (!(earnings >= 0) || String(input.weeklyEarnings ?? "").trim() === "") errors.push("Enter average weekly earnings as a number (for example 310).");
  const qdays = parseDays(input.qualifyingDays);
  if (!qdays) errors.push("List the qualifying days, for example: Mon Tue Wed Thu Fri.");
  const start = toDay(input.startDate), end = toDay(input.endDate);
  if (start === null) errors.push("Enter the first day of sickness as YYYY-MM-DD.");
  if (end === null) errors.push("Enter the last day of sickness as YYYY-MM-DD.");
  if (start !== null && end !== null && end < start) errors.push("The last day of sickness is before the first day.");
  if (start !== null && end !== null && end - start > 400) errors.push("Spell longer than 400 days; split it or check the dates.");
  const served = Math.min(WAITING_DAYS, Math.max(0, Math.floor(Number(input.waitingServed || 0)) || 0));
  if (errors.length) return { errors };

  const calendarDays = end - start + 1;
  const isPiw = calendarDays >= 4;
  const cap = MAX_WEEKS * qdays.length;
  const findings = [];
  const rows = [];
  let paidDays = 0, waiting = 0, total = 0, qualifying = 0, ineligible = 0;
  let waitLeft = start < CHANGE_DAY ? WAITING_DAYS - served : 0;
  let beyondRates = false;

  if (!isPiw) {
    findings.push({ severity: "info", title: `Sickness of ${calendarDays} calendar day(s) is shorter than 4 consecutive days, so it is not a period of incapacity for work and no SSP is due.` });
    return { errors, isPiw, calendarDays, qualifying: 0, waiting: 0, paidDays: 0, total: 0, rows, findings, weeklyRate: 0, dailyRate: 0, cap, start, end };
  }

  const rateFor = (d) => {
    if (d >= CHANGE_DAY) return { weekly: Math.min(NEW_RATE, 0.8 * earnings), era: "2026/27 rules" };
    return { weekly: earnings >= LEL ? OLD_RATE : 0, era: "pre-April 2026 rules" };
  };
  for (let d = start; d <= end; d++) {
    if (!qdays.includes(weekday(d))) continue;
    qualifying++;
    const { weekly, era } = rateFor(d);
    if (d >= RATE_YEAR_END) beyondRates = true;
    if (waitLeft > 0) { waitLeft--; waiting++; continue; }
    if (paidDays >= cap) continue;
    if (weekly === 0) { ineligible++; continue; }
    const daily = weekly / qdays.length;
    paidDays++;
    total += daily;
    if (!rows.length || rows[rows.length - 1].era !== era) rows.push({ era, weekly, daily, days: 0, amount: 0 });
    const r = rows[rows.length - 1];
    r.days++; r.amount += daily;
  }
  const first = rateFor(start).weekly || rateFor(end).weekly;
  const weeklyRate = rows.length ? rows[0].weekly : first;
  const dailyRate = weeklyRate / qdays.length;

  if (ineligible) findings.push({ severity: "high", title: `Average weekly earnings of ${money(earnings)} are below the ${money(LEL)} lower earnings limit that applied before 6 April 2026, so ${ineligible} qualifying day(s) before that date carry no SSP.` });
  if (waiting) findings.push({ severity: "info", title: `${waiting} waiting day(s) at the start are unpaid: before 6 April 2026 the first 3 qualifying days of a period of incapacity were not paid.` });
  if (start >= CHANGE_DAY && earnings * 0.8 < NEW_RATE) findings.push({ severity: "medium", title: `SSP is capped at 80% of average weekly earnings (${money(0.8 * earnings)}) because that is below the flat rate of ${money(NEW_RATE)}.` });
  if (paidDays >= cap && qualifying - waiting - ineligible > paidDays) findings.push({ severity: "high", title: `The ${MAX_WEEKS}-week SSP limit (${cap} qualifying days) is reached; days after that are not covered. Employee may move to other support.` });
  if (beyondRates) findings.push({ severity: "medium", title: "Days from 6 April 2027 use the 2026/27 rate; the new tax-year rate was not available. Check GOV.UK." });
  if (!qualifying) findings.push({ severity: "info", title: "No qualifying days fall inside the sickness dates, so nothing is payable." });
  findings.push({ severity: "info", title: "Linked PIWs (spells within 8 weeks of each other) count toward the 28-week limit; this tool counts one spell only. Enter days already waited in a linked spell for pre-April 2026 sickness." });
  return { errors, isPiw, calendarDays, qualifying, waiting, paidDays, total, rows, findings, weeklyRate, dailyRate, cap, start, end };
}

export function summaryText(r) {
  const lines = ["UK Statutory Sick Pay check", ""];
  lines.push(`Sickness: ${fromDay(r.start)} to ${fromDay(r.end)} (${r.calendarDays} calendar days)`);
  lines.push(`Period of incapacity for work (4+ days): ${r.isPiw ? "yes" : "no"}`);
  lines.push(`Qualifying days: ${r.qualifying}, waiting days: ${r.waiting}, paid days: ${r.paidDays}`);
  lines.push(`Weekly rate: ${money(r.weeklyRate)}, daily rate: ${money(r.dailyRate)}`);
  for (const x of r.rows) lines.push(`  ${x.era}: ${x.days} day(s) x ${money(x.daily)} = ${money(x.amount)}`);
  lines.push(`SSP due: ${money(r.total)}`, "");
  for (const f of r.findings) lines.push(`- [${f.severity}] ${f.title}`);
  lines.push("", VERIFY, "Not legal, payroll or employment advice. No warranty.");
  return lines.join("\n");
}
