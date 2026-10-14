// UK statutory redundancy pay calculator for dismissals in 2025/26 and 2026/27.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled (England, Wales and Scotland): an employee with at least 2 complete years of service gets, for each
// complete year worked (counting back from the dismissal date, up to 20 years), half a week's pay for each year they were under 22, one week's pay for each year aged 22 to 40 and
// one and a half weeks' pay for each year aged 41 or over. A week's pay is capped (GBP 719 for dismissals from 6 April 2025, GBP 751 from 6 April 2026), so the maximum is 30 weeks
// of the cap. The first GBP 30,000 of redundancy pay is free of income tax; pay in lieu of notice is taxable and sits outside that limit.
// NOT modelled: Northern Ireland (different weekly cap and rules), contractual or enhanced schemes beyond a single amount you type in, notice pay, holiday pay, the protective award,
// employees who are not eligible (for example some office holders and share fishermen), part-years of service, tax on the excess, and rates announced for later years.
// Every result names its source to verify.

export const VERIFY = "GOV.UK 'Redundancy pay' (gov.uk/redundancy-your-rights/redundancy-pay) and 'Tax on termination payments' (gov.uk/tax-on-termination-payments); Employment Rights Act 1996 ss.119-122; ITEPA 2003 s.403";
export const MIN_YEARS = 2;
export const MAX_YEARS = 20;
export const TAX_FREE_LIMIT = 30000;
export const YEARS = {
  2025: { label: "dismissals from 6 April 2025", cap: 719 },
  2026: { label: "dismissals from 6 April 2026", cap: 751 },
};
export const BANDS = [
  { id: "young", label: "Under 22", weeks: 0.5 },
  { id: "mid", label: "22 to 40", weeks: 1 },
  { id: "senior", label: "41 and over", weeks: 1.5 },
];
export const PERIODS = { week: { label: "per week", toWeekly: (n) => n }, month: { label: "per month", toWeekly: (n) => (n * 12) / 52 }, year: { label: "per year", toWeekly: (n) => n / 52 } };

const money = (n) => { const v = Math.round(Math.abs(n) * 100) / 100; return (n < 0 ? "-" : "") + "GBP " + v.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (optional) return 0; errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const whole = (key, label) => {
    const n = num(key, label);
    if (!Number.isInteger(n)) { if (!errors.length) errors.push(`Enter ${label} as a whole number of completed years.`); return 0; }
    return n;
  };
  const age = whole("age", "your age in completed years");
  const service = whole("service", "your complete years of service");
  const pay = num("pay", "your gross pay");
  const period = i.period === undefined || i.period === "" ? "week" : i.period;
  if (!PERIODS[period]) errors.push("Pick whether the pay is per week, month or year.");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the dismissal date range.");
  const extra = num("extra", "any extra redundancy pay from your employer", true);
  const pilon = num("pilon", "any pay in lieu of notice", true);
  if (!errors.length) {
    if (age < 16 || age > 110) errors.push("Enter an age between 16 and 110.");
    else if (service > age - 16) errors.push("Years of service cannot be more than your age minus 16.");
    if (pay <= 0) errors.push("Enter your gross pay as more than zero.");
  }
  return { errors, age, service, pay, period, year, extra, pilon };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { age, service, pay, period, year, extra, pilon } = p;
  const y = YEARS[year];
  const weekly = r2(PERIODS[period].toWeekly(pay));
  const capped = Math.min(weekly, y.cap);
  const isCapped = weekly > y.cap;
  const eligible = service >= MIN_YEARS;
  const counted = Math.min(service, MAX_YEARS);

  const bands = BANDS.map((b) => ({ ...b, years: 0, weeksTotal: 0 }));
  if (eligible) {
    for (let k = 0; k < counted; k++) {
      const ageThen = age - k;
      const b = ageThen < 22 ? bands[0] : ageThen <= 40 ? bands[1] : bands[2];
      b.years += 1;
      b.weeksTotal += b.weeks;
    }
  }
  const weeks = bands.reduce((s, b) => s + b.weeksTotal, 0);
  const statutory = r2(weeks * capped);
  const uncapped = r2(weeks * weekly);
  const lostToCap = r2(uncapped - statutory);
  const maxStatutory = r2(MAX_YEARS * 1.5 * y.cap);
  const redundancyTotal = r2(statutory + extra);
  const taxFree = r2(Math.min(TAX_FREE_LIMIT, redundancyTotal));
  const taxableExcess = r2(Math.max(0, redundancyTotal - TAX_FREE_LIMIT));
  const taxableTotal = r2(taxableExcess + pilon);
  const headroom = r2(Math.max(0, TAX_FREE_LIMIT - redundancyTotal));
  const grand = r2(redundancyTotal + pilon);

  const findings = [];
  const obligations = [];
  if (!eligible) {
    findings.push({ severity: "high", title: `With ${service} complete ${service === 1 ? "year" : "years"} of service you are below the ${MIN_YEARS}-year minimum for statutory redundancy pay on these figures. Your contract or a company scheme may still pay something.` });
  } else {
    findings.push({ severity: "high", title: `Statutory redundancy pay on these figures is ${money(statutory)} (${weeks} ${weeks === 1 ? "week" : "weeks"} of ${money(capped)}).` });
    if (isCapped) findings.push({ severity: "medium", title: `Your weekly pay of ${money(weekly)} is above the ${money(y.cap)} cap, so the calculation uses ${money(y.cap)}. The cap costs you ${money(lostToCap)} compared with using your real pay.` });
    if (service > MAX_YEARS) findings.push({ severity: "medium", title: `Only the last ${MAX_YEARS} years of service count, so ${service - MAX_YEARS} ${service - MAX_YEARS === 1 ? "year" : "years"} do not add to the statutory amount.` });
    if (eligible) findings.push({ severity: "info", title: "Each year is paid at the rate for your age during that year, counting back from the dismissal date, which is why the weeks differ by band below." });
    if (extra > 0) findings.push({ severity: "info", title: `With the ${money(extra)} extra from your employer, redundancy pay is ${money(redundancyTotal)}.` });
  }
  if (redundancyTotal > TAX_FREE_LIMIT) findings.push({ severity: "high", title: `${money(taxableExcess)} of redundancy pay is above the ${money(TAX_FREE_LIMIT)} tax-free limit and is taxed as earnings. Ask payroll how it will be taxed and consider a pension contribution, which can reduce the bill.` });
  else if (redundancyTotal > 0) findings.push({ severity: "info", title: `All ${money(redundancyTotal)} of redundancy pay is within the ${money(TAX_FREE_LIMIT)} tax-free limit, leaving ${money(headroom)} of room.` });
  if (pilon > 0) findings.push({ severity: "medium", title: `Pay in lieu of notice of ${money(pilon)} is taxable as earnings and does not use the ${money(TAX_FREE_LIMIT)} tax-free limit.` });
  if (eligible && statutory === maxStatutory) findings.push({ severity: "info", title: `This is the maximum statutory amount: 30 weeks at the ${money(y.cap)} cap.` });
  findings.push({ severity: "info", title: "Not modelled: Northern Ireland, contractual or enhanced schemes, notice and holiday pay, the protective award, part-years of service, and anything that changed after this was written. Your contract can pay more than the statutory minimum but never less." });

  if (eligible) {
    obligations.push({ ref: "Written", title: "Ask for the calculation in writing", why: "Your employer must be able to show how the figure was reached: your age band by year, your service dates and the weekly pay used. Compare it with the weeks above." });
    obligations.push({ ref: "Pay", title: "Check which week's pay was used", why: "A week's pay is your gross pay for a normal week; if hours vary, it is usually an average over the 12 weeks before the calculation date. The cap applies after that." });
    obligations.push({ ref: "Claim", title: "Claim within six months if unpaid", why: "If your employer does not pay, you generally have six months from the end of your employment to claim to an employment tribunal; ACAS can explain early conciliation. If your employer is insolvent, the Redundancy Payments Service can pay the statutory amount." });
  }
  return { errors: [], label: y.label, year, age, service, counted, weekly, cap: y.cap, capped, isCapped, eligible, bands, weeks, statutory, uncapped, lostToCap, maxStatutory, extra, redundancyTotal, taxFree, taxableExcess, pilon, taxableTotal, headroom, grand, findings, obligations };
}

export const SAMPLE = { year: 2026, age: 47, service: 12, pay: 780, period: "week", extra: 0, pilon: 0 };

export function summaryText(r) {
  const L = [`UK statutory redundancy pay, ${r.label}`, "", `Age ${r.age}, ${r.service} complete years of service`, `Weekly pay used: ${money(r.capped)}${r.isCapped ? ` (capped; real pay ${money(r.weekly)})` : ""}`, "", `Eligible for statutory redundancy pay: ${r.eligible ? "yes" : "no"}`];
  if (r.eligible) {
    for (const b of r.bands) if (b.years) L.push(`${b.label}: ${b.years} ${b.years === 1 ? "year" : "years"} x ${b.weeks} = ${b.weeksTotal} weeks`);
    L.push(`Total weeks: ${r.weeks}`, `Statutory redundancy pay: ${money(r.statutory)}`);
  }
  if (r.extra) L.push(`Extra redundancy pay: ${money(r.extra)}`);
  L.push(`Tax-free part of redundancy pay: ${money(r.taxFree)}`, `Redundancy pay above the limit (taxable): ${money(r.taxableExcess)}`);
  if (r.pilon) L.push(`Pay in lieu of notice (taxable): ${money(r.pilon)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not legal or tax advice. No warranty.");
  return L.join("\n");
}
