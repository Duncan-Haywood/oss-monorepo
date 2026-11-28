export function parseDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  // Date rolls 2026-02-30 into March: refuse a day that does not round-trip.
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== String(value) ? null : date;
}

// The visitor's own calendar date, not UTC's. `new Date().toISOString()`
// reads the UTC date, which is a different day from the visitor's local date
// for several hours every day everywhere except right on the meridian — ahead
// of local for negative UTC offsets in the evening, behind it for positive
// offsets overnight. `reviewGrant` and `sampleGrants` call this only when the
// page omits `today` (the only way either is ever actually invoked, since
// index.html never passes one), so that mismatch reached every visitor: a
// report due today could show "Overdue" a day early, or "On track" a day
// past what a filed-late letter says, depending only on the visitor's clock.
function localToday() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

// Month arithmetic in UTC, clamping to the last day of a shorter target month
// so 31 January plus one month is 28 February rather than 3 March. Accepts a
// negative shift, which `sampleGrants` needs to work backwards from a report
// date to the award date that produces it.
function shiftMonths(value, months) {
  const date = parseDate(value);
  if (!date) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Math.trunc(months));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

// A fractional interval (1.5) used to be silently floored to 1, so a grant
// saved with one -- the "Add" form's own step=1 blocks it, but a row loaded
// from localStorage that predates that constraint, or one edited outside the
// page, has no such gate -- got the due date a straight 1-month interval
// would produce: a wrong deadline with total confidence and no error, on a
// tool whose entire job is not missing one. Refusing it here instead of
// flooring it means `reviewGrant` gets `nextReport: null` for that row and
// reports it as "Check inputs" rather than a plausible-looking wrong date.
// Mirrors the same fix in grant-deadline-tracker's addMonths (#3162).
export function addMonths(value, months) {
  if (!Number.isFinite(months) || !Number.isInteger(months) || months < 1) return null;
  return shiftMonths(value, months);
}

/**
 * Three awards that demonstrate every status the queue can show.
 *
 * The dates are derived from `today` rather than written down, because a
 * hard-coded sample decays: a fixture dated 2026-03-15 reads as one more
 * overdue row a year later, and a first-time visitor cannot tell the example
 * from a bug. Working backwards from the report date means the sample shows an
 * overdue award, one due inside the month, and one on track, whenever it runs.
 *
 * Clamping in `shiftMonths` can move a derived report date by a day or two when
 * the month lengths differ. The offsets below are far enough from the 0 and 30
 * day status boundaries that the drift cannot change which status each row
 * lands in.
 */
export function sampleGrants(today = localToday()) {
  const awardDateFor = (reportInDays, intervalMonths) => {
    const base = parseDate(today);
    if (!base) return null;
    const report = new Date(base.getTime() + reportInDays * 86400000).toISOString().slice(0, 10);
    return shiftMonths(report, -intervalMonths);
  };
  return [
    { name: 'Community food program', funder: 'Local foundation', awardDate: awardDateFor(-21, 6), intervalMonths: 6, awardAmount: 24000, spentAmount: 8500 },
    { name: 'After-school literacy', funder: 'State education agency', awardDate: awardDateFor(14, 12), intervalMonths: 12, awardAmount: 48000, spentAmount: 31200 },
    { name: 'Winter shelter capital', funder: 'Regional health trust', awardDate: awardDateFor(96, 3), intervalMonths: 3, awardAmount: 15000, spentAmount: 15000 },
  ];
}

// Reports fall on the award's own fixed schedule: award date plus one, two,
// three ... intervals, each computed from the award date so a clamped month
// end (31 Jan -> 28 Feb) never drifts the later dates. `lastReportFiled`
// (optional; older saved awards and the sample rows have none) says which of
// those scheduled reports is done: the latest scheduled date on or before the
// filing, or up to EARLY_FILING_DAYS after it (capped at half the interval),
// so a report sent late covers its own period and one sent a few days early
// covers the date it was sent for. The next report is the one after that.
//
// Until 2026-11-13 the next date was "filed date + interval", which let one
// late filing push every later deadline back (award 2026-01-15, every 6
// months, filed 2026-08-01 showed 2027-02-01 "Due soon" on 2027-01-20, when
// the funder's date, 2027-01-15, had already passed). Quality audit
// portfolio/quality/audits/2026-11-13-grant-reporting-tracker.json.
//
// A filed date before the award date or after "today" is ignored, as before:
// it cannot be a real filing for this award as of the visitor's clock.
const EARLY_FILING_DAYS = 30;
const DAY = 86400000;

// Reporting lag and closeout (added 2026-11-28, quality re-audit of the
// 2026-11-13 audit's medium defect). Federal awards are due a set number of
// days *after* each reporting period ends, not on the period end: 30 days for
// quarterly or semiannual reports and 90 for annual (2 CFR 200.329(c)(1)), and
// every report is due 120 days after the period of performance ends
// (2 CFR 200.344(b)). Three optional fields carry that:
//
//   dueDaysAfter   days after each period ends that its report is due. Blank
//                  or 0 keeps the original meaning, which saved awards rely
//                  on: the report is due on award date + k intervals (an
//                  agreement that says "report every 6 months from award").
//                  With N > 0 a period runs to the day before the next one
//                  starts and its report is due N days after that, so a
//                  quarterly award from 1 January with 30 has its first report
//                  due 30 April.
//   periodEnd      last day of the period of performance. Periodic reports
//                  stop at the period that reaches it; the final report
//                  replaces that one.
//   finalDueDays   days after periodEnd the final report is due (default 120,
//                  the federal rule; foundations often say 30 or 60).
//
// A value that cannot be one of these (negative, fractional, a date that does
// not exist, an end before the award) makes the row "Check inputs" rather than
// silently ignoring the field and showing a plausible wrong date.
const MAX_LAG_DAYS = 365;
const FINAL_DUE_DAYS = 120;

function optionalDays(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_LAG_DAYS ? n : NaN;
}

function plusDays(date, days) {
  return new Date(date.getTime() + days * DAY).toISOString().slice(0, 10);
}

// The award's report schedule as [{ date, type }], ascending, enough of it to
// pass `until` (or all of it when the award has an end date). null when an
// input is unusable.
export function reportSchedule(grant, until) {
  const interval = Number(grant.intervalMonths);
  if (!addMonths(grant.awardDate, interval)) return null;
  const award = parseDate(grant.awardDate);
  const lag = optionalDays(grant.dueDaysAfter, 0);
  const finalDays = optionalDays(grant.finalDueDays, FINAL_DUE_DAYS);
  if (Number.isNaN(lag) || Number.isNaN(finalDays)) return null;
  let end = null;
  if (grant.periodEnd !== undefined && grant.periodEnd !== null && grant.periodEnd !== '') {
    end = parseDate(grant.periodEnd);
    if (!end || end < award) return null;
  }
  const limit = until ? parseDate(until) : null;
  const out = [];
  for (let k = 1; ; k += 1) {
    const nextStart = parseDate(scheduledDate(grant, k));
    const lastDay = new Date(nextStart.getTime() - DAY);
    if (end && lastDay >= end) break;
    out.push({ date: lag ? plusDays(lastDay, lag) : scheduledDate(grant, k), type: 'Periodic' });
    if (!end && limit && parseDate(out[out.length - 1].date) > limit && out.length > 1) break;
    if (!end && !limit && out.length >= 1) break;
  }
  if (end) {
    out.push({ date: plusDays(end, finalDays), type: 'Final' });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return out;
}

function scheduledDate(grant, k) {
  return shiftMonths(grant.awardDate, Number(grant.intervalMonths) * k);
}

// The first report on the schedule that the last filing does not cover, or
// { done: true } when the final report has been filed.
function nextScheduledReport(grant, today) {
  const filed = grant.lastReportFiled ? parseDate(grant.lastReportFiled) : null;
  const award = parseDate(grant.awardDate);
  const asOf = parseDate(today);
  const usable = filed && !(award && filed < award) && !(asOf && filed > asOf);
  const window = Math.min(EARLY_FILING_DAYS, Number(grant.intervalMonths) * 15) * DAY;
  const reach = usable ? new Date(filed.getTime() + window) : null;
  const schedule = reportSchedule(grant, reach ? reach.toISOString().slice(0, 10) : null);
  if (!schedule) return null;
  if (!reach) return schedule[0];
  // A filing covers every scheduled report due on or before it (or a few days
  // after it), and at least the first periodic one, since an early first
  // filing is still the first report. A filing months before the final report
  // is due does not close the award out: it was the last periodic report.
  let covered = schedule[0].type === 'Periodic' ? 1 : 0;
  while (covered < schedule.length && parseDate(schedule[covered].date) <= reach) covered += 1;
  return covered < schedule.length ? schedule[covered] : { done: true };
}

export function reviewGrant(grant, today = localToday()) {
  const next = nextScheduledReport(grant, today);
  const done = Boolean(next && next.done);
  const nextReport = next && !done ? next.date : null;
  const days = nextReport ? Math.ceil((parseDate(nextReport) - parseDate(today)) / DAY) : null;
  const restrictedBalance = Number(grant.awardAmount) - Number(grant.spentAmount);
  return {
    ...grant,
    nextReport,
    reportType: nextReport ? next.type : null,
    daysUntilReport: days,
    restrictedBalance,
    // Spending past the award is a finding the board needs to see, not just a
    // minus sign in the balance column.
    overspent: restrictedBalance < 0,
    status: done ? 'All reports filed' : days === null ? 'Check inputs' : days < 0 ? 'Overdue' : days <= 30 ? 'Due soon' : 'On track',
  };
}

export function reviewAll(grants, today) {
  return grants
    .map((grant, sourceIndex) => ({ ...reviewGrant(grant, today), sourceIndex }))
    .sort((a, b) => (a.daysUntilReport ?? Infinity) - (b.daysUntilReport ?? Infinity) || a.sourceIndex - b.sourceIndex);
}

// The review queue is sorted, so a row's position in `rows` is not its
// position in the saved `grants` array -- removing "row 2 on screen" by
// that index would delete whatever award happens to occupy slot 2 in
// storage, not the one the user is looking at. `reviewAll` attaches
// `sourceIndex` before sorting so the page can pass it straight back here.
// Before this existed the only way to correct one mistyped award, or drop
// a grant whose reporting obligation ended, was "Clear all saved awards" --
// destroying every other tracked award along with it.
export function removeGrant(grants, index) {
  if (!Array.isArray(grants)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= grants.length) {
    return grants.slice();
  }
  return grants.filter((_, i) => i !== index);
}

// Recording a filing has to work on an award that is *already saved*, which
// is the only state a returning user is ever in. `lastReportFiled` on the add
// form only helps someone typing a multi-year award in for the first time;
// without this the way to roll a tracked award forward after actually sending
// its report was to remove it and re-key every field, which is exactly the
// hand-maintained-spreadsheet work the tracker exists to replace -- and the
// row most likely to be re-keyed wrong is the one whose numbers a board sees.
// Index semantics match `removeGrant`: `sourceIndex` from `reviewAll`, not the
// row's sorted position.
export function markReportFiled(grants, index, filedOn = localToday()) {
  if (!Array.isArray(grants)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= grants.length) {
    return grants.slice();
  }
  // A filing date that does not parse would silently become the anchor for
  // every future due date, so refuse it rather than writing it to storage.
  if (!parseDate(filedOn)) return grants.slice();
  return grants.map((grant, i) => (i === index ? { ...grant, lastReportFiled: filedOn } : grant));
}

// Every field the queue reads, not just the ones the table renders. A CSV
// exported to a board member, a co-signer, or a funder's file is often the
// only copy of an award that leaves this browser -- so a recipient with only
// the five displayed columns can see that a report is "Overdue" but cannot
// check *why* (no awardDate or intervalMonths to recompute nextReport from),
// cannot tell an approximate deadline from an urgent one (status buckets
// "Due soon" into one label whether it is due tomorrow or in three weeks,
// with no daysUntilReport), and cannot verify restrictedBalance without the
// awardAmount and spentAmount it is derived from. Dropping any of those from
// the export is the same defect `where-to-sell-calculator` shipped by
// hand-keeping an allowlist beside the form instead of deriving it: a field
// the page collects and computes quietly missing from the copy a second
// person reads.
export function toCsv(rows) {
  const fields = [
    'name', 'funder', 'awardDate', 'intervalMonths', 'dueDaysAfter', 'periodEnd', 'finalDueDays',
    'lastReportFiled', 'nextReport', 'reportType', 'daysUntilReport', 'status',
    'awardAmount', 'spentAmount', 'restrictedBalance', 'overspent',
  ];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
}

// Saved awards come back from localStorage, which is user-writable and can be
// left damaged by an interrupted write or an older version of this page. A
// single null or string row used to reach reviewGrant and throw on
// `grant.awardDate`, blanking the whole queue — so drop anything that is not an
// object rather than trusting the parsed shape.
export function loadGrants(value) {
  if (!value) return [];
  try {
    const grants = JSON.parse(value);
    return Array.isArray(grants) ? grants.filter((grant) => grant && typeof grant === 'object') : [];
  } catch {
    return [];
  }
}
