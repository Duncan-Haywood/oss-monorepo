// UK National Minimum Wage / National Living Wage check for one worker and
// one pay period. Rules written from memory, no live lookup:
//  - Hourly rate = (pay counted for NMW) / (hours worked in the period).
//  - Working time includes unpaid travel between jobs, mandatory training,
//    time spent waiting at work and on-site on-call; the employer cannot
//    leave it out. The caller enters hours actually worked.
//  - Pay counts before tax and NI; tips and gratuities do not count.
//  - Deductions for the employer's benefit (uniform, tools, fines, loan to
//    employer, cash shortages) reduce NMW pay; so does an accommodation
//    charge above the daily offset. Free or cheap accommodation up to the
//    offset is not a deduction; free accommodation adds the offset as credit.
//  - Rates from 1 April: 2025/26 NLW 21+ 12.21, 18-20 10.00, under 18 and
//    apprentices 7.55, offset 10.66 a day; 2026/27 NLW 21+ 12.71, 18-20 10.85,
//    under 18 and apprentices 8.00, offset ASSUMED 11.10 a day.
//  - HMRC enforcement: arrears owed at the higher of the rate then and now,
//    plus a penalty of 200% of arrears (halved if paid within 14 days),
//    capped at GBP 20,000 per worker, and the employer can be publicly named.

export const RATES = {
  "2026/27": { label: "2026/27", from: "1 April 2026", "21+": 12.71, "18-20": 10.85, "under18": 8.0, apprentice: 8.0, offset: 11.1 },
  "2025/26": { label: "2025/26", from: "1 April 2025", "21+": 12.21, "18-20": 10.0, "under18": 7.55, apprentice: 7.55, offset: 10.66 },
};
export const BANDS = {
  "21+": "Aged 21 or over (National Living Wage)",
  "18-20": "Aged 18 to 20",
  under18: "Under 18 (not an apprentice)",
  apprentice: "Apprentice in first year, or under 19",
};
export const PENALTY_CAP = 20000;
export const VERIFY = "Verify the rates and the rules on GOV.UK (National Minimum Wage and National Living Wage rates; Calculating the minimum wage) or with the Acas helpline or HMRC before you rely on this.";

export const SAMPLE = {
  taxYear: "2026/27",
  ageBand: "21+",
  periodDays: "7",
  pay: "480",
  hours: "40",
  deductions: "10",
  accommodation: "free",
  accommodationCharge: "0",
  periodsUnderpaid: "26",
};

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => "£" + r2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const s = String(v ?? "").replace(/[£,\s]/g, ""); return s === "" ? null : Number(s); };

export function compute(input) {
  const errors = [];
  const y = RATES[input.taxYear];
  if (!y) errors.push("Choose a tax year.");
  if (!BANDS[input.ageBand]) errors.push("Choose an age band.");
  const days = num(input.periodDays);
  if (!(days > 0 && days <= 31)) errors.push("Pay period must be 1 to 31 days (7 for weekly, 28 for four-weekly).");
  const pay = num(input.pay);
  if (pay === null || !(pay >= 0)) errors.push("Enter the gross pay for the period, before tax (tips excluded).");
  const hours = num(input.hours);
  if (hours === null || !(hours > 0 && hours <= 24 * 31)) errors.push("Enter the hours actually worked in the period, including unpaid working time.");
  const deductions = num(input.deductions) ?? 0;
  if (!(deductions >= 0)) errors.push("Deductions must be 0 or more.");
  const accom = input.accommodation || "none";
  if (!["none", "free", "charged"].includes(accom)) errors.push("Choose an accommodation option.");
  const charge = num(input.accommodationCharge) ?? 0;
  if (!(charge >= 0)) errors.push("Accommodation charge must be 0 or more.");
  const periods = num(input.periodsUnderpaid) ?? 0;
  if (!(periods >= 0 && Number.isInteger(periods))) errors.push("Pay periods affected must be a whole number, or 0.");
  if (errors.length) return { errors };

  const min = y[input.ageBand];
  const allowance = y.offset * days;
  let accomCredit = 0, accomReduction = 0;
  if (accom === "free") accomCredit = allowance;
  if (accom === "charged") accomReduction = Math.max(0, charge - allowance);
  const nmwPay = pay - deductions - accomReduction + accomCredit;
  const hourly = nmwPay / hours;
  const required = min * hours;
  const shortfall = r2(Math.max(0, required - nmwPay));
  const ok = shortfall === 0;
  const arrears = r2(shortfall * periods);
  const penaltyFull = Math.min(PENALTY_CAP, r2(arrears * 2));
  const penaltyPrompt = r2(penaltyFull / 2);
  const findings = [];
  findings.push(ok
    ? { severity: "info", title: `Pay counted for NMW is ${money(nmwPay)}, an effective ${money(hourly)} an hour against the ${money(min)} minimum for ${BANDS[input.ageBand].toLowerCase()} in ${y.label}.` }
    : { severity: "high", title: `Underpaid: ${money(hourly)} an hour effective against ${money(min)}. The shortfall is ${money(shortfall)} for this period (${money(required)} needed, ${money(nmwPay)} counted).` });
  if (deductions > 0) findings.push({ severity: "medium", title: `${money(deductions)} of deductions for the employer's benefit reduce NMW pay. Deductions for tax, NI, pension and court orders do not; enter only the ones that do.` });
  if (accomReduction > 0) findings.push({ severity: "medium", title: `Accommodation charged at ${money(charge)} is over the ${money(allowance)} offset for ${days} days, so ${money(accomReduction)} counts as a deduction.` });
  if (accomCredit > 0) findings.push({ severity: "info", title: `Free accommodation counts for up to ${money(accomCredit)} (${money(y.offset)} a day) towards NMW pay.` });
  if (accom === "none" && charge > 0) findings.push({ severity: "info", title: "An accommodation charge was entered but accommodation is set to none, so it was ignored." });
  if (!ok && periods > 0) findings.push({ severity: "high", title: `Over ${periods} pay periods the arrears are about ${money(arrears)} at the current rate. HMRC can also charge a penalty of up to 200% (${money(penaltyFull)} here, capped at ${money(PENALTY_CAP)} per worker; ${money(penaltyPrompt)} if paid within 14 days) and name the employer. Arrears use the higher of the rate then and now.` });
  if (!ok && periods === 0) findings.push({ severity: "medium", title: "Enter how many pay periods look the same to estimate arrears and the penalty." });
  findings.push({ severity: "info", title: "Not decided here: salaried-hours and output-work averaging, tips, on-call and sleep-in rules, interns and volunteers, pay-reference-period timing, and whether a deduction is allowed. Hours must include unpaid working time." });
  return { errors, y, min, nmwPay, hourly, required, shortfall, ok, arrears, penaltyFull, penaltyPrompt, findings, days, pay, hours, periods, ageBand: input.ageBand };
}

export function summaryText(r) {
  const l = ["UK minimum wage check", "", `Rates ${r.y.label}, ${BANDS[r.ageBand]}`, ""];
  l.push(`Pay counted: ${money(r.nmwPay)} over ${r.hours} hours`);
  l.push(`Effective hourly rate: ${money(r.hourly)} vs minimum ${money(r.min)}: ${r.ok ? "OK" : "BELOW MINIMUM"}`);
  if (!r.ok) {
    l.push(`Shortfall this period: ${money(r.shortfall)}`);
    if (r.periods) l.push(`Arrears over ${r.periods} periods: ${money(r.arrears)}; penalty up to ${money(r.penaltyFull)} (${money(r.penaltyPrompt)} if paid in 14 days)`);
  }
  l.push("");
  for (const f of r.findings) l.push(`- [${f.severity}] ${f.title}`);
  l.push("", VERIFY, "Not legal, payroll or employment advice. No warranty.");
  return l.join("\n");
}
