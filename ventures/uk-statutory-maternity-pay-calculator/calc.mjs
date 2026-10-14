// UK Statutory Maternity Pay (SMP) and Statutory Paternity Pay (SPP). Rules
// written from memory, no live lookup:
//  - Qualifying week = the 15th week before the expected week of childbirth
//    (EWC); weeks run Sunday to Saturday.
//  - Employee must have been continuously employed for 26 weeks ending with
//    the qualifying week, and average weekly earnings (AWE) in the 8 weeks
//    to the end of that week must be at least the lower earnings limit (LEL).
//  - SMP lasts up to 39 weeks: 90% of AWE for the first 6 weeks, then the
//    LOWER of the standard weekly rate and 90% of AWE for 33 weeks. It can
//    start no earlier than 11 weeks before the EWC.
//  - SPP: up to 2 weeks at the lower of the standard weekly rate and 90% AWE.
//  - Rates uprate each April and apply to each week of pay on its own date.
// Dates are calendar days (UTC), never timestamps.

export const RATES = [
  { from: Date.UTC(2025, 3, 6) / 86400000, standard: 187.18, lel: 125, label: "2025/26" },
  { from: Date.UTC(2026, 3, 6) / 86400000, standard: 194.32, lel: 129, label: "2026/27" },
];
export const LAST_KNOWN_END = Date.UTC(2027, 3, 6) / 86400000;
export const SMP_WEEKS = 39;
export const HIGH_WEEKS = 6;
export const SPP_WEEKS = 2;
export const VERIFY = "Verify the rates and eligibility on GOV.UK (Statutory Maternity Pay, Statutory Paternity Pay) or with the HMRC Employers' Helpline before you pay.";

const DAY = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDay(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / DAY;
}
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const weekday = (n) => ((new Date(n * DAY).getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
export const sundayOnOrBefore = (n) => n - (weekday(n) % 7);
const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2);
const r2 = (n) => Math.round(n * 100) / 100;

export function rateAt(day) {
  let cur = RATES[0];
  for (const r of RATES) if (day >= r.from) cur = r;
  return cur;
}

export const SAMPLE = {
  expectedDate: "2026-11-20",
  weeklyEarnings: "520",
  employmentStart: "2024-03-01",
  leaveStart: "2026-10-26",
  paternityStart: "2026-11-23",
};

export function compute(input) {
  const errors = [];
  const awe = Number(String(input.weeklyEarnings ?? "").replace(/[£,\s]/g, ""));
  if (String(input.weeklyEarnings ?? "").trim() === "" || !(awe >= 0)) errors.push("Enter average weekly earnings as a number (for example 520).");
  const ewc = toDay(input.expectedDate);
  if (ewc === null) errors.push("Enter the expected due date as YYYY-MM-DD.");
  const emp = toDay(input.employmentStart);
  if (emp === null) errors.push("Enter the date the employee's continuous employment started as YYYY-MM-DD.");
  const leaveRaw = String(input.leaveStart ?? "").trim();
  let leave = null;
  if (leaveRaw) { leave = toDay(leaveRaw); if (leave === null) errors.push("Enter the maternity pay start date as YYYY-MM-DD, or leave it blank."); }
  const patRaw = String(input.paternityStart ?? "").trim();
  let pat = null;
  if (patRaw) { pat = toDay(patRaw); if (pat === null) errors.push("Enter the paternity pay start date as YYYY-MM-DD, or leave it blank."); }
  if (errors.length) return { errors };

  const ewcWeek = sundayOnOrBefore(ewc);
  const qualifyingWeek = ewcWeek - 15 * 7;
  const earliestStart = ewcWeek - 11 * 7;
  const qwRate = rateAt(qualifyingWeek + 6);
  const employedFor = qualifyingWeek + 6 - emp + 1; // days employed to end of QW
  const employedWeeks = Math.floor(employedFor / 7);
  const lengthOk = employedWeeks >= 26;
  const earningsOk = awe >= qwRate.lel;
  const eligible = lengthOk && earningsOk;
  const findings = [];

  if (!lengthOk) findings.push({ severity: "high", title: `Continuous employment to the end of the qualifying week (${fromDay(qualifyingWeek + 6)}) is about ${Math.max(0, employedWeeks)} weeks; 26 are needed, so SMP and SPP are not due on these dates. Maternity Allowance from Jobcentre Plus may be available instead.` });
  if (!earningsOk) findings.push({ severity: "high", title: `Average weekly earnings of ${money(awe)} are below the ${money(qwRate.lel)} lower earnings limit (${qwRate.label}), so SMP and SPP are not due. Maternity Allowance may be available instead.` });

  let start = leave ?? earliestStart;
  if (leave !== null && leave < earliestStart) {
    findings.push({ severity: "medium", title: `Maternity pay cannot start before ${fromDay(earliestStart)} (11 weeks before the expected week); the calculation uses that date instead of ${fromDay(leave)}.` });
    start = earliestStart;
  }
  if (leave === null) findings.push({ severity: "info", title: `No start date given, so maternity pay is shown from the earliest possible date, ${fromDay(earliestStart)}.` });

  const rows = [];
  let smpTotal = 0, beyond = false;
  if (eligible) {
    for (let i = 0; i < SMP_WEEKS; i++) {
      const wk = start + 7 * i;
      if (wk >= LAST_KNOWN_END) beyond = true;
      const std = rateAt(wk).standard;
      const high = i < HIGH_WEEKS;
      const amount = r2(high ? 0.9 * awe : Math.min(std, 0.9 * awe));
      const phase = high ? "Weeks 1-6 at 90% of earnings" : "Weeks 7-39 at the lower of the standard rate and 90%";
      const key = phase + "|" + amount;
      const last = rows[rows.length - 1];
      if (last && last.key === key) { last.weeks++; last.total = r2(last.total + amount); }
      else rows.push({ key, phase, weekly: amount, weeks: 1, total: amount });
      smpTotal = r2(smpTotal + amount);
    }
    if (beyond) findings.push({ severity: "medium", title: "Weeks from 6 April 2027 use the 2026/27 standard rate because the next uprating was not available. Check GOV.UK." });
    if (0.9 * awe < rateAt(start + 7 * HIGH_WEEKS).standard) findings.push({ severity: "info", title: `90% of earnings (${money(0.9 * awe)}) is below the standard rate, so weeks 7-39 are paid at 90% of earnings, not the flat rate.` });
  }

  let spp = null;
  if (eligible) {
    const ps = pat ?? ewcWeek;
    const std = rateAt(ps).standard;
    const weekly = r2(Math.min(std, 0.9 * awe));
    spp = { weekly, total: r2(weekly * SPP_WEEKS), from: ps };
    findings.push({ severity: "info", title: `Statutory Paternity Pay (a partner or other eligible person with the same employment test) would be ${money(weekly)} a week for up to ${SPP_WEEKS} weeks (${money(spp.total)}) at these earnings and dates.` });
  }
  findings.push({ severity: "info", title: "Average weekly earnings must be worked out from gross pay in the 8 weeks to the end of the qualifying week, including some bonuses and back-pay. This tool takes the figure you enter." });
  return { errors, eligible, lengthOk, earningsOk, ewc, ewcWeek, qualifyingWeek, earliestStart, start, employedWeeks, awe, qwRate, rows, smpTotal, spp, findings };
}

export function summaryText(r) {
  const lines = ["UK Statutory Maternity Pay check", ""];
  lines.push(`Expected due date: ${fromDay(r.ewc)} (week starting ${fromDay(r.ewcWeek)})`);
  lines.push(`Qualifying week starts: ${fromDay(r.qualifyingWeek)}`);
  lines.push(`Continuous employment at qualifying week: about ${Math.max(0, r.employedWeeks)} weeks (26 needed): ${r.lengthOk ? "met" : "not met"}`);
  lines.push(`Average weekly earnings ${money(r.awe)} vs lower earnings limit ${money(r.qwRate.lel)}: ${r.earningsOk ? "met" : "not met"}`);
  if (r.eligible) {
    lines.push(`Maternity pay starts: ${fromDay(r.start)}`);
    for (const x of r.rows) lines.push(`  ${x.phase}: ${x.weeks} week(s) x ${money(x.weekly)} = ${money(x.total)}`);
    lines.push(`SMP total (39 weeks): ${money(r.smpTotal)}`);
    if (r.spp) lines.push(`SPP (2 weeks from ${fromDay(r.spp.from)}): ${money(r.spp.total)}`);
  } else lines.push("SMP/SPP due: £0.00");
  lines.push("");
  for (const f of r.findings) lines.push(`- [${f.severity}] ${f.title}`);
  lines.push("", VERIFY, "Not legal, payroll or employment advice. No warranty.");
  return lines.join("\n");
}
