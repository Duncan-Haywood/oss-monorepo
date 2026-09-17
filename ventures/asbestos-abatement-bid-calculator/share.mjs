// Allowlisted share encoding for the asbestos abatement bid calculator. A
// contractor re-enters the same containment class, square footage, crew
// rates, air monitoring, and waste figures on every job walkthrough, and
// losing them when the tab closes is the reason a pricing tool gets used
// once and never opened again. "Copy share link" encodes the whole form
// into this page's own URL hash so a partner, the office, or the
// contractor's next visit opens the same job -- nothing is sent to a
// server, and only these keys ride in the link, so a crafted fragment
// cannot inject a field this calculator does not have.
//
// The proposal panel's terms (`platform/proposal/adopt.mjs`) are included
// too, for the reason `platform/proposal/term-ids.test.mjs` exists: a
// contractor who prices a 50% deposit held for 15 days and sends the link
// must not have the recipient's page reopen it under this venture's
// 30%/30-day defaults under a headline price that otherwise matches to the
// cent.

export const SHARE_FIELDS = Object.freeze([
  'containmentClass',
  'squareFootage',
  'containmentAreas',
  'crewSize',
  'crewHourlyRatePerWorker',
  'supervisorHourlyRate',
  'airMonitoringSamples',
  'airMonitoringCostPerSample',
  'wasteVolumeCubicYards',
  'disposalFeePerCubicYard',
  'requiresPermit',
  'permitFee',
  'rushJob',
  'rushSurchargePercentPct',
  'targetMarginPercentPct',
  'minimumJobFee',
  'naiveRatePerSquareFoot',
  // The proposal panel's terms -- see the file header and term-ids.test.mjs.
  'depositPercent', 'validDays', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^#/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const payload = pick(parsed, SHARE_FIELDS);
  return Object.keys(payload).length === 0 ? null : payload;
}
