// Allowlisted share encoding for the deck staining bid calculator. A shared
// URL must reconstruct the same bid the sender saw — silently dropping the
// prep, finish, or access choice is how two people compute different prices
// from the "same" link. Only these keys ride in the hash; anything else is
// ignored so a crafted fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'deckSqFt', 'railLinealFeet', 'railSfPerLf', 'stairRuns', 'stairSf',
  'hoursTrip', 'hoursPer100SfPrep', 'hoursPer100SfCoat', 'coats',
  'hoursAccess', 'hoursFurniture', 'siteHours',
  'prepMaterialPer100Sf', 'stainPerGallon', 'coverageSfPerGallon',
  'furnitureFee', 'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
  'prep', 'finish', 'access',
  'moveFurniture',
  // The proposal panel's terms (`platform/proposal/adopt.mjs`). Left off this
  // list until now, so a shared link opened the sender's price under the
  // recipient's own default 30%/30-day deposit terms — see
  // `platform/proposal/term-ids.test.mjs`.
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
