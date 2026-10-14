// UK statutory redundancy pay calculator (England, Wales and Scotland).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: an employee with at least two years' continuous service gets, for each complete year
// worked (counting back from the redundancy date, at most 20 years): half a week's pay for each year the employee was under 22, one week's pay for each year aged 22 to 40,
// and one and a half weeks' pay for each year aged 41 or over. A week's pay is capped (GBP 700 for dismissals from 6 April 2024, GBP 719 from 6 April 2025, GBP 751 from 6 April 2026),
// so the statutory maximum is 30 times the cap. Redundancy payments are free of income tax up to GBP 30,000 in total termination payments; pay in lieu of notice is taxable in full.
// NOT modelled: Northern Ireland (different rules and cap), employee National Insurance on taxable parts, Scottish and other non-basic tax bands (the rate is the visitor's input),
// the age used for each year (the age at the redundancy date is treated as the age in the most recent year, then one year younger for each earlier year), contractual terms that
// pay more than the statute, unpaid holiday, bonuses, pension effects, and rates announced for later years. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Redundancy pay' (gov.uk/redundancy-your-rights/redundancy-pay) and 'Calculate your redundancy pay'; Employment Rights Act 1996 ss.162-227; HMRC 'Tax on payments when you leave your job' (termination payments, GBP 30,000 exemption)";
export const CAPS = {
  2024: { label: "Dismissed 6 April 2024 to 5 April 2025", cap: 700 },
  2025: { label: "Dismissed 6 April 2025 to 5 April 2026", cap: 719 },
  2026: { label: "Dismissed from 6 April 2026", cap: 751 },
};
export const MIN_YEARS = 2;
export const MAX_YEARS_COUNTED = 20;
export const TAX_FREE_LIMIT = 30000;
export const MAX_NOTICE_WEEKS = 12;
export const RATES = [0.2, 0.4, 0.45];

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function weeksForAge(age) {
  if (age < 22) return 0.5;
  if (age <= 40) return 1;
  return 1.5;
}

// Returns the per-year breakdown for the counted years, most recent first.
export function statutoryWeeks(age, years) {
  const counted = Math.min(years, MAX_YEARS_COUNTED);
  const rows = [];
  for (let k = 0; k < counted; k++) rows.push({ yearsBack: k + 1, age: age - k, weeks: weeksForAge(age - k) });
  return { counted, weeks: rows.reduce((s, x) => s + x.weeks, 0), rows };
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, min = 0) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) { errors.push(`Enter ${label} as ${min === 0 ? "zero" : String(min)} or more.`); return 0; }
    return n;
  };
  const weekly = num("weekly", "your gross pay for a normal week", 0.01);
  const age = Number(i.age);
  if (!Number.isInteger(age) || age < 16 || age > 100) errors.push("Enter your age in whole years, 16 to 100.");
  const years = Number(i.years);
  if (!Number.isInteger(years) || years < 0 || years > 60) errors.push("Enter your complete years of service as a whole number, 0 to 60.");
  else if (Number.isInteger(age) && age >= 16 && years > age - 16) errors.push("Years of service cannot be more than your age minus 16.");
  const cap = Number(i.cap);
  if (!CAPS[cap]) errors.push("Pick when you were or will be dismissed.");
  const mode = i.mode === undefined || i.mode === "" ? "none" : i.mode;
  if (!["none", "multiple", "weeks"].includes(mode)) errors.push("Pick how your employer's offer is expressed.");
  let offer = 0;
  if (mode !== "none") offer = num("offer", mode === "multiple" ? "the multiple of statutory pay on offer" : "the weeks of pay per year of service on offer", 0.01);
  let pilon = i.pilon === undefined || i.pilon === "" ? 0 : Number(i.pilon);
  if (!Number.isFinite(pilon) || pilon < 0 || pilon > 52) { errors.push("Enter weeks of pay in lieu of notice from 0 to 52."); pilon = 0; }
  const rate = i.rate === undefined || i.rate === "" ? 0.2 : Number(i.rate);
  if (!RATES.includes(rate)) errors.push("Pick your income tax rate.");
  return { errors, weekly, age, years, cap, mode, offer, pilon, rate };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { weekly, age, years, cap, mode, offer, pilon, rate } = p;
  const c = CAPS[cap];
  const eligible = years >= MIN_YEARS;
  const cappedWeekly = Math.min(weekly, c.cap);
  const sw = statutoryWeeks(age, years);
  const weeks = eligible ? sw.weeks : 0;
  const statutory = eligible ? r2(weeks * cappedWeekly) : 0;
  const maxStatutory = r2(30 * c.cap);

  let employerOffer = null;
  if (mode === "multiple") employerOffer = r2(statutory * offer);
  else if (mode === "weeks") employerOffer = r2(offer * years * weekly);
  const redundancy = employerOffer === null ? statutory : Math.max(statutory, employerOffer);
  const underStatutory = employerOffer !== null && eligible && employerOffer < statutory;

  const noticeWeeks = years >= 1 ? Math.min(years, MAX_NOTICE_WEEKS) : 0;
  const pilonPay = r2(pilon * weekly);
  const taxFreeRedundancy = Math.min(redundancy, TAX_FREE_LIMIT);
  const taxableRedundancy = r2(Math.max(0, redundancy - TAX_FREE_LIMIT));
  const taxable = r2(taxableRedundancy + pilonPay);
  // The GBP 30,000 exemption covers all termination payments other than pay in lieu of notice, so PILON never uses it up.
  const tax = r2(taxable * rate);
  const net = r2(redundancy + pilonPay - tax);
  const lostToCap = eligible && weekly > c.cap ? r2(weeks * (weekly - c.cap)) : 0;

  const findings = [];
  const obligations = [];
  if (!eligible) {
    findings.push({ severity: "high", title: `With ${years} complete ${years === 1 ? "year" : "years"} of service you are below the ${MIN_YEARS}-year minimum for statutory redundancy pay. Your contract, a staff handbook or a settlement offer may still pay something.` });
  } else {
    findings.push({ severity: "high", title: `Statutory redundancy pay on these figures: ${money(statutory)} (${weeks} ${weeks === 1 ? "week" : "weeks"} at ${money(cappedWeekly)} a week${weekly > c.cap ? `, your pay capped from ${money(weekly)}` : ""}).` });
    if (lostToCap > 0) findings.push({ severity: "medium", title: `Your weekly pay is above the GBP ${c.cap} cap, so the statute pays ${money(lostToCap)} less than a full week's pay would. Any enhanced offer is the only way to recover that.` });
    if (underStatutory) findings.push({ severity: "high", title: `The offer works out at ${money(employerOffer)}, which is less than the statutory ${money(statutory)}. An employer cannot pay less than the statutory amount for a genuine redundancy; query it.` });
    else if (employerOffer !== null) findings.push({ severity: "medium", title: `The employer's offer works out at ${money(employerOffer)}, ${money(employerOffer - statutory)} above statutory pay.` });
    if (years > MAX_YEARS_COUNTED) findings.push({ severity: "info", title: `Only the last ${MAX_YEARS_COUNTED} years of service count towards the statutory amount, so ${years - MAX_YEARS_COUNTED} earlier ${years - MAX_YEARS_COUNTED === 1 ? "year does" : "years do"} not add to it.` });
    if (redundancy > TAX_FREE_LIMIT) findings.push({ severity: "medium", title: `${money(taxableRedundancy)} of the redundancy payment is above the GBP ${TAX_FREE_LIMIT.toLocaleString("en-GB")} tax-free limit and is taxed as pay. Splitting the timing across tax years or a pension contribution can change this; ask an accountant.` });
    else findings.push({ severity: "info", title: `The redundancy payment of ${money(redundancy)} is within the GBP ${TAX_FREE_LIMIT.toLocaleString("en-GB")} tax-free limit for termination payments.` });
  }
  if (pilonPay > 0) findings.push({ severity: "medium", title: `Pay in lieu of notice of ${money(pilonPay)} is taxable in full and does not use the GBP ${TAX_FREE_LIMIT.toLocaleString("en-GB")} exemption.` });
  findings.push({ severity: "info", title: "Not modelled: Northern Ireland (different cap and rules), employee National Insurance on taxable pay, holiday and bonus pay, contractual terms, pension effects, and anything that changed after this was written. A week's pay can include regular overtime and some commission; use the average the statute requires over the 12 weeks before dismissal." });

  if (eligible) {
    obligations.push({ ref: "Notice", title: `Statutory notice: ${noticeWeeks} ${noticeWeeks === 1 ? "week" : "weeks"}`, why: `The minimum is one week per complete year of service up to ${MAX_NOTICE_WEEKS} weeks. Your contract may give more. Pay in lieu of notice is a separate, taxable amount.` });
    obligations.push({ ref: "Ask", title: "Ask for the calculation in writing", why: "Your employer should show the weeks, the weekly pay figure used and the cap applied. Compare each against this result." });
    obligations.push({ ref: "Claim", title: "Unpaid? Claim within six months", why: "If an employer does not pay a redundancy payment, a claim can go to an employment tribunal, with a six-month time limit from the dismissal date. ACAS offers free early conciliation." });
    obligations.push({ ref: "Alternatives", title: "Suitable alternative work and time off", why: "You can be offered a suitable alternative role with a four-week trial period, and with two years' service you are entitled to reasonable paid time off to look for work during notice." });
  }
  return { errors: [], capLabel: c.label, cap: c.cap, weekly, age, years, mode, eligible, cappedWeekly, weeks, counted: sw.counted, rows: eligible ? sw.rows : [], statutory, maxStatutory, employerOffer, underStatutory, redundancy, lostToCap, noticeWeeks, pilon, pilonPay, taxFreeRedundancy, taxableRedundancy, taxable, rate, tax, net, findings, obligations };
}

export const SAMPLE = { weekly: 850, age: 46, years: 12, cap: 2025, mode: "multiple", offer: 1.5, pilon: 4, rate: 0.4 };

export function summaryText(r) {
  const L = ["UK redundancy pay", "", `Dismissal period: ${r.capLabel} (weekly pay cap GBP ${r.cap})`, `Age: ${r.age}. Complete years of service: ${r.years}`, `Gross weekly pay: ${money(r.weekly)}`, "", `Eligible for statutory redundancy pay: ${r.eligible ? "yes" : "no"}`];
  if (r.eligible) L.push(`Statutory weeks: ${r.weeks}`, `Statutory redundancy pay: ${money(r.statutory)}`);
  if (r.employerOffer !== null) L.push(`Employer offer: ${money(r.employerOffer)}`);
  L.push(`Redundancy payment used: ${money(r.redundancy)}`, `Pay in lieu of notice: ${money(r.pilonPay)}`, `Taxable amount: ${money(r.taxable)}`, `Estimated income tax at ${r.rate * 100}%: ${money(r.tax)}`, `Estimated take-home: ${money(r.net)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not legal or tax advice. No warranty.");
  return L.join("\n");
}
