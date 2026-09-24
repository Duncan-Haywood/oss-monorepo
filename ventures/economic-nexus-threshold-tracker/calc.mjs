// Economic nexus threshold tracker.
//
// South Dakota v. Wayfair (2018) let states require an out-of-state seller
// to collect sales tax once its sales into that state cross a dollar and/or
// transaction-count figure the state sets for itself -- "economic nexus,"
// as distinct from the older rule requiring a physical presence. Every
// state that levies a general sales tax has now adopted some version of
// this, and every state sets its own number, its own optional transaction
// count, and its own AND/OR condition between the two. A seller on several
// marketplaces and their own storefront has to track this per state, not
// once -- the same "per source, not combined" shape as this portfolio's
// sibling 1099-K threshold checker, applied to a different threshold.
//
// Figures compiled 2026-09-24 from state department-of-revenue guidance as
// aggregated by Numeral's 2026 economic-nexus handbook
// (https://www.numeral.com/blog/economic-nexus), cross-checked against the
// same aggregate figures (41 states at $100,000; California, New York, and
// Texas at $500,000; Alabama and Mississippi at $250,000; 15 states plus DC
// keep a 200-transaction test, New York alone uses 100) reported
// independently by TaxCloud's 2026 nexus guide. This is secondary-source
// compiled data, not a fifty-state statute review -- see the "What this
// does not cover" note on every page and verify the exact figure with the
// state's own department of revenue before registering or not registering
// on the strength of this tool alone.
//
// Threshold wording across states is usually "$X or more" (meets-or-exceeds)
// -- unlike the 1099-K federal rule this portfolio's sibling checker models,
// which is explicitly "exceeds." This tracker treats reaching a state's
// published figure as crossing it (>=). A seller sitting within a few
// dollars or one transaction of a line should confirm the state's own exact
// wording rather than trust this tool at the boundary.
export const STATE_THRESHOLDS = [
  { code: 'AL', label: 'Alabama', amount: 250000, transactions: null, condition: null },
  { code: 'AK', label: 'Alaska', noSalesTax: true, note: 'No statewide sales tax (local sales taxes exist in some municipalities, administered separately).' },
  { code: 'AZ', label: 'Arizona', amount: 100000, transactions: null, condition: null },
  { code: 'AR', label: 'Arkansas', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'CA', label: 'California', amount: 500000, transactions: null, condition: null },
  { code: 'CO', label: 'Colorado', amount: 100000, transactions: null, condition: null },
  { code: 'CT', label: 'Connecticut', amount: 100000, transactions: 200, condition: 'AND' },
  { code: 'DE', label: 'Delaware', noSalesTax: true, note: 'No state sales tax.' },
  { code: 'DC', label: 'District of Columbia', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'FL', label: 'Florida', amount: 100000, transactions: null, condition: null },
  { code: 'GA', label: 'Georgia', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'HI', label: 'Hawaii', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'ID', label: 'Idaho', amount: 100000, transactions: null, condition: null },
  { code: 'IL', label: 'Illinois', amount: 100000, transactions: null, condition: null, note: 'Its 200-transaction alternative test was eliminated effective 2026-01-01; only the $100,000 revenue test remains.' },
  { code: 'IN', label: 'Indiana', amount: 100000, transactions: null, condition: null },
  { code: 'IA', label: 'Iowa', amount: 100000, transactions: null, condition: null },
  { code: 'KS', label: 'Kansas', amount: 100000, transactions: null, condition: null },
  { code: 'KY', label: 'Kentucky', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'LA', label: 'Louisiana', amount: 100000, transactions: null, condition: null },
  { code: 'ME', label: 'Maine', amount: 100000, transactions: null, condition: null },
  { code: 'MD', label: 'Maryland', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'MA', label: 'Massachusetts', amount: 100000, transactions: null, condition: null },
  { code: 'MI', label: 'Michigan', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'MN', label: 'Minnesota', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'MS', label: 'Mississippi', amount: 250000, transactions: null, condition: null },
  { code: 'MO', label: 'Missouri', amount: 100000, transactions: null, condition: null },
  { code: 'MT', label: 'Montana', noSalesTax: true, note: 'No state sales tax.' },
  { code: 'NE', label: 'Nebraska', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'NV', label: 'Nevada', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'NH', label: 'New Hampshire', noSalesTax: true, note: 'No state sales tax.' },
  { code: 'NJ', label: 'New Jersey', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'NM', label: 'New Mexico', amount: 100000, transactions: null, condition: null },
  { code: 'NY', label: 'New York', amount: 500000, transactions: 100, condition: 'AND' },
  { code: 'NC', label: 'North Carolina', amount: 100000, transactions: null, condition: null },
  { code: 'ND', label: 'North Dakota', amount: 100000, transactions: null, condition: null },
  { code: 'OH', label: 'Ohio', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'OK', label: 'Oklahoma', amount: 100000, transactions: null, condition: null },
  { code: 'OR', label: 'Oregon', noSalesTax: true, note: 'No state sales tax.' },
  { code: 'PA', label: 'Pennsylvania', amount: 100000, transactions: null, condition: null },
  { code: 'RI', label: 'Rhode Island', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'SC', label: 'South Carolina', amount: 100000, transactions: null, condition: null },
  { code: 'SD', label: 'South Dakota', amount: 100000, transactions: null, condition: null },
  { code: 'TN', label: 'Tennessee', amount: 100000, transactions: null, condition: null },
  { code: 'TX', label: 'Texas', amount: 500000, transactions: null, condition: null },
  { code: 'UT', label: 'Utah', amount: 100000, transactions: null, condition: null },
  { code: 'VT', label: 'Vermont', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'VA', label: 'Virginia', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'WA', label: 'Washington', amount: 100000, transactions: null, condition: null },
  { code: 'WV', label: 'West Virginia', amount: 100000, transactions: 200, condition: 'OR' },
  { code: 'WI', label: 'Wisconsin', amount: 100000, transactions: null, condition: null },
  { code: 'WY', label: 'Wyoming', amount: 100000, transactions: null, condition: null },
];

const BY_CODE = new Map(STATE_THRESHOLDS.map((s) => [s.code, s]));

export const STATE_OPTIONS = [
  { value: '', label: 'Choose a state…' },
  ...STATE_THRESHOLDS.map((s) => ({
    value: s.code,
    label: s.noSalesTax ? `${s.label} (no state sales tax)` : `${s.label} ($${s.amount.toLocaleString('en-US')}${s.transactions ? ` ${s.condition} ${s.transactions}+ transactions` : ''})`,
  })),
];

export function thresholdFor(code) {
  return BY_CODE.get(code) ?? null;
}

// Each state is evaluated on its own trailing sales into that state --
// never combined across states, the same "per source" shape as the
// sibling 1099-K checker's per-platform rule. A seller who is under every
// individual state's figure has not crossed anywhere, even if their total
// nationwide revenue is large.
export function checkEntry(entry) {
  const threshold = thresholdFor(entry.state);
  if (!threshold) {
    return { ...entry, status: 'Choose a state', crossed: null, threshold: null };
  }
  if (threshold.noSalesTax) {
    return {
      ...entry,
      threshold,
      crossed: false,
      status: `No economic nexus threshold — ${threshold.label} levies no statewide sales tax`,
    };
  }

  const sales = Number(entry.grossSales);
  const salesUsable = Number.isFinite(sales) && sales >= 0;
  const txns = Number(entry.transactionCount);
  const txnsProvided = entry.transactionCount !== '' && entry.transactionCount != null && Number.isFinite(txns);

  if (!salesUsable) {
    return { ...entry, threshold, crossed: null, status: 'Check inputs' };
  }

  const salesMet = sales >= threshold.amount;
  const txnMet = threshold.transactions != null && txnsProvided && txns >= threshold.transactions;
  const needsTxnCount = threshold.transactions != null && !txnsProvided;

  let crossed;
  let status;
  if (threshold.condition === 'AND') {
    if (needsTxnCount) {
      crossed = salesMet ? null : false;
      status = salesMet
        ? `Sales alone meet $${threshold.amount.toLocaleString('en-US')}, but ${threshold.label} also requires ${threshold.transactions}+ transactions (both required) — enter a transaction count to know for sure`
        : `Below $${threshold.amount.toLocaleString('en-US')} — not crossed regardless of transaction count (${threshold.label} requires both)`;
    } else {
      crossed = salesMet && txnMet;
      status = crossed
        ? `Crossed — meets both $${threshold.amount.toLocaleString('en-US')} and ${threshold.transactions}+ transactions, which ${threshold.label} requires together`
        : `Not crossed — ${threshold.label} requires both the sales and transaction figures, and at least one is unmet`;
    }
  } else if (threshold.transactions != null) {
    crossed = salesMet || txnMet;
    if (crossed) {
      status = salesMet && txnMet
        ? `Crossed — meets both the $${threshold.amount.toLocaleString('en-US')} and ${threshold.transactions}+ transaction tests`
        : salesMet
          ? `Crossed — meets the $${threshold.amount.toLocaleString('en-US')} sales test (either test alone is enough)`
          : `Crossed — meets the ${threshold.transactions}+ transaction test (either test alone is enough)`;
    } else {
      status = `Below both the $${threshold.amount.toLocaleString('en-US')} and ${threshold.transactions}-transaction tests`;
    }
  } else {
    crossed = salesMet;
    status = salesMet
      ? `Crossed — meets or exceeds ${threshold.label}'s $${threshold.amount.toLocaleString('en-US')} threshold`
      : `Below ${threshold.label}'s $${threshold.amount.toLocaleString('en-US')} threshold`;
  }

  return {
    ...entry,
    grossSales: sales,
    transactionCount: txnsProvided ? txns : null,
    threshold,
    crossed,
    status,
  };
}

export function checkAll(entries) {
  return entries.map((entry, entryIndex) => ({ ...checkEntry(entry), entryIndex }));
}

export function removeEntry(entries, index) {
  if (!Array.isArray(entries)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return entries.slice();
  return entries.filter((_, i) => i !== index);
}

/**
 * A handful of entries that demonstrate every status shape the queue can
 * show, for a first-time visitor to see before typing anything real in.
 */
export function sampleEntries() {
  return [
    { state: 'CA', grossSales: 612000, transactionCount: '' },
    { state: 'NY', grossSales: 540000, transactionCount: '' }, // AND state, missing transaction count on purpose
    { state: 'AR', grossSales: 40000, transactionCount: 260 }, // under sales, over transactions (OR)
    { state: 'ID', grossSales: 61000, transactionCount: '' },
    { state: 'OR', grossSales: 300000, transactionCount: '' }, // no sales tax state
  ];
}

export function toCsv(rows) {
  const fields = ['state', 'grossSales', 'transactionCount', 'status'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
}

// Saved entries come back from localStorage, which is user-writable and can
// be left damaged by an interrupted write or an older page version. Drop
// anything that is not an object rather than letting one bad row blank the
// tracker -- same defensive shape as the sibling 1099-k-threshold-checker's
// loadSources.
export function loadEntries(value) {
  if (!value) return [];
  try {
    const entries = JSON.parse(value);
    return Array.isArray(entries) ? entries.filter((e) => e && typeof e === 'object') : [];
  } catch {
    return [];
  }
}
