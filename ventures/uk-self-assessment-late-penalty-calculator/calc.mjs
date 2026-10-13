// UK Self Assessment late filing and late payment penalties, plus interest, and what each extra month of delay adds.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled for an online return due 31 January after the tax year:
// late filing = GBP 100 once any day late; after 3 months GBP 10 a day for up to 90 days; after 6 months the greater of GBP 300 or 5% of the tax due;
// after 12 months a further greater of GBP 300 or 5%. Late payment = 5% of unpaid tax once 30 days late, a further 5% at 6 months, a further 5% at 12 months.
// Interest is simple, daily, from the due date at a rate the user supplies (HMRC's late payment rate moves with Bank of England base rate, so it is never hard-coded).
// NOT modelled: reasonable-excuse appeals, higher penalties for withholding information, paper-return dates, time-to-pay arrangements, interest on penalties,
// the points-based regime for Making Tax Digital for Income Tax. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Self Assessment tax returns: penalties', 'Pay a late Self Assessment tax bill' and 'HMRC interest rates for late and early payments'; Finance Act 2009 Sch 55 and 56";
export const YEARS = { 2023: "2023/24", 2024: "2024/25", 2025: "2025/26", 2026: "2026/27" };
export const MIN_FIXED = 300;
export const DAY = 86400000;

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function toDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}
export const iso = (d) => d.toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((b - a) / DAY);
export const addDays = (d, n) => new Date(d.getTime() + n * DAY);
// Calendar months, clamped to the end of a short month (31 Jan + 3 months = 30 Apr).
export function addMonths(d, n) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year of the return.");
  const taxDue = i.taxDue === "" || i.taxDue === undefined || i.taxDue === null ? NaN : Number(i.taxDue);
  if (!Number.isFinite(taxDue) || taxDue < 0) errors.push("Enter the tax you owed for that year as zero or more (zero if you owed nothing).");
  const rate = i.rate === "" || i.rate === undefined || i.rate === null ? NaN : Number(i.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) errors.push("Enter HMRC's current late payment interest rate as a percentage between 0 and 50 (see GOV.UK).");
  const filed = toDate(i.filed), paid = toDate(i.paid);
  if (!filed) errors.push("Enter the date you filed (or will file) the return, as a date.");
  if (!paid) errors.push("Enter the date you paid (or will pay) the tax, as a date.");
  return { errors, year, taxDue: Number.isFinite(taxDue) ? taxDue : 0, rate: Number.isFinite(rate) ? rate : 0, filed, paid };
}

// Penalties for one filing date and one payment date. Pure and reusable for the delay table.
export function penalties({ due, filed, paid, taxDue, rate }) {
  const filing = [];
  const late = daysBetween(due, filed);
  if (late > 0) {
    filing.push({ ref: "F1", label: "Late return, any lateness", amount: 100 });
    const m3 = addMonths(due, 3);
    const dailyDays = Math.min(90, Math.max(0, daysBetween(m3, filed)));
    if (dailyDays > 0) filing.push({ ref: "F2", label: `GBP 10 a day for ${dailyDays} day${dailyDays === 1 ? "" : "s"} (cap 90)`, amount: dailyDays * 10 });
    const tier = Math.max(MIN_FIXED, r2(taxDue * 0.05));
    if (filed > addMonths(due, 6)) filing.push({ ref: "F3", label: "6 months late: greater of GBP 300 or 5% of the tax", amount: tier });
    if (filed > addMonths(due, 12)) filing.push({ ref: "F4", label: "12 months late: another greater of GBP 300 or 5%", amount: tier });
  }
  const payment = [];
  const payLate = daysBetween(due, paid);
  if (taxDue > 0 && paid > addDays(due, 30)) {
    payment.push({ ref: "P1", label: "30 days late: 5% of the unpaid tax", amount: r2(taxDue * 0.05) });
    if (paid > addMonths(due, 6)) payment.push({ ref: "P2", label: "6 months late: a further 5%", amount: r2(taxDue * 0.05) });
    if (paid > addMonths(due, 12)) payment.push({ ref: "P3", label: "12 months late: a further 5%", amount: r2(taxDue * 0.05) });
  }
  const interest = taxDue > 0 && payLate > 0 ? r2(taxDue * (rate / 100) * payLate / 365) : 0;
  const filingTotal = r2(filing.reduce((s, x) => s + x.amount, 0));
  const paymentTotal = r2(payment.reduce((s, x) => s + x.amount, 0));
  return { filing, payment, interest, filingTotal, paymentTotal, total: r2(filingTotal + paymentTotal + interest), lateDays: late, payLateDays: payLate };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { year, taxDue, rate, filed, paid } = p;
  const label = YEARS[year];
  const due = new Date(Date.UTC(year + 2, 0, 31));
  const base = penalties({ due, filed, paid, taxDue, rate });
  const findings = [];
  if (base.total === 0) {
    findings.push({ severity: "info", title: `On these dates nothing is late: no penalty and no interest. The return and the payment for ${label} are both due ${iso(due)}.` });
  } else {
    findings.push({ severity: "high", title: `Estimated cost of being late for ${label}: ${money(base.total)} on top of the ${money(taxDue)} of tax (filing penalties ${money(base.filingTotal)}, payment penalties ${money(base.paymentTotal)}, interest ${money(base.interest)}).` });
  }
  if (base.lateDays > 0 && taxDue === 0) findings.push({ severity: "medium", title: "You owed no tax, but the GBP 100 late filing penalty still applies, and daily penalties follow after three months. Filing is what stops them." });
  if (base.lateDays > 0 && base.payLateDays <= 0) findings.push({ severity: "info", title: "The tax was paid on time, so only filing penalties apply. Paying on time does not cancel a late return penalty." });
  if (base.payLateDays > 0 && base.lateDays <= 0) findings.push({ severity: "info", title: "The return was filed on time, so only payment penalties and interest apply. Filing on time does not stop late payment penalties." });
  const cheapest = base.lateDays > 0 && base.lateDays <= 92 && base.filing.length > 0 ? daysBetween(filed, addMonths(due, 3)) : null;
  if (cheapest !== null && cheapest >= 0) findings.push({ severity: "medium", title: `Filing within ${cheapest} day${cheapest === 1 ? "" : "s"} (by ${iso(addMonths(due, 3))}) keeps the filing penalty at GBP 100; after that GBP 10 a day starts.` });
  findings.push({ severity: "info", title: "If you had a reasonable excuse (serious illness, bereavement, a HMRC system failure), you can appeal a penalty. This tool does not decide that." });

  const delays = [0, 30, 60, 90, 180, 365].map((d) => {
    const x = penalties({ due, filed: addDays(filed, d), paid: addDays(paid, d), taxDue, rate });
    return { days: d, filed: iso(addDays(filed, d)), paid: iso(addDays(paid, d)), total: x.total, extra: r2(x.total - base.total) };
  });
  const obligations = [
    { ref: "File", title: "File the return now", why: "Filing stops daily and percentage filing penalties growing. It does not need the money to be ready." },
    { ref: "Pay", title: "Pay what you can, now", why: "Interest runs daily on unpaid tax, and 5% penalty steps hit at 30 days, 6 months and 12 months. If you cannot pay in full, ask HMRC for a Time to Pay arrangement before the 30-day mark." },
    { ref: "Appeal", title: "Appeal if you had a reasonable excuse", why: "Use the penalty notice or your HMRC online account. Appeal within 30 days of the notice." },
    { ref: "Rate", title: "Check the interest rate", why: "HMRC's late payment rate changes with the Bank of England base rate. Use the current rate from GOV.UK." },
  ];
  return { errors: [], label, year, due: iso(due), filed: iso(filed), paid: iso(paid), taxDue, rate, ...base, delays, findings, obligations };
}

export const SAMPLE = { year: 2024, taxDue: 6400, filed: "2026-05-15", paid: "2026-05-15", rate: 8 };

export function summaryText(r) {
  const L = [`UK Self Assessment late penalties, return for ${r.label}`, "", `Due date: ${r.due}`, `Filed: ${r.filed} (${Math.max(0, r.lateDays)} days late)`, `Paid: ${r.paid} (${Math.max(0, r.payLateDays)} days late)`, `Tax owed: ${money(r.taxDue)}`, `Interest rate assumed: ${r.rate}%`, ""];
  for (const x of r.filing) L.push(`${x.ref}  ${x.label}: ${money(x.amount)}`);
  for (const x of r.payment) L.push(`${x.ref}  ${x.label}: ${money(x.amount)}`);
  L.push(`Interest: ${money(r.interest)}`, `Estimated total on top of the tax: ${money(r.total)}`, "");
  L.push("Cost of waiting longer:", ...r.delays.map((d) => `  +${d.days} days: ${money(d.total)} (${d.extra ? "+" + money(d.extra) : "no change"})`), "");
  L.push(...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
