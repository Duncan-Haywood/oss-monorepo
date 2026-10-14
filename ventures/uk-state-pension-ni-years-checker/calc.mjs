// UK new State Pension: qualifying years, State Pension age, and whether buying
// voluntary Class 3 National Insurance years pays back. Pure functions, no I/O.
// Rates written from memory without a live lookup; every one is overridable on the page.

export const FULL_WEEKLY_2026 = 241.3; // full new State Pension, 2026/27
export const CLASS3_YEAR_COST = 923; // Class 3 for one year at the 2025/26 weekly rate (17.75 x 52)
export const FULL_YEARS = 35;
export const MIN_YEARS = 10;

export const SAMPLE = {
  dob: "1975-06-15",
  today: "2026-10-14",
  currentYears: "18",
  futureYears: "",
  gapYears: "4",
  yearCost: "923",
  fullRate: "241.30",
  forecast: "",
  lifeTo: "85",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[£,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

// Date-only parsing so a time zone can never move a birthday.
export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d, t: dt.getTime() };
}
const ymdKey = (p) => p.y * 10000 + p.m * 100 + p.d;

// State Pension age for someone born on or after 6 April 1960 (Pensions Act 1995/2007/2014 timetable;
// the rise to 68 for those born after 5 April 1978 is legislated but under review).
// Returns { years, months } or null when the date is before the table this tool covers.
export function statePensionAge(dob) {
  const k = ymdKey(dob);
  if (k < 19600406) return null;
  if (k <= 19610305) {
    // 66 and 1 month .. 66 and 11 months, one extra month per birth month starting 6 April 1960
    const monthsSince = (dob.y - 1960) * 12 + (dob.m - 4) - (dob.d < 6 ? 1 : 0);
    return { years: 66, months: Math.min(11, monthsSince + 1) };
  }
  if (k <= 19770405) return { years: 67, months: 0 };
  if (k <= 19780405) {
    const monthsSince = (dob.y - 1977) * 12 + (dob.m - 4) - (dob.d < 6 ? 1 : 0);
    return { years: 67, months: Math.min(11, monthsSince + 1) };
  }
  return { years: 68, months: 0 };
}

export function addAge(dob, age) {
  const total = dob.m - 1 + age.months;
  const y = dob.y + age.years + Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(dob.d, last) };
}

// Tax years (6 April to 5 April) from `today` up to and including the one containing `spaDate`
// minus one: the last year you can build is the tax year before the one in which SPA is reached.
export function taxYearsToSpa(today, spaDate) {
  const startYear = (p) => (ymdKey(p) >= p.y * 10000 + 406 ? p.y : p.y - 1);
  const first = startYear(today);
  const spaYear = startYear(spaDate);
  return Math.max(0, spaYear - first);
}

function weeklyFor(years, full) {
  if (years < MIN_YEARS) return 0;
  return full * Math.min(years, FULL_YEARS) / FULL_YEARS;
}

export function compute(input) {
  const errors = [];
  const dob = parseDate(input.dob);
  const today = parseDate(input.today);
  if (!dob) errors.push("Enter your date of birth.");
  if (!today) errors.push("Enter today's date as year-month-day.");
  const current = num(input.currentYears);
  if (current === null || Number.isNaN(current) || current < 0 || current > 60 || !Number.isInteger(current)) errors.push("Enter your qualifying years so far as a whole number from your GOV.UK State Pension forecast.");
  const gap = num(input.gapYears) ?? 0;
  if (Number.isNaN(gap) || gap < 0 || gap > 6 || !Number.isInteger(gap)) errors.push("Fillable gap years must be a whole number from 0 to 6: voluntary contributions only reach back six tax years.");
  const yearCost = num(input.yearCost) ?? CLASS3_YEAR_COST;
  if (Number.isNaN(yearCost) || yearCost <= 0) errors.push("Cost of one voluntary year must be a positive amount.");
  const full = num(input.fullRate) ?? FULL_WEEKLY_2026;
  if (Number.isNaN(full) || full <= 0) errors.push("Full weekly State Pension must be a positive amount.");
  const lifeTo = num(input.lifeTo) ?? 85;
  if (Number.isNaN(lifeTo) || lifeTo < 60 || lifeTo > 110) errors.push("Plan-to age must be between 60 and 110.");
  const futureIn = num(input.futureYears);
  if (Number.isNaN(futureIn) || (futureIn !== null && (futureIn < 0 || futureIn > 50 || !Number.isInteger(futureIn)))) errors.push("Future years must be a whole number, or left blank.");
  const forecast = num(input.forecast);
  if (Number.isNaN(forecast) || (forecast !== null && (forecast <= 0 || forecast > 1000))) errors.push("Forecast weekly amount must be a positive number, or left blank.");
  if (errors.length) return { errors };

  const spa = statePensionAge(dob);
  const findings = [];
  if (!spa) {
    return { errors: ["This tool covers people born on or after 6 April 1960. For earlier birth dates, State Pension age and the rules differ: use the GOV.UK 'Check your State Pension age' and forecast tools."] };
  }
  const spaDate = addAge(dob, spa);
  if (ymdKey(spaDate) <= ymdKey(today)) {
    return { errors: ["You have reached State Pension age, so new qualifying years cannot be added by work; use your GOV.UK forecast or claim service instead."] };
  }
  const yearsLeft = taxYearsToSpa(today, spaDate);
  const future = futureIn === null ? yearsLeft : Math.min(futureIn, 50);
  const projected = current + future;
  const projectedCapped = Math.min(projected, FULL_YEARS);

  // What the forecast says today, when given, overrides the 35ths model for the current record
  // (people with years before April 2016 get a "starting amount" this tool cannot rebuild).
  const base = forecast !== null ? Math.min(forecast, full) : weeklyFor(projectedCapped, full);
  const perYear = full / FULL_YEARS;
  const room = Math.max(0, FULL_YEARS - projected);
  const buy = Math.min(gap, room);
  // The minimum of 10: years bought that move you from <10 to >=10 unlock the whole 10/35 entitlement.
  let after;
  if (forecast !== null) after = Math.min(full, base + buy * perYear);
  else after = weeklyFor(Math.min(projected + buy, FULL_YEARS), full);
  const extraWeekly = Math.max(0, after - base);
  const extraYearly = extraWeekly * 52;
  const cost = buy * yearCost;
  const paybackYears = extraYearly > 0 ? cost / extraYearly : null;
  const spaAgeYears = spa.years + spa.months / 12;
  const breakEvenAge = paybackYears === null ? null : spaAgeYears + paybackYears;
  const yearsInPayment = Math.max(0, lifeTo - spaAgeYears);
  const lifetimeGain = extraYearly * yearsInPayment - cost;

  const perBoughtYearWeekly = buy > 0 ? extraWeekly / buy : perYear;

  if (projected >= FULL_YEARS) {
    findings.push({ severity: "info", title: `On your numbers you reach ${FULL_YEARS} qualifying years without buying any: extra years add nothing, so a voluntary year is wasted money.` });
  } else if (gap === 0) {
    findings.push({ severity: "info", title: "You said no recent gap years can be filled. Check your National Insurance record on GOV.UK for years with too few contributions or credits." });
  } else {
    if (forecast === null && current < MIN_YEARS && current + future < MIN_YEARS && current + future + buy >= MIN_YEARS) {
      findings.push({ severity: "high", title: `Buying ${buy} year${buy === 1 ? "" : "s"} takes you to the ${MIN_YEARS}-year minimum, below which no new State Pension is paid at all. This is the most valuable case.` });
    }
    if (paybackYears !== null && paybackYears <= 5) findings.push({ severity: "high", title: `Each bought year costs about ${gbp(yearCost)} and adds about ${gbp(perBoughtYearWeekly * 52)} a year for life: it pays back in roughly ${paybackYears.toFixed(1)} years of pension.` });
    else if (paybackYears !== null) findings.push({ severity: "medium", title: `Payback is about ${paybackYears.toFixed(1)} years of pension, which is slower than usual: check the cost and your forecast figure.` });
  }
  if (buy < gap && room < gap && projected < FULL_YEARS) findings.push({ severity: "info", title: `Only ${buy} of your ${gap} gap years are worth buying; more than ${FULL_YEARS} total years adds nothing.` });
  if (forecast === null && (dob.y < 1970)) findings.push({ severity: "info", title: "Years before April 2016 are converted into a 'starting amount' that this simple count cannot rebuild. Enter your GOV.UK forecast weekly figure for a closer answer." });
  findings.push({ severity: "info", title: "Pension Credit and other means-tested benefits can reduce or cancel the gain from a higher State Pension. Check before you pay." });
  findings.push({ severity: "info", title: "If you are self-employed with profits above the small profits threshold, Class 2 credits can cost far less than Class 3 for the same year." });

  return {
    errors: [], findings, spa, spaDate, yearsLeft, future, projected, projectedCapped,
    gap, buy, room, yearCost, cost: r2(cost), full, perYear: r2(perYear),
    base: r2(base), after: r2(after), extraWeekly: r2(extraWeekly), extraYearly: r2(extraYearly),
    paybackYears, breakEvenAge, lifeTo, lifetimeGain: r2(lifetimeGain), usedForecast: forecast !== null,
  };
}

function gbp(n) {
  return "£" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const pad = (n) => String(n).padStart(2, "0");
export function dateText(p) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${p.d} ${months[p.m - 1]} ${p.y}`;
}

// Deadline to pay for a gap year: 5 April six years after the end of that tax year.
export function gapDeadlines(today) {
  const cur = ymdKey(today) >= today.y * 10000 + 406 ? today.y : today.y - 1; // start year of current tax year
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const start = cur - i;
    out.push({ year: `${start}/${pad((start + 1) % 100)}`, deadline: `5 April ${start + 7}` });
  }
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push("UK State Pension: is buying National Insurance years worth it?");
  L.push(`State Pension age ${r.spa.years}${r.spa.months ? ` and ${r.spa.months} months` : ""} (${dateText(r.spaDate)})`);
  L.push(`Qualifying years projected at State Pension age: ${r.projected}${r.projected > FULL_YEARS ? ` (only ${FULL_YEARS} count)` : ""}`);
  L.push(`Weekly State Pension without buying: ${gbp(r.base)}${r.usedForecast ? " (from your forecast)" : ""}`);
  L.push(`Years worth buying: ${r.buy} of ${r.gap} gap years, cost ${gbp(r.cost)}`);
  L.push(`Weekly State Pension after buying: ${gbp(r.after)} (extra ${gbp(r.extraWeekly)} a week, ${gbp(r.extraYearly)} a year)`);
  if (r.paybackYears !== null) L.push(`Payback: about ${r.paybackYears.toFixed(1)} years of pension, by age ${r.breakEvenAge.toFixed(1)}`);
  L.push(`Net gain if you live to ${r.lifeTo}: ${gbp(r.lifetimeGain)} before tax`);
  L.push("");
  for (const f of r.findings) L.push(`- ${f.title}`);
  L.push("");
  L.push("Estimate from published rules, not advice. Confirm on GOV.UK (State Pension forecast) and with the Future Pension Centre before paying.");
  return L.join("\n");
}
