// Allowlisted share encoding for the snow removal bid calculator. A shared
// URL must reconstruct the same winter bid the sender saw — silently
// dropping a stop's minutes, salt bags, or the expected event counts is how
// two people compute different profit from the "same" link. Only these keys
// ride in the hash; anything else is ignored so a crafted fragment cannot
// inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'operatorWage',
  'burdenRate',
  'truckHourly',
  'deadheadMinutesPerSite',
  'saltCostPerBag',
  'overheadRate',
  'targetMargin',
  'passesPerSnowEvent',
  'expectedSnowEvents',
  'expectedIceEvents',
  'proposedSeasonal',
  'proposedPerPush',
  'sites',
  // The proposal panel's terms (`platform/proposal/adopt.mjs`). Left off this
  // list until now, so a shared link opened the sender's price under the
  // recipient's own default 30%/30-day deposit terms — see
  // `platform/proposal/term-ids.test.mjs`.
  'depositPercent', 'validDays', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
]);

const SITE_KEYS = Object.freeze(['name', 'minutesPerPush', 'sidewalkMinutes', 'saltBags', 'iceMinutes', 'iceSaltBags']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(payload.sites)) {
    payload.sites = payload.sites.map(row => pick(row || {}, SITE_KEYS));
  }
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
  if (Object.keys(payload).length === 0) return null;
  if (Array.isArray(payload.sites)) {
    payload.sites = payload.sites.map(row => pick(row || {}, SITE_KEYS));
  }
  return payload;
}
