// Social Security retirement earnings test worksheet. Pure functions, no network, no DOM.
// Rule (SSA, 20 CFR 404.415-404.435): a person who takes retirement benefits before full retirement age (FRA) and keeps
// working has benefits withheld: $1 for every $2 of earnings over the annual limit in each year before the year they
// reach FRA, and $1 for every $3 over a higher limit in the year they reach FRA (counting only earnings, and only
// months, before the month of FRA). SSA withholds whole monthly benefits, and pays back any over-withholding after the
// year ends. Months withheld are not lost: at FRA the benefit is recomputed as if those months had not been claimed
// early (20 CFR 404.412). The limits change every year, so both are inputs with the 2026 figures as defaults.

export const LIMITS_2026 = { low: 24480, high: 65160 };

export const SAMPLE = {
  birthDate: "1963-06-15",
  claimMonth: "2026-01",
  startYear: 2026,
  pia: 2400,
  earnings: 55000,
  limitLow: LIMITS_2026.low,
  limitHigh: LIMITS_2026.high,
  freeMonths: 0,
};

export const dollars = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

const num = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(String(v).replace(/[$,\s]/g, ""));
};

export function parseDate(text) {
  const s = String(text ?? "").trim();
  let y, m, d;
  let t = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (t) [y, m, d] = [t[1], t[2], t[3]];
  else if ((t = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [t[1], t[2], t[3]];
  else return null;
  y = +y; m = +m; d = +d;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function parseMonth(text) {
  const s = String(text ?? "").trim();
  let t = /^(\d{4})-(\d{1,2})$/.exec(s);
  let y, m;
  if (t) [y, m] = [+t[1], +t[2]];
  else if ((t = /^(\d{1,2})\/(\d{4})$/.exec(s))) [m, y] = [+t[1], +t[2]];
  else return null;
  return m >= 1 && m <= 12 ? { y, m } : null;
}

const idx = (y, m) => y * 12 + (m - 1);
const fromIdx = (i) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
export const monthLabel = (i) => { const { y, m } = fromIdx(i); return `${y}-${String(m).padStart(2, "0")}`; };

// Full retirement age in months, by year of birth (SSA table). 1960 and later: 67.
export function fraMonthsFor(birthYear) {
  if (birthYear <= 1937) return 65 * 12;
  if (birthYear <= 1942) return 65 * 12 + (birthYear - 1937) * 2;
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear <= 1959) return 66 * 12 + (birthYear - 1954) * 2;
  return 67 * 12;
}

// Month index in which the person reaches FRA. Age is attained the day before the birthday, so a person born on the
// 1st reaches it in the previous month.
export function fraMonthIndex(birth) {
  return idx(birth.y, birth.m) + fraMonthsFor(birth.y) - (birth.d === 1 ? 1 : 0);
}

// First month a person can be entitled to retirement benefits (62 throughout the month; born the 1st or 2nd counts
// from the birth month).
export const firstEligibleIndex = (birth) => idx(birth.y, birth.m) + 62 * 12 + (birth.d <= 2 ? 0 : 1);

// Early-claiming reduction: 5/9 of 1% per month for the first 36 months, 5/12 of 1% per month after that.
export function reductionFactor(monthsEarly) {
  const m = Math.max(0, monthsEarly);
  return (Math.min(36, m) * (5 / 9) + Math.max(0, m - 36) * (5 / 12)) / 100;
}

export function parse(raw) {
  const errors = [];
  const birth = parseDate(raw.birthDate);
  if (!birth) errors.push("Enter the date of birth (YYYY-MM-DD or M/D/YYYY).");
  const claim = parseMonth(raw.claimMonth);
  if (!claim) errors.push("Enter the first month of retirement benefits (YYYY-MM).");
  const pia = num(raw.pia);
  if (!(pia > 0)) errors.push("Enter the monthly benefit at full retirement age (the PIA from your my Social Security statement), more than zero.");
  const earnings = raw.earnings === "" || raw.earnings == null ? NaN : num(raw.earnings);
  if (!(earnings >= 0)) errors.push("Enter the yearly earnings you expect (wages plus net self-employment income), zero or more.");
  const limitLow = num(raw.limitLow), limitHigh = num(raw.limitHigh);
  if (!(limitLow > 0)) errors.push("Enter the annual earnings limit for years before the year you reach full retirement age.");
  if (!(limitHigh > 0)) errors.push("Enter the higher annual limit for the year you reach full retirement age.");
  const startYear = raw.startYear === "" || raw.startYear == null ? (claim ? claim.y : NaN) : num(raw.startYear);
  if (!(startYear >= 2000 && startYear <= 2100)) errors.push("Enter the first calendar year to test (for example 2026).");
  const freeMonths = raw.freeMonths === "" || raw.freeMonths == null ? 0 : num(raw.freeMonths);
  if (!(freeMonths >= 0 && freeMonths <= 11 && Number.isInteger(freeMonths))) errors.push("Months with pay under the monthly limit in the first year must be a whole number from 0 to 11.");
  let fraIdx = null, claimIdx = null;
  if (birth && claim) {
    fraIdx = fraMonthIndex(birth);
    claimIdx = idx(claim.y, claim.m);
    if (claimIdx < firstEligibleIndex(birth)) errors.push(`Retirement benefits cannot start before age 62 (${monthLabel(firstEligibleIndex(birth))} for this birth date).`);
    else if (claimIdx >= fraIdx) errors.push(`Benefits starting ${monthLabel(claimIdx)} start at or after full retirement age (${monthLabel(fraIdx)}), so no earnings test applies.`);
  }
  return { errors, input: { birth, claim, claimIdx, fraIdx, pia, earnings, limitLow, limitHigh, startYear, freeMonths } };
}

// One calendar year of the test. `earn` is the earnings that count in that year.
export function yearResult({ months, benefit, earn, limit, divisor, freeMonths }) {
  const excess = Math.max(0, earn - limit);
  const required = excess / divisor;
  const available = Math.max(0, months - freeMonths);
  const wanted = required > 0 ? Math.ceil(required / benefit - 1e-9) : 0;
  const withheldMonths = Math.min(available, wanted);
  const withheldGross = withheldMonths * benefit;
  const refund = Math.max(0, withheldGross - required);
  const netLost = withheldGross - refund;
  return { excess, required, withheldMonths, withheldGross, refund, netLost, paid: months * benefit - withheldGross + refund, entitled: months * benefit };
}

export function compute(raw) {
  const { errors, input } = parse(raw);
  if (errors.length) return { errors, findings: [], years: [], sweep: [], s: null };
  const { birth, claim, claimIdx, fraIdx, pia, earnings, limitLow, limitHigh, startYear, freeMonths } = input;
  const monthsEarly = fraIdx - claimIdx;
  const benefit = pia * (1 - reductionFactor(monthsEarly));
  const fra = fromIdx(fraIdx);
  const yearsOut = [];
  for (let y = Math.max(claim.y, startYear); y <= fra.y; y++) {
    const first = y === claim.y ? claim.m : 1;
    const last = y === fra.y ? fra.m - 1 : 12;
    if (last < first) continue;
    const months = last - first + 1;
    const isFraYear = y === fra.y;
    // Earnings are the same every full year; in the FRA year only those before the FRA month count, assumed even.
    const earn = isFraYear ? (earnings * months) / 12 : earnings;
    const free = y === claim.y ? Math.min(freeMonths, months) : 0;
    const r = yearResult({ months, benefit, earn, limit: isFraYear ? limitHigh : limitLow, divisor: isFraYear ? 3 : 2, freeMonths: free });
    yearsOut.push({ year: y, months, earn, limit: isFraYear ? limitHigh : limitLow, ratio: isFraYear ? "1 for 3" : "1 for 2", free, ...r });
  }
  const totals = yearsOut.reduce((a, y) => ({ months: a.months + y.withheldMonths, netLost: a.netLost + y.netLost, paid: a.paid + y.paid, entitled: a.entitled + y.entitled }), { months: 0, netLost: 0, paid: 0, entitled: 0 });
  const adjEarly = Math.max(0, monthsEarly - totals.months);
  const newBenefit = pia * (1 - reductionFactor(adjEarly));
  const raise = newBenefit - benefit;
  const recoupMonths = raise > 0 && totals.netLost > 0 ? totals.netLost / raise : null;
  const recoupIdx = recoupMonths == null ? null : fraIdx + Math.ceil(recoupMonths);
  const recoupAge = recoupMonths == null ? null : (fraMonthsFor(birth.y) + Math.ceil(recoupMonths)) / 12;

  // Sensitivity: the first tested year at different earnings levels.
  const y0 = yearsOut[0];
  const sweep = [];
  let fullStop = null;
  if (y0) {
    const base = y0.year === fra.y ? (y0.months / 12) : 1;
    const div = y0.ratio === "1 for 3" ? 3 : 2;
    const levels = [0, y0.limit, y0.limit + 5000, y0.limit + 10000, y0.limit + 20000, y0.limit + 30000, y0.limit + 50000, y0.limit + 80000, y0.limit + 120000];
    for (const annual of levels) {
      const r = yearResult({ months: y0.months, benefit, earn: annual * base, limit: y0.limit, divisor: div, freeMonths: y0.free });
      sweep.push({ annual, ...r });
    }
    fullStop = (y0.limit + (Math.max(0, y0.months - y0.free) * benefit * div)) / base;
  }

  const findings = [];
  if (totals.months > 0) findings.push({ severity: "high", title: `${totals.months} month(s) of benefits are withheld across ${yearsOut.length} year(s), a net ${dollars(totals.netLost)} held back from ${dollars(totals.entitled)} otherwise payable.` });
  else findings.push({ severity: "info", title: "On these figures earnings stay under the limit, so no benefits are withheld." });
  if (raise > 0) findings.push({ severity: "info", title: `The withheld months are credited at full retirement age: the monthly benefit rises from ${dollars(benefit)} to ${dollars(newBenefit)} (+${dollars(raise)}), which repays the withheld ${dollars(totals.netLost)} in about ${Math.ceil(recoupMonths)} month(s) after FRA.` });
  if (y0 && y0.withheldMonths === Math.max(0, y0.months - y0.free) && y0.withheldMonths > 0 && y0.required > y0.withheldGross) findings.push({ severity: "medium", title: `In ${y0.year} earnings are high enough that every payable month is withheld. Earnings above ${dollars(fullStop)} would not withhold anything more.` });
  if (y0 && y0.refund > 0) findings.push({ severity: "info", title: `Because whole months are withheld, ${dollars(y0.refund)} of ${y0.year}'s withholding is over-withheld and is normally paid back after the year ends.` });
  if (claim.y >= startYear && freeMonths === 0 && claim.m > 1) findings.push({ severity: "medium", title: "In the first year of benefits, any month with pay at or under the monthly limit (and no substantial self-employment work) is paid in full whatever the annual total. Enter those months to see the effect." });
  if (fra.y - Math.max(claim.y, startYear) > 3) findings.push({ severity: "info", title: "Limits rise with wages each year; this projection holds them flat and holds your earnings flat, so later years are rough." });
  findings.push({ severity: "medium", title: "Only earnings from work count (wages, and net self-employment income). Pensions, investment income, rental income and other Social Security do not." });

  return { errors: [], input, monthsEarly, benefit, newBenefit, raise, recoupMonths, recoupIdx, recoupAge, years: yearsOut, totals, adjEarly, fra, sweep, fullStop, findings, s: { benefit } };
}

export function summaryText(r) {
  const { input } = r;
  const L = [];
  L.push("SOCIAL SECURITY EARNINGS TEST WORKSHEET (arithmetic on the figures entered; not advice)");
  L.push(`Born ${input.birth.y}-${String(input.birth.m).padStart(2, "0")}-${String(input.birth.d).padStart(2, "0")}; full retirement age reached in ${monthLabel(input.fraIdx)}`);
  L.push(`Benefits start ${monthLabel(input.claimIdx)}, ${r.monthsEarly} month(s) early; benefit at FRA ${dollars(input.pia)}, payable now ${dollars(r.benefit)} a month`);
  L.push(`Expected earnings: ${dollars(input.earnings)} a year; limits ${dollars(input.limitLow)} (before the FRA year) and ${dollars(input.limitHigh)} (FRA year)`);
  L.push("");
  L.push("Year  Months  Earnings counted  Limit     Withheld months  Net withheld");
  for (const y of r.years) L.push(`${y.year}  ${String(y.months).padStart(6)}  ${dollars(y.earn).padStart(16)}  ${dollars(y.limit).padStart(8)}  ${String(y.withheldMonths).padStart(15)}  ${dollars(y.netLost).padStart(12)}`);
  L.push("");
  L.push(`Total withheld: ${r.totals.months} month(s), net ${dollars(r.totals.netLost)} of ${dollars(r.totals.entitled)} payable`);
  L.push(`At FRA the benefit is recomputed with ${r.adjEarly} month(s) of early reduction instead of ${r.monthsEarly}: ${dollars(r.benefit)} -> ${dollars(r.newBenefit)} a month`);
  if (r.recoupMonths != null) L.push(`The withheld amount is repaid by the higher benefit about ${Math.ceil(r.recoupMonths)} month(s) after FRA (around age ${r.recoupAge.toFixed(1)}).`);
  L.push("");
  L.push("Not decided here: your actual PIA and earnings record, spousal or survivor benefits on your record, taxes on benefits, Medicare premiums, COLAs and future limits, or whether to claim early.");
  return L.join("\n");
}

export function sweepCsv(r) {
  const out = ["annual_earnings,withheld_months,net_withheld,benefits_paid"];
  for (const x of r.sweep) out.push(`${Math.round(x.annual)},${x.withheldMonths},${Math.round(x.netLost)},${Math.round(x.paid)}`);
  return out.join("\n");
}
