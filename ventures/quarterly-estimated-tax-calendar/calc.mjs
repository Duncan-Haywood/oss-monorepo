/**
 * Quarterly estimated tax calendar, as a deterministic module.
 *
 * A US freelancer, 1099 contractor, or gig worker who owes federal income
 * tax with nothing withheld from their pay has to send the IRS four
 * "quarterly" payments a year (they are not actually 3-3-3-3 months apart --
 * see QUARTER_LABELS) or risk an underpayment penalty. Two things trip
 * people up every year, and both are arithmetic rather than opinion:
 *
 * 1. **The due dates move.** The nominal dates (April 15, June 15,
 *    September 15, January 15) shift to the next business day whenever they
 *    land on a weekend or a federal holiday -- and the shift can chain
 *    through more than one day. This module's `nextBusinessDay` reproduces
 *    three real, published IRS shifts as its regression tests: the 2022 Q1
 *    deadline moved to April 18 (Emancipation Day observed Friday the 15th,
 *    then the weekend), the 2023 Q4 deadline moved to January 17, 2023
 *    (the nominal date is itself a Sunday, and the Monday it lands on is MLK
 *    Day), and the 2024 Q4 deadline moved to January 16, 2024 (the nominal
 *    date IS MLK Day that year). A tool that only knows "the 15th" gets all
 *    three wrong.
 * 2. **How much is actually required is a safe-harbor floor, not a guess.**
 *    IRS Form 1040-ES's safe harbor: pay the smaller of 90% of this year's
 *    tax or 100% of last year's tax (110% if last year's AGI was over
 *    $150,000, or $75,000 married filing separately), and no penalty
 *    applies even if the actual final bill is higher. `requiredAnnualPayment`
 *    computes exactly that floor from numbers a filer already has -- last
 *    year's return and, optionally, this year's own estimate -- never a
 *    number this tool invents.
 *
 * This produces a **planning worksheet and a calendar file**, not a filed
 * amount and not a penalty determination. The even split across four
 * quarters mirrors Form 2210's own default (regular) method; it does not
 * implement the annualized income installment method (Form 2210 Schedule
 * AI) for income that arrived unevenly across the year -- see the
 * `annualized-income-note` finding, which always fires, precisely so this
 * tool cannot be mistaken for having checked that.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value) {
  if (!value || !DATE_RE.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toStamp(date) {
  return date.toISOString().slice(0, 10);
}

export function todayStamp(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return toStamp(new Date());
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value, days) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toStamp(date);
}

function isWeekend(value) {
  const day = parseDate(value).getUTCDay();
  return day === 0 || day === 6;
}

/** The `n`th `weekday` (0=Sun..6=Sat) of `month` (1-12) in `year`. */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return toStamp(new Date(Date.UTC(year, month - 1, day)));
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDay));
  const lastWeekday = last.getUTCDay();
  const day = lastDay - ((lastWeekday - weekday + 7) % 7);
  return toStamp(new Date(Date.UTC(year, month - 1, day)));
}

/** A fixed-date federal holiday, shifted to Friday/Monday when it falls on a weekend. */
function observedFixedHoliday(year, month, day) {
  const stamp = toStamp(new Date(Date.UTC(year, month - 1, day)));
  const weekday = parseDate(stamp).getUTCDay();
  if (weekday === 6) return addDays(stamp, -1);
  if (weekday === 0) return addDays(stamp, 1);
  return stamp;
}

/**
 * Federal holidays (as observed) that can fall near a quarterly due date,
 * for the given year. Not every US federal holiday is listed -- only ones
 * within reach of April 15, June 15, September 15, or January 15 once a
 * weekend shift is applied, plus the DC Emancipation Day quirk the IRS
 * itself uses to move Tax Day (and so the Q1 estimate, due the same day).
 */
function federalHolidaysForYear(year) {
  return new Set([
    observedFixedHoliday(year, 1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // Martin Luther King Jr. Day (3rd Mon Jan)
    observedFixedHoliday(year, 4, 16), // Emancipation Day (DC) -- moves Apr 15
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day (last Mon May)
    observedFixedHoliday(year, 6, 19), // Juneteenth
    observedFixedHoliday(year, 7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day (1st Mon Sept)
  ]);
}

function isFederalHoliday(value) {
  const year = Number(String(value).slice(0, 4));
  return federalHolidaysForYear(year).has(value) || federalHolidaysForYear(year - 1).has(value);
}

/** Shift a nominal due date forward to the next day that is neither a weekend nor a federal holiday. */
export function nextBusinessDay(value) {
  let date = value;
  while (isWeekend(date) || isFederalHoliday(date)) {
    date = addDays(date, 1);
  }
  return date;
}

export const QUARTERS = ["q1", "q2", "q3", "q4"];

export const QUARTER_LABELS = {
  q1: "Q1 — income from Jan 1 – Mar 31",
  q2: "Q2 — income from Apr 1 – May 31",
  q3: "Q3 — income from Jun 1 – Aug 31",
  q4: "Q4 — income from Sep 1 – Dec 31",
};

/** The four nominal (pre-shift) IRS due dates for a given tax year. */
function nominalDueDates(taxYear) {
  return {
    q1: `${taxYear}-04-15`,
    q2: `${taxYear}-06-15`,
    q3: `${taxYear}-09-15`,
    q4: `${taxYear + 1}-01-15`,
  };
}

/** The four actual (weekend/holiday-adjusted) IRS due dates for a given tax year. */
export function quarterDueDates(taxYear) {
  const nominal = nominalDueDates(taxYear);
  const dates = {};
  for (const q of QUARTERS) dates[q] = nextBusinessDay(nominal[q]);
  return dates;
}

function nonNegNumber(value) {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to the nearest cent, avoiding float noise like 12000 * 1.1 === 13200.000000000002. */
function round2(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

const HIGH_INCOME_THRESHOLD_MFS = 75000;
const HIGH_INCOME_THRESHOLD_OTHER = 150000;

/** 1.10 if last year's AGI clears the high-income threshold, else 1.00. */
export function safeHarborMultiplier({ priorYearAGI, marriedFilingSeparately } = {}) {
  const agi = nonNegNumber(priorYearAGI);
  const threshold = marriedFilingSeparately ? HIGH_INCOME_THRESHOLD_MFS : HIGH_INCOME_THRESHOLD_OTHER;
  return agi > threshold ? 1.1 : 1.0;
}

/**
 * IRS Form 1040-ES safe harbor: the smaller of 90% of this year's estimated
 * tax or 100%/110% of last year's tax, whichever the filer has a number for.
 * Returns `required: null` only when neither input was given -- there is
 * nothing to compute a target from.
 */
export function requiredAnnualPayment(input = {}) {
  const priorYearTax = nonNegNumber(input.priorYearTax);
  const hasCurrentYearEstimate = input.currentYearEstimate !== "" && input.currentYearEstimate != null;
  const currentYearEstimate = hasCurrentYearEstimate ? nonNegNumber(input.currentYearEstimate) : null;
  const multiplier = safeHarborMultiplier(input);

  const priorYearSafeHarbor = priorYearTax > 0 ? round2(priorYearTax * multiplier) : null;
  const currentYearSafeHarbor = currentYearEstimate != null ? round2(currentYearEstimate * 0.9) : null;

  let required = null;
  let basis = null;
  if (priorYearSafeHarbor != null && currentYearSafeHarbor != null) {
    if (currentYearSafeHarbor <= priorYearSafeHarbor) {
      required = currentYearSafeHarbor;
      basis = "90% of this year's estimated tax — lower than last year's safe harbor";
    } else {
      required = priorYearSafeHarbor;
      basis = `${multiplier === 1.1 ? "110%" : "100%"} of last year's tax — lower than 90% of this year's estimate`;
    }
  } else if (priorYearSafeHarbor != null) {
    required = priorYearSafeHarbor;
    basis = `${multiplier === 1.1 ? "110%" : "100%"} of last year's tax — the known-in-advance safe harbor (this year's tax was not estimated)`;
  } else if (currentYearSafeHarbor != null) {
    required = currentYearSafeHarbor;
    basis = "90% of this year's estimated tax — no prior-year tax entered (e.g. a first year in business, or last year owed $0)";
  }

  return { required, basis, multiplier, priorYearSafeHarbor, currentYearSafeHarbor };
}

/**
 * Full schedule: due dates, the required annual payment, and a per-quarter
 * breakdown against what has already been withheld or paid. The annual
 * requirement is split evenly across all four quarters -- Form 2210's own
 * default (regular) method -- rather than reallocating a missed quarter's
 * amount onto the quarters still ahead.
 */
export function computeSchedule(input = {}) {
  const taxYear = Number.isInteger(input.taxYear) && input.taxYear > 1900 ? input.taxYear : new Date().getUTCFullYear();
  const asOf = parseDate(input.asOfDate) ? input.asOfDate : todayStamp(new Date());
  const dueDates = quarterDueDates(taxYear);

  const { required, basis, multiplier } = requiredAnnualPayment(input);
  const withholding = nonNegNumber(input.withholding);
  const netRequired = required == null ? null : round2(Math.max(0, required - withholding));
  const perQuarter = netRequired == null ? null : round2(netRequired / 4);

  const paidByQuarter = {};
  for (const q of QUARTERS) paidByQuarter[q] = nonNegNumber(input.paidByQuarter?.[q]);
  const totalPaid = QUARTERS.reduce((sum, q) => sum + paidByQuarter[q], 0);

  const rows = QUARTERS.map((q) => {
    const dueDate = dueDates[q];
    const paid = paidByQuarter[q];
    const suggested = perQuarter == null ? null : perQuarter;
    const shortfall = suggested == null ? null : round2(Math.max(0, suggested - paid));
    const daysUntilDue = Math.round((parseDate(dueDate).getTime() - parseDate(asOf).getTime()) / 86400000);
    const status =
      shortfall === 0
        ? "paid"
        : daysUntilDue < 0
          ? "overdue"
          : daysUntilDue <= 30
            ? "due-soon"
            : "upcoming";
    return { quarter: q, label: QUARTER_LABELS[q], dueDate, daysUntilDue, suggested, paid, shortfall, status };
  });

  const findings = [];
  if (required == null) {
    findings.push({
      id: "no-basis",
      severity: "info",
      title: "Enter last year's total tax, this year's estimate, or both",
      detail: "Nothing is computed until at least one is entered. Last year's total tax (Form 1040, line 22 minus certain credits) gives the safe, known-in-advance target; this year's own estimate can lower it if your income dropped.",
    });
  }
  if (multiplier === 1.1) {
    findings.push({
      id: "high-income-safe-harbor",
      severity: "info",
      title: "110% safe harbor applies",
      detail: `Last year's AGI was above $${(input.marriedFilingSeparately ? HIGH_INCOME_THRESHOLD_MFS : HIGH_INCOME_THRESHOLD_OTHER).toLocaleString()}, so the prior-year safe harbor is 110% of last year's tax rather than 100%.`,
    });
  } else if (!input.priorYearAGI && nonNegNumber(input.priorYearTax) > 0) {
    findings.push({
      id: "agi-not-entered",
      severity: "medium",
      title: "Enter last year's AGI to confirm which safe harbor applies",
      detail: "Without it, this assumes the 100% safe harbor. If last year's adjusted gross income was over $150,000 ($75,000 if married filing separately), the correct floor is 110% of last year's tax, which is a higher required payment than shown.",
    });
  }
  if (netRequired != null && netRequired > 0 && totalPaid >= netRequired) {
    findings.push({
      id: "overpaid",
      severity: "info",
      title: "Payments made so far already meet the annual requirement",
      detail: "Based on what you've entered as paid, the safe-harbor floor is already met. Any remaining quarters can be $0 unless your own estimate of this year's tax has since gone up.",
    });
  }
  findings.push({
    id: "annualized-income-note",
    severity: "info",
    title: "This is the even (regular) method, not the annualized-income method",
    detail: "The annual requirement is split into four equal quarters, which is IRS Form 2210's default method and how this worksheet works. If your income arrives unevenly across the year (a seasonal business, one large late-year payment), the Annualized Income Installment Method (Form 2210 Schedule AI) can lower or eliminate a penalty on the earlier, lower-income quarters — this tool does not compute that method; a tax professional or the IRS instructions for Form 2210 can.",
  });

  return { taxYear, asOf, required, basis, multiplier, withholding, netRequired, perQuarter, totalPaid, rows, findings };
}

/** Escape one value for an ICS TEXT property (RFC 5545 §3.3.11). */
function icsEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold one unfolded ICS content line to RFC 5545's 75-octet limit. */
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

function icsDate(value) {
  return String(value).replaceAll("-", "");
}

function nextCalendarDay(value) {
  return addDays(value, 1);
}

/**
 * The four due dates as an RFC 5545 .ics calendar, one all-day VEVENT per
 * quarter with a 7-day-ahead reminder alarm, so the deadline lives in
 * whatever calendar a filer already checks rather than requiring them to
 * remember this page. Rows already marked "paid" (shortfall 0) are skipped
 * -- there is nothing left to remind about for that quarter.
 */
export function icsCalendar(schedule, now = new Date()) {
  const rows = Array.isArray(schedule?.rows) ? schedule.rows : [];
  const stamp = now instanceof Date ? now : new Date(now);
  const dtstamp = Number.isNaN(stamp.getTime())
    ? "19700101T000000Z"
    : stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    foldLine("PRODID:-//quarterly-estimated-tax-calendar.marisstella.dev//Quarterly Estimated Tax Calendar//EN"),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const row of rows) {
    if (!row || !parseDate(row.dueDate) || row.shortfall === 0) continue;
    const amount = row.suggested == null ? "not yet computed" : `$${row.suggested.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    const description = [
      `Suggested payment: ${amount}`,
      "Planning reminder only — not a filing confirmation. Pay via IRS Direct Pay or EFTPS and verify the amount and date at irs.gov/payments before sending.",
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${schedule.taxYear}-${row.quarter}@quarterly-estimated-tax-calendar.marisstella.dev`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(row.dueDate)}`,
      `DTEND;VALUE=DATE:${icsDate(nextCalendarDay(row.dueDate))}`,
      foldLine(`SUMMARY:${icsEscape(`Estimated tax due — ${row.label.split("—")[0].trim()} ${schedule.taxYear}`)}`),
      foldLine(`DESCRIPTION:${icsEscape(description)}`),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      foldLine(`DESCRIPTION:${icsEscape(`Estimated tax due in 7 days (${row.label.split("—")[0].trim()})`)}`),
      "TRIGGER:-P7D",
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
