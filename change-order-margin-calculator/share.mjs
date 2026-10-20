// Allowlisted share encoding for the change-order margin calculator. A
// shared URL must reconstruct the same change order the sender saw —
// silently dropping the markup cap or the schedule delay is how two people
// compute different prices from the "same" link. Only these keys ride in
// the hash; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.
//
// The last five names are the customer-proposal panel's own terms (deposit,
// how long the price is held, and the three prose blocks), not a calculator
// field. `platform/proposal/term-ids.test.mjs` asserts this list agrees with
// the panel `platform/proposal/adopt.mjs` generated into this page's own
// TERM_IDS -- the panel and this list were not one list on 2026-08-29 for
// several other calculators, and a setter's deposit and terms silently did
// not survive their own share link. Carrying them here means the recipient
// of a shared link, and the sender's own saved draft on their next visit,
// see the same deposit and terms the sender was looking at, not this page's
// defaults.
export const SHARE_FIELDS = Object.freeze([
  'title', 'hours', 'wage', 'burdenPercent', 'materials', 'subcontractor',
  'daysAdded', 'dailyGeneralConditions', 'markupCapPercent',
  'overheadPercent', 'targetMarginPercent', 'proposedPrice',
  'depositPercent', 'validDays', 'paymentTerms', 'proposalNotes', 'proposalExclusions',
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  return encodeURIComponent(JSON.stringify(pick(input || {}, SHARE_FIELDS)));
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
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
