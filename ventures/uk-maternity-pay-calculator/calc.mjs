// UK statutory maternity pay (SMP) and statutory paternity pay (SPP) calculator (Great Britain), with a check against normal pay.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: Social Security Contributions and Benefits Act 1992 Part XII and the SMP/SPP regulations.
// SMP: up to 39 weeks. First 6 weeks 90% of average weekly earnings (AWE, no cap); remaining 33 weeks the lower of the flat rate and 90% of AWE. SPP: 1 or 2 weeks at the lower
// of the flat rate and 90% of AWE. Eligibility modelled: 26 weeks' continuous employment up to the end of the qualifying week (the 15th week before the week the baby is due) and AWE
// at or above the lower earnings limit. The flat rate changes on the first Sunday of April; each week of pay uses the rate in force on the day that week starts.
// Rates used: 2025/26 flat rate 187.18, lower earnings limit 125; 2026/27 flat rate 194.32, lower earnings limit 129. The 2026/27 figures are the least certain and must be verified.
// NOT modelled: Northern Ireland, shared parental pay, Maternity Allowance (the fallback if you do not qualify for SMP), contractual or enhanced employer schemes other than the one
// pay figure you enter, how AWE is averaged from your payslips (you enter it), income tax and National Insurance on the pay, premature-birth and adoption rules, and anything changed after this was written.

export const VERIFY = "GOV.UK 'Statutory Maternity Pay and Leave: employer guide' and 'Statutory Paternity Pay', Social Security Contributions and Benefits Act 1992 ss.164-171ZZ";
export const SMP_WEEKS = 39;
export const HIGH_RATE_WEEKS = 6;
export const RATES = [
  { from: Date.UTC(2025, 3, 6), flat: 187.18, lel: 125, label: "6 April 2025 to 4 April 2026" },
  { from: Date.UTC(2026, 3, 5), flat: 194.32, lel: 129, label: "from 5 April 2026" },
];

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;

function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { t: dt.getTime() };
}
export const iso = (t) => new Date(t).toISOString().slice(0, 10);
export function rateFor(t) {
  let pick = RATES[0];
  for (const r of RATES) if (t >= r.from) pick = r;
  return pick;
}
// Sunday that starts the week containing t.
export const weekStart = (t) => t - new Date(t).getUTCDay() * DAY;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const kind = i.kind === undefined || i.kind === "" ? "maternity" : i.kind;
  if (kind !== "maternity" && kind !== "paternity") errors.push("Pick maternity or paternity pay.");
  const due = dateParts(i.due), start = dateParts(i.start), pay = dateParts(i.payStart);
  if (!due) errors.push("Enter the expected week of childbirth (the due date) as a date.");
  if (!start) errors.push("Enter the day you started with this employer as a date.");
  if (!pay) errors.push(kind === "paternity" ? "Enter the day you want paternity pay to start as a date." : "Enter the day you want maternity pay to start as a date.");
  const num = (key, label) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const awe = num("awe", "your average gross weekly earnings");
  const weeksRaw = i.paternityWeeks === undefined || i.paternityWeeks === "" ? 2 : Number(i.paternityWeeks);
  if (kind === "paternity" && weeksRaw !== 1 && weeksRaw !== 2) errors.push("Pick 1 or 2 weeks of paternity pay.");
  const employerTop = i.topUp === undefined || i.topUp === "" ? 0 : Number(i.topUp);
  if (!Number.isFinite(employerTop) || employerTop < 0 || employerTop > 100) errors.push("Enter the employer top-up as a percentage of pay from 0 to 100 (0 if none).");
  return { errors, kind, due, start, pay, awe, paternityWeeks: weeksRaw, topUp: employerTop };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { kind, due, start, pay, awe } = p;
  const weekOfDue = weekStart(due.t);
  const qualStart = weekOfDue - 15 * 7 * DAY;
  const qualEnd = qualStart + 6 * DAY;
  const daysEmployed = Math.floor((qualEnd - start.t) / DAY) + 1;
  const continuous = daysEmployed >= 26 * 7;
  const lel = rateFor(qualEnd).lel;
  const earningsOk = awe >= lel;
  const eligible = continuous && earningsOk;
  const earliestStart = weekOfDue - 11 * 7 * DAY;

  const weeks = kind === "paternity" ? p.paternityWeeks : SMP_WEEKS;
  const ninety = r2(awe * 0.9);
  const schedule = [];
  let total = 0;
  if (eligible) {
    for (let w = 0; w < weeks; w++) {
      const t = pay.t + w * 7 * DAY;
      const flat = rateFor(t).flat;
      const high = kind === "maternity" && w < HIGH_RATE_WEEKS;
      const weekly = high ? ninety : r2(Math.min(flat, ninety));
      const label = high ? "first 6 weeks (90% of average earnings)" : (flat < ninety ? "flat rate" : "90% of average earnings");
      const last = schedule[schedule.length - 1];
      if (last && last.weekly === weekly && last.label === label) { last.to = w + 1; last.amount = r2(last.amount + weekly); } else schedule.push({ from: w + 1, to: w + 1, weekly, label, amount: weekly });
      total = r2(total + weekly);
    }
  }
  const normalForPeriod = r2(awe * weeks);
  const gap = r2(Math.max(0, normalForPeriod - total));
  const topUpAmount = r2(normalForPeriod * (p.topUp / 100));
  const monthly = weeks > 0 && eligible && kind === "maternity" ? r2(total / (weeks / 4.348)) : 0;
  const endDate = iso(pay.t + weeks * 7 * DAY - DAY);

  const findings = [];
  const obligations = [];
  if (!continuous) findings.push({ severity: "high", title: `On these dates you would have ${Math.max(0, Math.floor(daysEmployed / 7))} full weeks with your employer by the end of the qualifying week (${iso(qualEnd)}), under the 26 needed, so statutory ${kind} pay is not due on these figures.` });
  if (!earningsOk) findings.push({ severity: "high", title: `Average weekly earnings of ${money(awe)} are below the lower earnings limit of ${money(lel)}, so statutory ${kind} pay is not due on these figures.` });
  if (!eligible) {
    findings.push({ severity: "medium", title: kind === "maternity" ? "If you do not qualify for Statutory Maternity Pay you may qualify for Maternity Allowance, paid by Jobcentre Plus for up to 39 weeks. Apply early; it needs your work history for the 66 weeks before the due week." : "If you do not qualify you can still ask about shared parental leave and pay, and your employer must tell you in writing why within 28 days." });
  } else {
    findings.push({ severity: "high", title: kind === "maternity"
      ? `Statutory Maternity Pay on these figures totals ${money(total)} over ${weeks} weeks: ${money(ninety)} a week for the first ${HIGH_RATE_WEEKS} weeks, then ${money(schedule[schedule.length - 1].weekly)} a week.`
      : `Statutory Paternity Pay on these figures is ${money(total)}: ${money(schedule[0].weekly)} a week for ${weeks} ${weeks === 1 ? "week" : "weeks"}.` });
    if (gap > 0) findings.push({ severity: "medium", title: `That is ${money(gap)} less than your normal pay over the same ${weeks} weeks (${money(normalForPeriod)}). Plan for the drop, or check whether your contract tops it up.` });
    if (p.topUp > 0) findings.push({ severity: "info", title: `With an employer top-up to ${p.topUp}% of normal pay, the target is ${money(topUpAmount)} over the period; statutory pay already provides ${money(total)} of it. The employer decides how the top-up is paid.` });
  }
  if (kind === "maternity") {
    if (pay.t < earliestStart) findings.push({ severity: "high", title: `The earliest maternity pay can start is the Sunday ${iso(earliestStart)}, 11 weeks before the week the baby is due. A start before that is not allowed, except if the baby is born earlier.` });
    if (pay.t > due.t + 14 * DAY) findings.push({ severity: "medium", title: "Pay starts the day after the birth at the latest, so a start well after the due date will move if the baby is born first. Treat the dates as a plan." });
  } else if (pay.t < due.t - 14 * DAY) findings.push({ severity: "medium", title: "Paternity pay cannot start before the baby is born. The start you picked is well before the due date, so expect to move it to the actual birth date." });
  findings.push({ severity: "medium", title: kind === "maternity" ? "Statutory pay is taxable and subject to National Insurance, like wages, so take-home is less than these gross figures. Check your payslip." : "Statutory pay is taxable and subject to National Insurance, like wages, so take-home is less than these gross figures." });
  findings.push({ severity: "info", title: "Not modelled: Northern Ireland, shared parental pay, Maternity Allowance, contractual maternity schemes beyond the top-up percentage, how your average earnings are averaged from payslips (you enter it), premature births, adoption, and anything that changed after this was written." });

  obligations.push({ ref: "Notify", title: kind === "maternity" ? "Tell your employer by the 15th week before the due week" : "Tell your employer at least 28 days before you want pay to start", why: kind === "maternity" ? "Give 28 days' notice of the start date, in writing if asked, with a MATB1 certificate from your midwife or doctor after about 20 weeks." : "Use form SC3 or your employer's own form, with the due date and the dates you want. You can change them with notice." });
  obligations.push({ ref: "Check", title: "Ask for your average earnings calculation", why: "Ask which pay periods your employer used. Overtime, bonuses and pay rises between the reference period and the end of the maternity period can change it, and the figure here is only as good as the one you entered." });
  obligations.push({ ref: "Plan", title: "Check the contract for enhanced pay", why: "Many employers pay more than the statutory minimum for the first weeks. Compare that against this result and ask what repayment clause applies if you do not return." });
  return { errors: [], kind, weeks, eligible, continuous, earningsOk, daysEmployed, qualifyingWeek: iso(qualStart), qualifyingWeekEnd: iso(qualEnd), earliestStart: iso(earliestStart), lel, awe, ninety, flat: rateFor(pay.t).flat, rateLabel: rateFor(pay.t).label, schedule, total, normalForPeriod, gap, topUp: p.topUp, topUpAmount, monthly, payStart: iso(pay.t), payEnd: endDate, findings, obligations };
}

export const SAMPLE = { kind: "maternity", due: "2026-11-20", start: "2022-05-09", payStart: "2026-09-06", awe: 640, paternityWeeks: 2, topUp: 0 };

export function summaryText(r) {
  const L = [r.kind === "maternity" ? "UK Statutory Maternity Pay" : "UK Statutory Paternity Pay", "", `Qualifying week: ${r.qualifyingWeek} to ${r.qualifyingWeekEnd}`, `Average weekly earnings: ${money(r.awe)} (lower earnings limit ${money(r.lel)})`, `Eligible on these figures: ${r.eligible ? "yes" : "no"}`];
  if (r.eligible) {
    L.push(`Pay period: ${r.payStart} to ${r.payEnd} (${r.weeks} weeks)`, "");
    for (const s of r.schedule) L.push(`Weeks ${s.from}-${s.to}: ${money(s.weekly)} a week (${s.label}) = ${money(s.amount)}`);
    L.push("", `Total statutory pay: ${money(r.total)}`, `Normal pay over the same weeks: ${money(r.normalForPeriod)}`, `Shortfall: ${money(r.gap)}`);
  }
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax, legal or financial advice. No warranty.");
  return L.join("\n");
}
