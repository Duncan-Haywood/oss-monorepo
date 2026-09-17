// Form 1099-K reporting-threshold checker.
//
// Two independent triggers can require a Third Party Settlement
// Organization (TPSO) -- a marketplace, payment app, or platform -- to
// issue a Form 1099-K to a payee for a given tax year: the FEDERAL
// threshold, which has changed four times in five years, and a handful of
// STATE thresholds that are stricter than the federal one and apply on
// their own regardless of it. Meeting either one is enough to make a
// 1099-K likely.
//
// Federal timeline, sourced against the IRS's own Form 1099-K FAQs, IRS
// Notice 2023-74 (the 2024 transition relief), IRS Fact Sheet 2025-08
// (October 2025), and the One Big Beautiful Bill Act (OBBBA, signed
// 2025-07-04). What a payee actually received in the mail differs from
// what the statute now says applied, which is why this checker asks for a
// tax year rather than assuming one flat figure:
//   2022-2023: $20,000, more than 200 transactions -- the American Rescue
//              Plan Act's $600 threshold was legislated but repeatedly
//              delayed by IRS notice before it ever took effect for these
//              years, so $20,000/200 is both what platforms actually used
//              and (per OBBBA, applied retroactively) the legal threshold.
//   2024:      $5,000, with no transaction-count minimum -- real forms
//              were actually issued under this transition-relief figure
//              (Notice 2023-74). OBBBA later voided the $600 statute
//              retroactively to 2022, which legally reinstates $20,000/200
//              for 2024 too, but Fact Sheet 2025-08 confirms a platform
//              that already sent a 2024 Form 1099-K under the $5,000 rule
//              did not have to withdraw or correct it. This checker asks
//              about 2024 using the figure platforms actually applied,
//              since that is what decides whether a form already arrived.
//   2025 on:   $20,000, more than 200 transactions -- OBBBA repealed the
//              ARPA threshold (which was on track to reach $2,500 for
//              2025 and $600 for 2026) before the lower 2025 figure ever
//              took effect, so 2025 forms (filed in early 2026) and every
//              year after use $20,000/200. This checker applies that
//              confirmed figure to every later year rather than guessing
//              at a change nobody has shipped a source for yet.
export const FEDERAL_THRESHOLDS_BY_ERA = [
  { throughYear: 2023, amount: 20000, minTransactions: 200 },
  { onlyYear: 2024, amount: 5000, minTransactions: null },
  { fromYear: 2025, amount: 20000, minTransactions: 200 },
];

export function federalThreshold(taxYear) {
  const year = Number(taxYear);
  if (!Number.isFinite(year)) return FEDERAL_THRESHOLDS_BY_ERA[2];
  if (year === 2024) return FEDERAL_THRESHOLDS_BY_ERA[1];
  if (year <= 2023) return FEDERAL_THRESHOLDS_BY_ERA[0];
  return FEDERAL_THRESHOLDS_BY_ERA[2];
}

// Surfaced next to the year picker so the 2024 wrinkle above is visible
// rather than buried in a code comment nobody using the page will read.
export function federalEraNote(taxYear) {
  const year = Number(taxYear);
  if (year === 2024) {
    return 'For 2024 specifically, the IRS later confirmed the legal threshold reverts to $20,000/200 transactions retroactively, but a platform that already sent a $5,000-threshold Form 1099-K for 2024 did not have to withdraw it. This checks against the $5,000 figure platforms actually used.';
  }
  return null;
}

// States whose own statute sets a 1099-K threshold stricter than the
// federal one, independent of which federal era above applies. This is
// NOT a full 50-state survey -- a state not listed here is assumed to
// follow the federal threshold, which is the common case, but has not
// been independently verified against that state's own statute the way
// the four below have. `otherStateNote` is shown for every unlisted state
// so the gap is visible rather than silently assumed away.
export const STRICTER_STATE_THRESHOLDS = {
  MD: { amount: 600, label: 'Maryland' },
  MA: { amount: 600, label: 'Massachusetts' },
  VT: { amount: 600, label: 'Vermont' },
  VA: { amount: 600, label: 'Virginia' },
};

export const STATE_OPTIONS = [
  { value: '', label: 'Not sure / prefer not to say' },
  { value: 'MD', label: 'Maryland ($600 state threshold)' },
  { value: 'MA', label: 'Massachusetts ($600 state threshold)' },
  { value: 'VT', label: 'Vermont ($600 state threshold)' },
  { value: 'VA', label: 'Virginia ($600 state threshold)' },
  { value: 'OTHER', label: 'A different state (follows the federal threshold, as far as this tool has verified)' },
];

export function stateThreshold(state) {
  return STRICTER_STATE_THRESHOLDS[state] ?? null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Form 1099-K's own recipient-copy deadline is January 31 of the year
// after the payments were made -- the same rule and the same weekend
// rollover as 1099-NEC. Verified against 2027-01-31 landing on a Sunday,
// whose real cutoff is 2027-02-01.
export function furnishDeadline(taxYear) {
  const year = Number(taxYear);
  if (!Number.isInteger(year)) return null;
  const base = new Date(Date.UTC(year + 1, 0, 31));
  const day = base.getUTCDay();
  if (day === 6) base.setUTCDate(base.getUTCDate() + 2);
  else if (day === 0) base.setUTCDate(base.getUTCDate() + 1);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

// Each income source (a marketplace, payment app, or platform) is checked
// on its own -- the federal and state thresholds above apply per TPSO, not
// summed across every platform a seller uses. Combining two platforms'
// totals to decide whether either one must report is a common
// misreading this tool deliberately does not reproduce.
export function checkSource(source, options = {}) {
  const taxYear = options.taxYear ?? new Date().getUTCFullYear();
  const grossPayments = Number(source.grossPayments);
  const transactionCount = Number(source.transactionCount);

  if (!Number.isFinite(grossPayments) || grossPayments < 0) {
    return { ...source, status: 'Check inputs', likely: null, reason: null };
  }

  // The IRS's own wording is "exceeds $20,000" and "exceeds 200
  // transactions" -- strictly greater than, not "at least". A seller at
  // exactly $20,000 across exactly 200 transactions has not crossed either
  // condition. State statutes use the same "exceeds" framing.
  const federal = federalThreshold(taxYear);
  const txnCountUsable = federal.minTransactions == null || Number.isFinite(transactionCount);
  const federalMet =
    grossPayments > federal.amount &&
    (federal.minTransactions == null || (txnCountUsable && transactionCount > federal.minTransactions));

  const state = stateThreshold(source.state);
  const stateMet = state != null && grossPayments > state.amount;

  const likely = federalMet || stateMet;
  let reason = 'neither';
  if (federalMet && stateMet) reason = 'both';
  else if (federalMet) reason = 'federal';
  else if (stateMet) reason = 'state';

  let status;
  if (likely && reason === 'state' && !federalMet) {
    status = `Likely — ${state.label}'s own $${state.amount.toLocaleString('en-US')} threshold is stricter than the federal one`;
  } else if (likely) {
    status = federal.minTransactions == null
      ? `Likely — crosses the $${federal.amount.toLocaleString('en-US')} federal threshold for ${taxYear}`
      : `Likely — crosses the $${federal.amount.toLocaleString('en-US')} / ${federal.minTransactions}+ transaction federal threshold for ${taxYear}`;
  } else {
    status = 'Below every threshold this tool checked — a 1099-K is not required, though a platform may still issue one voluntarily';
  }

  return {
    ...source,
    grossPayments,
    transactionCount: Number.isFinite(transactionCount) ? transactionCount : null,
    federalThreshold: federal,
    stateThreshold: state,
    likely,
    reason,
    status,
    deadline: furnishDeadline(taxYear),
  };
}

export function checkAll(sources, options = {}) {
  return sources.map((source, sourceIndex) => ({ ...checkSource(source, options), sourceIndex }));
}

export function removeSource(sources, index) {
  if (!Array.isArray(sources)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= sources.length) return sources.slice();
  return sources.filter((_, i) => i !== index);
}

/**
 * A handful of sources that demonstrate every status the queue can show,
 * for a first-time visitor to see before typing anything real in.
 */
export function sampleSources() {
  return [
    { platform: 'eBay', state: '', grossPayments: 24500, transactionCount: 340 },
    { platform: 'Venmo (goods and services)', state: '', grossPayments: 9800, transactionCount: 140 },
    { platform: 'Etsy', state: 'MD', grossPayments: 2100, transactionCount: 60 },
    { platform: 'Cash App (business profile)', state: '', grossPayments: 21000, transactionCount: 150 },
  ];
}

export function toCsv(rows) {
  const fields = ['platform', 'state', 'grossPayments', 'transactionCount', 'status', 'deadline'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
}

// Saved sources come back from localStorage, which is user-writable and can
// be left damaged by an interrupted write or an older page version. Drop
// anything that is not an object rather than letting one bad row blank the
// queue -- same defensive shape as the sibling 1099-vendor-tracker's
// loadVendors.
export function loadSources(value) {
  if (!value) return [];
  try {
    const sources = JSON.parse(value);
    return Array.isArray(sources) ? sources.filter((s) => s && typeof s === 'object') : [];
  } catch {
    return [];
  }
}
