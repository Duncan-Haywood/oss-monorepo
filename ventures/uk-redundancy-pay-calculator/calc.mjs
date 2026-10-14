// UK statutory redundancy pay calculator (Great Britain), with notice and the GBP 30,000 tax-free limit.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: Employment Rights Act 1996 s.162. An employee with at least 2 years' continuous service
// who is made redundant gets, for each full year of service (counting back from the last day, at most 20 years): half a week's pay if aged under 22 in that year,
// one week's pay if 22 to 40, one and a half weeks' pay if 41 or over. A week's pay is capped (GBP 719 for dismissals from 6 April 2025, so the statutory maximum is GBP 21,570;
// the 2026/27 figure used here is GBP 751 and must be verified). Statutory minimum notice is one week per full year of service up to 12 weeks (after one month).
// Tax: up to GBP 30,000 of redundancy and other termination payments is tax-free; the excess is taxed as pay. Notice pay, pay in lieu of notice, holiday pay and wages are taxable in full.
// NOT modelled: Northern Ireland (different weekly cap), the Scottish tax bands, employer-side NIC, pay in lieu of notice treatment, contractual or enhanced terms other than the one
// total you enter, the special rules for agency workers, apprentices, ex-service and overseas cases, and anything changed after this was written. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Redundancy pay' (gov.uk/redundancy-your-rights/redundancy-pay) and 'Tax on termination payments'; Employment Rights Act 1996 s.162; Income Tax (Earnings and Pensions) Act 2003 s.401-403";
export const TAX_FREE_LIMIT = 30000;
export const MAX_YEARS = 20;
export const MIN_SERVICE_YEARS = 2;
export const MAX_NOTICE_WEEKS = 12;
export const CAPS = { 2025: { label: "dismissal 6 April 2025 to 5 April 2026", cap: 719 }, 2026: { label: "dismissal from 6 April 2026", cap: 751 } };
export const RATES = { 0.2: "basic rate (20%)", 0.4: "higher rate (40%)", 0.45: "additional rate (45%)" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

function dateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, t: dt.getTime() };
}
// Whole years completed between two dates (an anniversary on the end date counts).
export function wholeYears(from, to) {
  let n = to.y - from.y;
  if (to.mo < from.mo || (to.mo === from.mo && to.d < from.d)) n -= 1;
  return n;
}
export function capForDate(end) {
  return end.t >= Date.UTC(2026, 3, 6) ? 2026 : 2025;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const dob = dateParts(i.dob), start = dateParts(i.start), end = dateParts(i.end);
  if (!dob) errors.push("Enter your date of birth as a date.");
  if (!start) errors.push("Enter the day you started the job as a date.");
  if (!end) errors.push("Enter your last day of employment as a date.");
  if (dob && start && dob.t >= start.t) errors.push("Your date of birth must be before your start date.");
  if (start && end && end.t < start.t) errors.push("Your last day must not be before your start date.");
  const num = (key, label, allowEmpty) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (allowEmpty) return 0; errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const weekly = num("weekly", "your gross pay for a normal week", false);
  const offered = num("offered", "the redundancy pay your employer has offered (zero if none yet)", true);
  const rate = Number(i.rate === undefined || i.rate === "" ? 0.2 : i.rate);
  if (!RATES[rate]) errors.push("Pick the tax rate on any amount over GBP 30,000.");
  const other = num("other", "other termination payments that count towards GBP 30,000 (zero if none)", true);
  let capYear = i.capYear === undefined || i.capYear === "" || i.capYear === "auto" ? "auto" : Number(i.capYear);
  if (capYear !== "auto" && !CAPS[capYear]) { errors.push("Pick the weekly pay cap."); capYear = "auto"; }
  return { errors, dob, start, end, weekly, offered, rate, other, capYear };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { dob, start, end, weekly, offered, rate, other } = p;
  const capKey = p.capYear === "auto" ? capForDate(end) : p.capYear;
  const cap = CAPS[capKey].cap;
  // One day after the last day counts as the end of service for the whole-year count.
  const endPlus = dateParts(new Date(end.t + 86400000).toISOString().slice(0, 10));
  const serviceYears = wholeYears(start, endPlus);
  const age = wholeYears(dob, end);
  const counted = Math.min(serviceYears, MAX_YEARS);
  const eligible = serviceYears >= MIN_SERVICE_YEARS;
  const weekPay = Math.min(weekly, cap);
  const capped = weekly > cap;

  let weeks = 0;
  const bands = { under22: 0, mid: 0, over40: 0 };
  for (let k = 1; k <= counted; k++) {
    const a = age - (k - 1);
    if (a < 22) { weeks += 0.5; bands.under22 += 1; } else if (a < 41) { weeks += 1; bands.mid += 1; } else { weeks += 1.5; bands.over40 += 1; }
  }
  const statutory = eligible ? r2(weeks * weekPay) : 0;
  const noticeWeeks = Math.min(MAX_NOTICE_WEEKS, serviceYears >= 1 ? serviceYears : (r2((end.t - start.t) / 86400000) >= 30 ? 1 : 0));
  const redundancy = Math.max(statutory, offered);
  const counting = r2(redundancy + other);
  const taxFree = r2(Math.min(counting, TAX_FREE_LIMIT));
  const excess = r2(Math.max(0, counting - TAX_FREE_LIMIT));
  const tax = r2(excess * rate);
  const net = r2(redundancy - tax);
  const maxStatutory = r2(MAX_YEARS * 1.5 * cap);

  const findings = [];
  const obligations = [];
  if (!eligible) {
    findings.push({ severity: "high", title: `On these dates you have ${serviceYears} full ${serviceYears === 1 ? "year" : "years"} of service, under the ${MIN_SERVICE_YEARS} years needed, so no statutory redundancy pay is due. Your contract or an agreed settlement may still pay something.` });
  } else {
    findings.push({ severity: "high", title: `Statutory redundancy pay on these figures is ${money(statutory)}: ${weeks} weeks at ${money(weekPay)} a week${capped ? ` (your normal week of ${money(weekly)} is capped at ${money(cap)})` : ""}.` });
    if (serviceYears > MAX_YEARS) findings.push({ severity: "info", title: `Only the last ${MAX_YEARS} years of service count, so ${serviceYears - MAX_YEARS} ${serviceYears - MAX_YEARS === 1 ? "year does" : "years do"} not add to the total.` });
    if (offered > 0 && offered < statutory) findings.push({ severity: "high", title: `The offer of ${money(offered)} is ${money(statutory - offered)} below the statutory minimum of ${money(statutory)}. An employer cannot pay less than the statutory amount for a redundancy, so query it in writing.` });
    else if (offered > statutory) findings.push({ severity: "info", title: `The offer of ${money(offered)} is ${money(offered - statutory)} above the statutory minimum, which is a contractual or enhanced payment.` });
    if (bands.under22 || bands.over40) findings.push({ severity: "info", title: `Age changes the weeks you earn: ${bands.under22} ${bands.under22 === 1 ? "year" : "years"} at half a week (under 22), ${bands.mid} at one week (22 to 40), ${bands.over40} at one and a half weeks (41 and over). Each year of service is counted by your age during that year.` });
  }
  if (excess > 0) findings.push({ severity: "medium", title: `${money(excess)} of the total is above the ${money(TAX_FREE_LIMIT)} tax-free limit and is taxed as pay: about ${money(tax)} at ${RATES[rate]}, leaving about ${money(net)} from the redundancy payment.` });
  else if (redundancy > 0) findings.push({ severity: "info", title: `All ${money(redundancy)} falls inside the ${money(TAX_FREE_LIMIT)} tax-free limit, so no income tax is due on it.` });
  findings.push({ severity: "medium", title: `Notice pay, pay in lieu of notice, accrued holiday pay and your final wages are taxable in full and are not part of the ${money(TAX_FREE_LIMIT)} limit. Your statutory minimum notice is ${noticeWeeks} ${noticeWeeks === 1 ? "week" : "weeks"}; your contract may give more.` });
  findings.push({ severity: "info", title: "Not modelled: Northern Ireland (a different weekly cap), Scottish tax bands, employer National Insurance on amounts over the limit, how a pay-in-lieu clause is taxed, special cases such as agency workers, and anything that changed after this was written." });

  if (eligible) {
    obligations.push({ ref: "Ask", title: "Get the calculation in writing", why: "Ask your employer for the weeks, weekly pay and years of service they used. Compare with this result; a gap is usually a wrong start date, a capped week, or an age band." });
    obligations.push({ ref: "Claim", title: "Claim within 6 months if unpaid", why: "If your employer does not pay, you can claim to an employment tribunal, normally within 6 months less a day of your last day. Acas offers free early conciliation first." });
    obligations.push({ ref: "Tax", title: "Check the payslip or P45", why: "Redundancy pay up to the limit should be paid without tax. Compare with the tax figure here; a wrong tax code on a termination payment is reclaimed from HMRC." });
  }
  return { errors: [], capLabel: CAPS[capKey].label, cap, weekly, weekPay, capped, age, serviceYears, counted, eligible, weeks, bands, statutory, noticeWeeks, offered, redundancy, other, counting, taxFree, excess, rate, rateLabel: RATES[rate], tax, net, maxStatutory, findings, obligations };
}

export const SAMPLE = { dob: "1980-03-15", start: "2012-09-03", end: "2026-06-30", weekly: 900, offered: 0, other: 0, rate: 0.2, capYear: "auto" };

export function summaryText(r) {
  const L = ["UK statutory redundancy pay", "", `Age at last day: ${r.age}`, `Full years of service: ${r.serviceYears} (${r.counted} counted)`, `Weekly pay used: ${money(r.weekPay)} (cap ${money(r.cap)}, ${r.capLabel})`, "", `Eligible: ${r.eligible ? "yes" : "no"}`];
  if (r.eligible) L.push(`Weeks of pay: ${r.weeks}`, `Statutory redundancy pay: ${money(r.statutory)}`, `Offered by employer: ${money(r.offered)}`, `Tax-free part: ${money(r.taxFree)}`, `Taxable excess: ${money(r.excess)}`, `Estimated tax at ${r.rateLabel}: ${money(r.tax)}`, `Estimated net redundancy pay: ${money(r.net)}`);
  L.push(`Statutory minimum notice: ${r.noticeWeeks} weeks`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax or legal advice. No warranty.");
  return L.join("\n");
}
