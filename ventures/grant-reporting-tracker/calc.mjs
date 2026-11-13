export function parseDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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

function scheduledDate(grant, k) {
  return shiftMonths(grant.awardDate, Number(grant.intervalMonths) * k);
}

function nextScheduledReport(grant, today) {
  const first = addMonths(grant.awardDate, Number(grant.intervalMonths));
  if (!first) return null;
  const filed = grant.lastReportFiled ? parseDate(grant.lastReportFiled) : null;
  const award = parseDate(grant.awardDate);
  const asOf = parseDate(today);
  if (!filed || (award && filed < award) || (asOf && filed > asOf)) return first;
  const window = Math.min(EARLY_FILING_DAYS, Number(grant.intervalMonths) * 15) * 86400000;
  const reach = new Date(filed.getTime() + window);
  let covered = 1;
  while (parseDate(scheduledDate(grant, covered + 1)) <= reach) covered += 1;
  return scheduledDate(grant, covered + 1);
}

export function reviewGrant(grant, today = localToday()) {
  const nextReport = nextScheduledReport(grant, today);
  const days = nextReport ? Math.ceil((parseDate(nextReport) - parseDate(today)) / 86400000) : null;
  const restrictedBalance = Number(grant.awardAmount) - Number(grant.spentAmount);
  return {
    ...grant,
    nextReport,
    daysUntilReport: days,
    restrictedBalance,
    status: days === null ? 'Check inputs' : days < 0 ? 'Overdue' : days <= 30 ? 'Due soon' : 'On track',
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
    'name', 'funder', 'awardDate', 'intervalMonths', 'lastReportFiled', 'nextReport',
    'daysUntilReport', 'status', 'awardAmount', 'spentAmount', 'restrictedBalance',
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
