// Severance package evaluator. Pure functions, nothing leaves the browser.
//
// Answers four questions a laid-off person has with a few days to sign:
//   1. Is the offer in the usual range for my tenure (benchmark weeks per year of service)?
//   2. What will I actually net, and does the payout shape (lump sum now, lump sum in January, salary continuation)
//      change the tax and the net?
//   3. What is at risk beside the cash: health coverage, unemployment benefits, unvested equity, paid time off?
//   4. What should I ask for before signing?
// Tax rates are inputs (the tool has no bracket table to go stale): supplemental federal withholding on a lump sum is
// 22% up to $1M of supplemental wages in the year, 37% above; the real tax is at your marginal rate, so the difference
// is a refund or a bill at filing.

export const SUPPLEMENTAL_RATE = 0.22;
export const SUPPLEMENTAL_RATE_OVER_1M = 0.37;
export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;

export const DEFAULTS = {
  annualSalary: 120000,
  yearsService: 6,
  offeredWeeks: 8,
  benchmarkWeeksPerYear: 2,
  age: 45,
  ptoDays: 12,
  ptoPaidOutByLaw: true,
  proRataBonus: 0,
  equityAcceleratedValue: 0,
  ytdWages: 90000,
  ssWageBase: 184500,
  weeksLeftInYear: 12,
  fedRateThisYear: 24,
  fedRateNextYear: 22,
  stateRate: 5,
  cobraMonthly: 2100,
  employerPaidMonthly: 1400,
  coveredMonths: 3,
  weeklyUnemployment: 600,
  monthlyExpenses: 5500,
  savings: 20000,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

// Typical packages run about one to two weeks of pay per year of service, often with a floor of several weeks. This is
// a rule of thumb the user can change, not a legal entitlement.
export function benchmark(o) {
  const low = o.yearsService * 1;
  const mid = o.yearsService * o.benchmarkWeeksPerYear;
  const high = o.yearsService * 3;
  return { low, mid, high, gapWeeks: Math.max(0, mid - o.offeredWeeks), gapPay: Math.max(0, mid - o.offeredWeeks) * o.annualSalary / 52 };
}

// Employee FICA on an amount paid after ytdWages of earlier pay in the same calendar year.
export function fica(amount, ytdWages, ssWageBase) {
  const ss = SS_RATE * Math.max(0, Math.min(amount, ssWageBase - ytdWages));
  return ss + MEDICARE_RATE * amount;
}

// Tax on one chunk of pay in one calendar year at a given federal marginal rate.
function chunk(amount, ytd, o, fedRate) {
  const f = fica(amount, ytd, o.ssWageBase);
  const fed = amount * fedRate / 100;
  const st = amount * o.stateRate / 100;
  return { gross: amount, fica: f, fed, state: st, net: amount - f - fed - st };
}

// The three payout shapes for the same gross.
export function shapes(o, gross) {
  const supp = (amt) => (amt <= 1e6 ? amt * SUPPLEMENTAL_RATE : 1e6 * SUPPLEMENTAL_RATE + (amt - 1e6) * SUPPLEMENTAL_RATE_OVER_1M);
  const lumpNow = chunk(gross, o.ytdWages, o, o.fedRateThisYear);
  lumpNow.withheld = supp(gross) + lumpNow.fica + lumpNow.gross * o.stateRate / 100;
  lumpNow.fedWithheld = supp(gross);
  lumpNow.filingGap = lumpNow.fed - lumpNow.fedWithheld; // positive: you owe at filing; negative: refund
  const lumpJan = chunk(gross, 0, o, o.fedRateNextYear);
  lumpJan.fedWithheld = supp(gross);
  lumpJan.filingGap = lumpJan.fed - lumpJan.fedWithheld;
  const weeklyGross = o.annualSalary / 52;
  const weeks = gross / weeklyGross;
  const thisYearWeeks = Math.min(weeks, Math.max(0, o.weeksLeftInYear));
  const part1 = chunk(thisYearWeeks * weeklyGross, o.ytdWages, o, o.fedRateThisYear);
  const part2 = chunk(Math.max(0, gross - thisYearWeeks * weeklyGross), 0, o, o.fedRateNextYear);
  const cont = { gross, fica: part1.fica + part2.fica, fed: part1.fed + part2.fed, state: part1.state + part2.state, net: part1.net + part2.net, thisYear: part1.gross, nextYear: part2.gross };
  return { lumpNow, lumpJan, continuation: cont };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[k] === "number" && !Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (typeof DEFAULTS[k] === "number" && o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  for (const k of ["fedRateThisYear", "fedRateNextYear", "stateRate"]) if (o[k] > 100) warnings.push(`${k} cannot exceed 100.`);
  if (o.annualSalary === 0) warnings.push("annualSalary must be above zero.");
  if (warnings.length) return { opts: o, warnings, result: null };

  const weekly = o.annualSalary / 52;
  const bench = benchmark(o);
  const severance = o.offeredWeeks * weekly;
  const pto = o.ptoPaidOutByLaw ? o.ptoDays * o.annualSalary / 260 : 0;
  // PTO payout, pro-rata bonus and accelerated equity are paid or vest on separation regardless of the payout shape.
  const alwaysPaid = pto + o.proRataBonus + o.equityAcceleratedValue;
  const sh = shapes(o, severance);
  const alwaysPaidTax = chunk(alwaysPaid, o.ytdWages, o, o.fedRateThisYear);

  // Health coverage: the gap is the COBRA premium the person pays beyond what the employer used to pay, for the months
  // covered by the package. A negotiated COBRA subsidy is worth the employer's share per month times the months.
  const healthPerMonthGap = Math.max(0, o.cobraMonthly - o.employerPaidMonthly);
  const subsidyValue = o.coveredMonths * Math.max(0, o.cobraMonthly - healthPerMonthGap);

  // Unemployment at risk: states differ. Some treat severance as wages for the weeks it covers and delay benefits.
  const atRisk = Math.round(o.offeredWeeks) * o.weeklyUnemployment;

  // Runway
  const bestNet = Math.max(sh.lumpNow.net, sh.lumpJan.net, sh.continuation.net);
  const cash = o.savings + bestNet + alwaysPaidTax.net;
  const monthly = o.monthlyExpenses + healthPerMonthGap;
  const runwayMonths = monthly > 0 ? cash / monthly : Infinity;
  const runwayMonthsNoSeverance = monthly > 0 ? (o.savings + alwaysPaidTax.net) / monthly : Infinity;

  // The signature clause and timing checklist, driven by age.
  const olderWorker = o.age >= 40;
  const checklist = [
    olderWorker ? "You are 40 or older: a waiver of age-discrimination claims must give you at least 21 days to consider (45 days for a group layoff) and 7 days to revoke after signing (OWBPA). Do not sign early because you were told to." : "Ask how long you have to sign, and get the deadline in writing.",
    "Ask for the severance in writing with the exact amount, the pay schedule and what ends the payments (new job, breach, death).",
    "Ask for COBRA premiums to be paid for the months you need, or a lump sum equal to them.",
    "Ask whether unvested equity vests through the notice period or accelerates, and for the exercise window on vested options.",
    "Ask for a neutral reference, an agreed announcement and the reason code the company gives the unemployment agency.",
    "Read the release, non-compete, non-disparagement and clawback terms. Ask for any non-compete to be released or narrowed in return for your signature.",
    "Check whether accrued PTO is paid out in your state (many states require it) and when the final paycheck is due.",
    "Have an employment lawyer read it before you sign if the release is broad or the amount is large. Many offer a short flat-fee review.",
  ];

  return {
    opts: o, warnings, result: true, weekly, benchmark: bench, severance, pto, alwaysPaid, alwaysPaidNet: alwaysPaidTax.net,
    shapes: sh, bestShape: sh.lumpNow.net >= sh.lumpJan.net && sh.lumpNow.net >= sh.continuation.net ? "lumpNow" : sh.lumpJan.net >= sh.continuation.net ? "lumpJan" : "continuation",
    healthPerMonthGap, subsidyValue, atRisk, cash, runwayMonths, runwayMonthsNoSeverance, checklist,
    totalGross: severance + alwaysPaid,
    inRange: o.offeredWeeks >= bench.low,
    verdict: o.offeredWeeks < bench.low ? "below" : o.offeredWeeks < bench.mid ? "low-mid" : o.offeredWeeks <= bench.high ? "at-or-above" : "high",
  };
}

export function toCsv(a) {
  const rows = [["item", "usd"], ["Severance gross", a.severance], ["PTO, bonus and equity paid on separation (gross)", a.alwaysPaid],
    ["Net if lump sum paid this year", a.shapes.lumpNow.net], ["Net if lump sum paid in January", a.shapes.lumpJan.net], ["Net if paid as salary continuation", a.shapes.continuation.net],
    ["Benchmark weeks (mid)", a.benchmark.mid], ["Value of weeks below benchmark", a.benchmark.gapPay], ["Monthly health premium gap", a.healthPerMonthGap],
    ["Runway in months", Number.isFinite(a.runwayMonths) ? a.runwayMonths : 0]];
  return rows.map((x) => [x[0].replace(/,/g, ""), typeof x[1] === "number" ? x[1].toFixed(2) : x[1]].join(",")).join("\n") + "\n";
}

// ---- Dates: signing, revocation, vesting and notice deadlines ----------------------------------------------------
// Separate from DEFAULTS (all numbers) because these are optional calendar dates typed as YYYY-MM-DD.
const DAY = 86400000;
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}
export const isoDate = (d) => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * DAY);

// raw: { releaseReceived, separationDate, nextVestDate, groupProgram, largeEmployerLayoff, age }
// Returns dated rows, soonest first. The 21/45/7-day periods are the federal OWBPA minimums for a waiver of age-discrimination
// claims at 40 and over; shorter periods can be accepted voluntarily, so the first date is the earliest the company may require you to sign.
export function dates(raw = {}) {
  const received = parseDate(raw.releaseReceived), sep = parseDate(raw.separationDate), vest = parseDate(raw.nextVestDate);
  const age = num(raw.age);
  const rows = [], asks = [];
  if (received && age >= 40) {
    const days = raw.groupProgram ? 45 : 21;
    const signBy = plus(received, days);
    rows.push({ date: signBy, label: `Review period ends (${days} days; ${raw.groupProgram ? "group exit program" : "individual release"}, age 40+). The company cannot require a signature before this`, critical: true });
    rows.push({ date: plus(signBy, 7), label: "If you sign on the last day, the 7-day revocation window ends here. The release is not effective, and severance is not owed, before this", critical: false });
  } else if (received) {
    rows.push({ date: received, label: "Release received. Under 40 there is no federal minimum: ask in writing how long you have to sign", critical: false });
  }
  if (sep) rows.push({ date: sep, label: "Separation date (last day on payroll)", critical: false });
  if (sep) rows.push({ date: plus(sep, 60), label: "COBRA election: you have at least 60 days from the later of losing coverage or getting the election notice. Watch for the notice", critical: false });
  let vestGapDays = null;
  if (sep && vest) {
    vestGapDays = Math.round((vest - sep) / DAY);
    if (vestGapDays > 0) {
      rows.push({ date: vest, label: `Next equity vest, ${vestGapDays} days after your last day (forfeited unless the agreement accelerates it)`, critical: vestGapDays <= 90 });
      if (vestGapDays <= 90) asks.push(`Your last day is ${vestGapDays} days before a vest. Ask to move the separation date past ${isoDate(vest)}, or to accelerate that tranche. Ask to extend the exercise window on vested options beyond 90 days.`);
    }
  }
  if (raw.largeEmployerLayoff && received && sep) {
    const notice = Math.round((sep - received) / DAY);
    if (notice < 60) {
      rows.push({ date: sep, label: `Only ${Math.max(0, notice)} days between notice and last day. The federal WARN Act can require 60 days of notice or pay for mass layoffs at employers with 100 or more employees; ask HR whether it applies`, critical: true });
      asks.push("Ask whether the layoff is covered by the WARN Act (60 days of notice or pay) and whether the severance is in addition to it.");
    }
  }
  rows.sort((a, b) => a.date - b.date);
  return { rows, asks, vestGapDays };
}

export function calendarIcs(rows, name = "Severance") {
  const ev = rows.map((c, i) => {
    const d = isoDate(c.date).replace(/-/g, ""), n = isoDate(plus(c.date, 1)).replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:sev-${i}-${d}@severance-package-calculator`, "DTSTAMP:20260101T000000Z", `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${n}`, `SUMMARY:${(name + ": " + c.label).replace(/[,;\n]/g, " ").slice(0, 120)}`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//severance-package-calculator//EN", ...ev, "END:VCALENDAR", ""].join("\r\n");
}
