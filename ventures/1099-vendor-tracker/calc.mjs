// Core arithmetic for the 1099-vendor-tracker. No network calls, no IRS
// e-Services lookup (that program needs its own account and is not something
// a public page can call on a visitor's behalf) -- this is date and threshold
// arithmetic on numbers the user types in, plus a same-day, no-account
// alternative to a hand-kept spreadsheet.
//
// Scope is deliberately narrower than "everything Form 1099 can report."
// Two categories below (`attorneyGrossProceeds`, `medicalHealthcare`) are
// flagged rather than computed, because their thresholds and filing
// deadlines follow a different, box-specific rule this tool has not verified
// against a primary source it can reach (see README "What this does not
// cover"). A wrong "below threshold" for those would be worse than no
// answer, so they get a pointer to the IRS instructions instead of a number.

// One Big Beautiful Bill Act (OBBBA, enacted 2025): the Form 1099-NEC /
// 1099-MISC nonemployee-compensation reporting threshold rises from $600 to
// $2,000 for payments made on or after 2026-01-01, then inflation-adjusts
// annually starting with payments made in 2027. This tool applies the flat
// 2026 figure to every year from 2026 onward rather than guessing at a future
// inflation adjustment, and exposes `thresholdOverride` so a later year's
// published figure can be used without a code change once it is known.
export const OBBBA_THRESHOLD_YEAR = 2026;
export const THRESHOLD_BEFORE_OBBBA = 600;
export const THRESHOLD_FROM_OBBBA = 2000;

// Entity types whose 1099-NEC recipient is generally exempt from reporting --
// EXCEPT the categories below that name an exception (attorney fees, and the
// two uncalculated categories, which are reportable regardless of entity
// type). This is the long-standing "corporate exemption" rule; OBBBA did not
// change it.
const CORPORATE_ENTITY_TYPES = new Set(['sCorp', 'cCorp', 'llcTaxedAsCorp']);

export const ENTITY_TYPES = [
  { value: 'individual', label: 'Individual / sole proprietor' },
  { value: 'singleMemberLlc', label: 'Single-member LLC (disregarded, taxed as individual)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'multiMemberLlc', label: 'Multi-member LLC (taxed as a partnership)' },
  { value: 'sCorp', label: 'S-corporation' },
  { value: 'cCorp', label: 'C-corporation' },
  { value: 'llcTaxedAsCorp', label: 'LLC taxed as a corporation' },
];

export const PAYMENT_CATEGORIES = [
  {
    value: 'services',
    label: 'Services (contractor / freelancer pay) — 1099-NEC',
    isAttorney: false,
    uncalculated: false,
  },
  {
    value: 'attorneyFees',
    label: "Attorney's own fees for services — 1099-NEC (corporation exemption never applies)",
    isAttorney: true,
    uncalculated: false,
  },
  {
    value: 'attorneyGrossProceeds',
    label: 'Gross proceeds paid to an attorney (e.g. a settlement) — 1099-MISC box 10, separate $600 rule this tool does not calculate',
    isAttorney: true,
    uncalculated: true,
  },
  {
    value: 'medicalHealthcare',
    label: 'Medical or health care payments — 1099-MISC, corporation exemption does not apply, separate rule this tool does not calculate',
    isAttorney: false,
    uncalculated: true,
  },
];

const CATEGORY_BY_VALUE = new Map(PAYMENT_CATEGORIES.map((c) => [c.value, c]));

export function isCorporateEntity(entityType) {
  return CORPORATE_ENTITY_TYPES.has(entityType);
}

// The general NEC/MISC threshold for payments made in `taxYear`. An explicit
// numeric override wins outright -- the escape hatch for the year this flat
// 2026 figure goes stale to a real inflation adjustment nobody has shipped a
// code change for yet.
export function reportingThreshold(taxYear, override) {
  if (Number.isFinite(override) && override > 0) return override;
  const year = Number(taxYear);
  if (!Number.isFinite(year)) return THRESHOLD_FROM_OBBBA;
  return year >= OBBBA_THRESHOLD_YEAR ? THRESHOLD_FROM_OBBBA : THRESHOLD_BEFORE_OBBBA;
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 1099-NEC's own recipient-copy and IRS-filing deadline is January 31 of the
// year after the payments were made, with no staggered paper/e-file split
// (unlike several 1099-MISC boxes). When that date falls on a Saturday or
// Sunday it rolls to the next business day -- verified against 2027-01-31
// (a Sunday), whose real cutoff is 2027-02-01. This does not adjust for a
// federal holiday landing on that Monday/Tuesday; none has as of this
// writing, and the README says so rather than silently assuming it always
// will not.
export function necDeadline(taxYear) {
  const year = Number(taxYear);
  if (!Number.isInteger(year)) return null;
  const base = new Date(Date.UTC(year + 1, 0, 31));
  const day = base.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 6) base.setUTCDate(base.getUTCDate() + 2);
  else if (day === 0) base.setUTCDate(base.getUTCDate() + 1);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

const STATUS_RANK = {
  'Needs 1099 — W-9 missing': 0,
  'Needs 1099 — W-9 on file': 1,
  'Check separately (not calculated)': 2,
  'Below threshold — not yet reportable': 3,
  'Likely exempt — corporation': 4,
  'Check inputs': 5,
};

export function reviewVendor(vendor, options = {}) {
  const taxYear = options.taxYear ?? new Date().getUTCFullYear();
  const category = CATEGORY_BY_VALUE.get(vendor.paymentCategory) ?? CATEGORY_BY_VALUE.get('services');
  const totalPaid = Number(vendor.totalPaid);
  const threshold = reportingThreshold(taxYear, options.thresholdOverride);
  const corporate = isCorporateEntity(vendor.entityType);

  if (!Number.isFinite(totalPaid) || totalPaid < 0) {
    return { ...vendor, category: category.value, threshold, status: 'Check inputs', deadline: necDeadline(taxYear) };
  }

  if (category.uncalculated) {
    return {
      ...vendor,
      totalPaid,
      category: category.value,
      threshold: null,
      status: 'Check separately (not calculated)',
      deadline: null,
    };
  }

  const reportable = category.isAttorney || !corporate;
  if (!reportable) {
    return { ...vendor, totalPaid, category: category.value, threshold, status: 'Likely exempt — corporation', deadline: null };
  }

  const thresholdMet = totalPaid >= threshold;
  if (!thresholdMet) {
    return {
      ...vendor,
      totalPaid,
      category: category.value,
      threshold,
      status: 'Below threshold — not yet reportable',
      deadline: null,
    };
  }

  const deadline = necDeadline(taxYear);
  const status = vendor.w9OnFile ? 'Needs 1099 — W-9 on file' : 'Needs 1099 — W-9 missing';
  return { ...vendor, totalPaid, category: category.value, threshold, status, deadline };
}

export function reviewAll(vendors, options = {}) {
  return vendors
    .map((vendor, sourceIndex) => ({ ...reviewVendor(vendor, options), sourceIndex }))
    .sort((a, b) => {
      const rankDiff = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return (b.totalPaid ?? 0) - (a.totalPaid ?? 0) || a.sourceIndex - b.sourceIndex;
    });
}

export function removeVendor(vendors, index) {
  if (!Array.isArray(vendors)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= vendors.length) return vendors.slice();
  return vendors.filter((_, i) => i !== index);
}

// A returning bookkeeper who just got a signed W-9 back should not have to
// remove and re-key the whole vendor row to record it -- same reasoning as
// grant-reporting-tracker's markReportFiled for a filed report.
export function markW9Received(vendors, index) {
  if (!Array.isArray(vendors)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= vendors.length) return vendors.slice();
  return vendors.map((vendor, i) => (i === index ? { ...vendor, w9OnFile: true } : vendor));
}

// Format-only sanity check. This is NOT the IRS TIN Matching program -- that
// needs e-Services enrollment this tool cannot obtain on a visitor's behalf
// -- it only catches an obviously mistyped number of digits before it ends
// up on a form. Accepts a bare 9 digits or the conventional SSN (XXX-XX-XXXX)
// or EIN (XX-XXXXXXX) grouping; anything else is flagged as not plausible.
export function tinFormatCheck(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { plausible: null, kind: null };
  if (/^\d{3}-\d{2}-\d{4}$/.test(raw)) return { plausible: true, kind: 'ssn-shaped' };
  if (/^\d{2}-\d{7}$/.test(raw)) return { plausible: true, kind: 'ein-shaped' };
  if (/^\d{9}$/.test(raw)) return { plausible: true, kind: 'unformatted' };
  return { plausible: false, kind: null };
}

/**
 * A handful of vendors that demonstrate every status the queue can show,
 * for a first-time visitor to see before typing anything real in. Amounts
 * are fixed rather than derived from `taxYear`, unlike the grant tracker's
 * date-relative sample, because a threshold comparison does not decay the
 * way a days-until-due comparison does -- $2,500 stays above $2,000 in any
 * year this tool's OBBBA branch applies to.
 */
export function sampleVendors() {
  return [
    { name: 'Riverside Web Design LLC', entityType: 'singleMemberLlc', paymentCategory: 'services', totalPaid: 3200, w9OnFile: false, tin: '' },
    { name: 'Alvarez Bookkeeping', entityType: 'individual', paymentCategory: 'services', totalPaid: 2650, w9OnFile: true, tin: '123-45-6789' },
    { name: 'Northgate Print Shop Inc.', entityType: 'cCorp', paymentCategory: 'services', totalPaid: 4100, w9OnFile: true, tin: '' },
    { name: 'Harmon & Reyes, Attorneys', entityType: 'llcTaxedAsCorp', paymentCategory: 'attorneyFees', totalPaid: 5400, w9OnFile: true, tin: '' },
    { name: 'Seasonal courier, one job', entityType: 'individual', paymentCategory: 'services', totalPaid: 450, w9OnFile: false, tin: '' },
    { name: 'Client settlement, paid via counsel', entityType: 'llcTaxedAsCorp', paymentCategory: 'attorneyGrossProceeds', totalPaid: 12000, w9OnFile: false, tin: '' },
  ];
}

export function toCsv(rows) {
  const fields = [
    'name', 'entityType', 'category', 'totalPaid', 'threshold', 'w9OnFile', 'tin', 'status', 'deadline',
  ];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
}

// Saved vendors come back from localStorage, which is user-writable and can
// be left damaged by an interrupted write or an older page version. Same
// defensive shape as grant-reporting-tracker's loadGrants: drop anything
// that is not an object rather than letting one bad row blank the queue.
export function loadVendors(value) {
  if (!value) return [];
  try {
    const vendors = JSON.parse(value);
    return Array.isArray(vendors) ? vendors.filter((v) => v && typeof v === 'object') : [];
  } catch {
    return [];
  }
}
