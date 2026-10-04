// Form 5500 late-filing calculator.
//
// Plain date and money arithmetic. Every penalty figure is an editable constant
// in `DEFAULTS`, written from memory of the published programme and statute
// figures and stated as such on the page: they change (the DOL maximum is
// inflation-adjusted every year), so check them against current DOL and IRS
// guidance before relying on any output.
//
// The DOL civil-penalty figure is a per-day statutory MAXIMUM, shown as an
// "up to" ceiling. It is not a prediction of what the DOL would assess, and
// nothing here estimates the likelihood of any penalty.
//
// Nothing in this module touches the network or the DOM.

export const DEFAULTS = Object.freeze({
  // DOL Delinquent Filer Voluntary Compliance (DFVC) programme.
  dfvcPerDay: 10,
  dfvcCaps: Object.freeze({
    small: Object.freeze({ perReport: 750, perPlan: 1500 }),
    large: Object.freeze({ perReport: 2000, perPlan: 4000 }),
  }),
  // IRS late-filing penalty on the return (Internal Revenue Code section 6652(e)).
  irsPerDay: 250,
  irsMaxPerReturn: 150000,
  // DOL civil penalty (ERISA section 502(c)(2)) statutory maximum per day,
  // inflation-adjusted annually. Editable; verify the current figure.
  dolMaxPerDay: 2739,
  // A one-participant plan files no annual return while assets stay at or
  // below this at the end of the plan year.
  onePlanAssetThreshold: 250000,
  // Fewer than this many participants is a "small plan" for DFVC.
  smallPlanParticipants: 100,
  // Form 5558 extension: the 15th day of the month this many months after the
  // plan-year-end month (2.5 months past the normal due date).
  extensionMonth: 10,
  dueMonthOffset: 7,
});

export const PLAN_TYPES = Object.freeze({
  small: "Small plan (fewer than 100 participants)",
  large: "Large plan (100 or more participants)",
  one: "One-participant plan (owner and spouse only)",
});

// ---------- dates ----------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISO(s) {
  const m = ISO.exec(String(s ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function toISO(dt) {
  return dt.toISOString().slice(0, 10);
}

const DAY_MS = 86400000;

export function daysBetween(fromISO, toISOStr) {
  return Math.round((parseISO(toISOStr) - parseISO(fromISO)) / DAY_MS);
}

function addDays(iso, n) {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY_MS));
}

function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

export function weekday(iso) {
  return parseISO(iso).getUTCDay(); // 0 = Sunday
}

function nthWeekday(y, m0, wd, n) {
  const first = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(y, m0, wd) {
  const last = daysInMonth(y, m0);
  const lastWd = new Date(Date.UTC(y, m0, last)).getUTCDay();
  return last - ((lastWd - wd + 7) % 7);
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/**
 * U.S. federal legal holidays for a year, keyed by the day the office is
 * closed. A holiday on a Sunday is observed on the Monday; one on a Saturday
 * is left on the Saturday (already a weekend), not moved to Friday.
 * Inauguration Day is not modelled.
 */
export function federalHolidays(year) {
  const list = [
    [iso(year, 0, 1), "New Year's Day"],
    [iso(year, 0, nthWeekday(year, 0, 1, 3)), "Martin Luther King Jr. Day"],
    [iso(year, 1, nthWeekday(year, 1, 1, 3)), "Washington's Birthday"],
    [iso(year, 4, lastWeekday(year, 4, 1)), "Memorial Day"],
    [iso(year, 5, 19), "Juneteenth"],
    [iso(year, 6, 4), "Independence Day"],
    [iso(year, 8, nthWeekday(year, 8, 1, 1)), "Labor Day"],
    [iso(year, 9, nthWeekday(year, 9, 1, 2)), "Columbus Day"],
    [iso(year, 10, 11), "Veterans Day"],
    [iso(year, 10, nthWeekday(year, 10, 4, 4)), "Thanksgiving Day"],
    [iso(year, 11, 25), "Christmas Day"],
  ];
  const out = new Map();
  for (const [d, name] of list) {
    out.set(weekday(d) === 0 ? addDays(d, 1) : d, name);
  }
  return out;
}

export function nonBusinessReason(dateISO) {
  const wd = weekday(dateISO);
  if (wd === 6) return "Saturday";
  if (wd === 0) return "Sunday";
  const y = Number(dateISO.slice(0, 4));
  // An observed holiday can land in the next year (Dec 31 / Jan 1 edge), so
  // check the neighbouring years too.
  for (const yy of [y - 1, y, y + 1]) {
    const h = federalHolidays(yy).get(dateISO);
    if (h) return h;
  }
  return null;
}

export function isBusinessDay(dateISO) {
  return nonBusinessReason(dateISO) === null;
}

export function nextBusinessDay(dateISO) {
  let d = dateISO;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** Last day of the month `offset` months after the month of `dateISO`. */
export function endOfMonthAfter(dateISO, offset) {
  const dt = parseISO(dateISO);
  const idx = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + offset;
  const y = Math.floor(idx / 12), m0 = idx % 12;
  return iso(y, m0, daysInMonth(y, m0));
}

/** The 15th of the month `offset` months after the month of `dateISO`. */
export function fifteenthAfter(dateISO, offset) {
  const dt = parseISO(dateISO);
  const idx = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + offset;
  return iso(Math.floor(idx / 12), idx % 12, 15);
}

/** Same month and day `years` earlier, clamped (Feb 29 becomes Feb 28). */
export function minusYears(dateISO, years) {
  const dt = parseISO(dateISO);
  const y = dt.getUTCFullYear() - years, m0 = dt.getUTCMonth();
  return iso(y, m0, Math.min(dt.getUTCDate(), daysInMonth(y, m0)));
}

/**
 * Due date for one plan year. `extended` applies Form 5558 (2.5 months).
 * The raw date is the calendar date the rule produces; `due` is that date
 * rolled forward to the next business day.
 */
export function dueDate(planYearEnd, { extended = false } = {}, c = DEFAULTS) {
  if (!parseISO(planYearEnd)) throw new RangeError(`invalid plan year end: ${planYearEnd}`);
  const normalRaw = endOfMonthAfter(planYearEnd, c.dueMonthOffset);
  const raw = extended ? fifteenthAfter(planYearEnd, c.extensionMonth) : normalRaw;
  const due = nextBusinessDay(raw);
  return {
    normalRaw,
    normalDue: nextBusinessDay(normalRaw),
    raw,
    due,
    rolled: due !== raw,
    rolledReason: due !== raw ? nonBusinessReason(raw) : null,
  };
}

// ---------- money ----------

export function usd(n) {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${s}`;
}

// ---------- the calculation ----------

function clean(input) {
  const errors = [];
  const planYearEnd = String(input?.planYearEnd ?? "").trim();
  if (!parseISO(planYearEnd)) errors.push("Enter the plan year end as a real date (YYYY-MM-DD).");
  const filingDate = String(input?.filingDate ?? "").trim();
  if (!parseISO(filingDate)) errors.push("Enter the date you intend to file as a real date (YYYY-MM-DD).");
  const planType = String(input?.planType ?? "small");
  if (!Object.hasOwn(PLAN_TYPES, planType)) errors.push("Choose a plan type.");
  const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
  const assets = num(input?.assets ?? 0);
  if (!Number.isFinite(assets) || assets < 0) errors.push("Total assets must be zero or more.");
  const participants = num(input?.participants ?? 0);
  if (!Number.isInteger(participants) || participants < 0) errors.push("Participants must be a whole number, zero or more.");
  const yearsLate = num(input?.yearsLate ?? 1);
  if (!Number.isInteger(yearsLate) || yearsLate < 1 || yearsLate > 10) errors.push("Years of unfiled reports must be a whole number from 1 to 10.");
  return {
    errors,
    value: {
      planYearEnd, filingDate, planType, assets, participants, yearsLate,
      extensionFiled: Boolean(input?.extensionFiled),
    },
  };
}

/**
 * Per-report breakdown for the entered plan year and, when `yearsLate` > 1,
 * the earlier plan years still unfiled. Earlier years use the normal due date
 * (no extension is assumed for them).
 */
export function calculate(input, overrides = {}) {
  const c = { ...DEFAULTS, ...overrides, dfvcCaps: { ...DEFAULTS.dfvcCaps, ...(overrides.dfvcCaps || {}) } };
  const { errors, value } = clean(input);
  if (errors.length) return { ok: false, errors };
  const { planYearEnd, filingDate, planType, assets, participants, yearsLate, extensionFiled } = value;

  const notes = [];
  const due = dueDate(planYearEnd, { extended: extensionFiled }, c);
  const daysLate = Math.max(0, daysBetween(due.due, filingDate));

  // One-participant plan at or under the asset line: no annual return.
  if (planType === "one" && assets <= c.onePlanAssetThreshold) {
    notes.push(
      `A one-participant plan whose assets are ${usd(c.onePlanAssetThreshold)} or less at the end of the plan year does not file Form 5500-EZ for that year, so there is no late-filing penalty to price. Assets at plan year end are the test, and the last-year filing rule differs: a plan that is terminating, merging or paying out all its assets files a final return whatever the balance. Verify against current IRS guidance.`,
    );
    return {
      ok: true,
      exempt: true,
      due,
      daysLate,
      isLate: daysLate > 0,
      reports: [],
      dfvc: null,
      irs: { total: 0 },
      dol: { total: 0 },
      notes,
      steps: filingSteps({ planType, exempt: true }),
      constants: c,
    };
  }

  // Class the plan for DFVC. A "small" label with 100+ participants is flagged.
  if (planType === "small" && participants >= c.smallPlanParticipants) {
    notes.push(`You chose a small plan but entered ${participants} participants. The small/large test uses the count at the start of the plan year, with a 80-120 participant rule that can keep a plan in the category it was in the year before. If it files as a large plan, the DFVC caps are the large-plan figures.`);
  }
  if (planType === "large" && participants > 0 && participants < c.smallPlanParticipants) {
    notes.push(`You chose a large plan but entered ${participants} participants. If it files as a small plan, the lower small-plan DFVC caps apply. The 80-120 participant rule can keep a plan in the large category.`);
  }
  if (planType === "large") {
    notes.push("Large plans (and small plans that do not meet the audit-waiver conditions) normally attach an independent accountant's audit report. A late audit is a separate delay this calculator does not model.");
  }

  const bucket = planType === "large" ? "large" : "small";
  const caps = c.dfvcCaps[bucket];

  // Per-report rows: the entered year, then each earlier unfiled year.
  const reports = [];
  for (let k = 0; k < yearsLate; k++) {
    const pye = k === 0 ? planYearEnd : minusYears(planYearEnd, k);
    const d = k === 0 ? due : dueDate(pye, { extended: false }, c);
    const late = Math.max(0, daysBetween(d.due, filingDate));
    const dfvcRaw = late * c.dfvcPerDay;
    const irsRaw = late * c.irsPerDay;
    reports.push({
      planYearEnd: pye,
      dueDate: d.due,
      daysLate: late,
      dfvc: planType === "one" ? null : Math.min(dfvcRaw, caps.perReport),
      dfvcUncapped: dfvcRaw,
      irs: Math.min(irsRaw, c.irsMaxPerReturn),
      irsUncapped: irsRaw,
      dolUpTo: late * c.dolMaxPerDay,
    });
  }

  const lateReports = reports.filter((r) => r.daysLate > 0);
  const irsTotal = reports.reduce((s, r) => s + r.irs, 0);
  const dolTotal = reports.reduce((s, r) => s + r.dolUpTo, 0);

  let dfvc = null;
  if (planType === "one") {
    notes.push("The DFVC programme is for the Form 5500 and Form 5500-SF annual reports filed through EFAST2 and resolves DOL civil penalties. Form 5500-EZ goes to the IRS, not the DOL, and has its own IRS late-filer relief procedure, so no DFVC figure is shown. A one-participant plan can file the electronic Form 5500-SF instead if it prefers; check which applies before choosing.");
  } else {
    const sum = reports.reduce((s, r) => s + r.dfvc, 0);
    const total = Math.min(sum, caps.perPlan);
    dfvc = {
      bucket,
      perDay: c.dfvcPerDay,
      perReportCap: caps.perReport,
      perPlanCap: caps.perPlan,
      sumBeforePlanCap: sum,
      total,
      planCapApplied: sum > caps.perPlan,
      savingsVsDol: Math.max(0, dolTotal - total),
      savingsVsCombined: Math.max(0, irsTotal + dolTotal - total),
    };
    notes.push("DFVC resolves the DOL civil penalty for the reports it covers. It does not by itself end IRS late-filing penalty exposure, which the IRS assesses separately and often abates for reasonable cause; the combined saving shown assumes no relief of any kind and is a ceiling, not a forecast.");
    notes.push("DFVC is open to a filer who has not yet been notified in writing by the DOL of a failure to file. If you already received a DOL or IRS notice, the programme may not be available.");
  }

  if (lateReports.length === 0) {
    notes.push("Filing on or before the due date means no late-filing penalty on these figures.");
  }
  if (due.rolled) {
    notes.push(`The ${due.raw} date falls on ${due.rolledReason}, so the due date rolls to ${due.due}.`);
  }

  return {
    ok: true,
    exempt: false,
    planType,
    bucket,
    due,
    isLate: daysLate > 0,
    daysLate,
    reports,
    dfvc,
    irs: { perDay: c.irsPerDay, maxPerReturn: c.irsMaxPerReturn, total: irsTotal },
    dol: { maxPerDay: c.dolMaxPerDay, total: dolTotal },
    notes,
    steps: filingSteps({ planType, exempt: false }),
    constants: c,
  };
}

export function filingSteps({ planType, exempt }) {
  if (exempt) {
    return [
      "Keep the year-end asset statement that shows the plan at or under the threshold, so the no-filing position can be shown later.",
      "Recheck next year: the first year assets pass the threshold, or the year the plan ends, a Form 5500-EZ is due.",
    ];
  }
  const form = planType === "one" ? "Form 5500-EZ (or the electronic Form 5500-SF)" : planType === "large" ? "Form 5500 with its schedules" : "Form 5500-SF, or Form 5500 if you cannot use the short form";
  const steps = [
    `Gather the plan's year-end asset and participant figures for each late plan year, and the plan number and EIN.`,
    `Prepare ${form} for each late plan year, using that year's form version.`,
  ];
  if (planType === "one") {
    steps.push("Form 5500-EZ is filed on paper with the IRS unless you use the electronic Form 5500-SF through EFAST2. Check current IRS instructions for the address and the late-filer relief procedure.");
  } else {
    steps.push("Register for an EFAST2 filing credential if you do not have one (the filer ID and password are issued online).");
    steps.push("File each late report electronically through EFAST2. Use the DFVC programme's online penalty calculator and payment page on the DOL site, which asks you to pay the penalty by electronic payment when you submit.");
    steps.push("Keep the EFAST2 acknowledgement and the DFVC payment confirmation with the plan records.");
  }
  steps.push("If the IRS or DOL has already sent a notice, answer it first and ask a plan-benefits adviser whether the programme is still open to you.");
  return steps;
}

export function sampleInput() {
  return {
    planYearEnd: "2024-12-31",
    planType: "small",
    assets: 410000,
    extensionFiled: false,
    filingDate: "2025-10-06",
    participants: 14,
    yearsLate: 1,
  };
}

export function sampleMultiYearInput() {
  return { ...sampleInput(), filingDate: "2026-10-05", yearsLate: 2, planType: "small" };
}

export function resultCsv(r) {
  const rows = [["plan_year_end", "due_date", "days_late", "dfvc", "irs_up_to", "dol_up_to"]];
  for (const x of r.reports || []) rows.push([x.planYearEnd, x.dueDate, x.daysLate, x.dfvc ?? "", x.irs, x.dolUpTo]);
  return rows.map((row) => row.join(",")).join("\n") + "\n";
}
