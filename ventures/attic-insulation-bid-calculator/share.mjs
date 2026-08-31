// Allowlisted share encoding for the attic insulation calculator. A shared
// URL must reconstruct the same quote the sender saw — silently dropping a
// field (target R, bag yield, air-sealing penetrations, removal, target
// margin) is how two people compute different profits from the "same" link.
// Only these keys ride in the hash; anything else is ignored so a crafted
// fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'areas',
  // The product the bid is for. Not arithmetic — the four rates it stamps are
  // — but it names the material in the scope lines the customer reads
  // ("blow blown fiberglass over 894 sq ft…"), and it used to be reconstructed
  // on arrival by matching those rates back against the preset table. A setter
  // who typed their own bag price, which is the ordinary case, matched
  // nothing: the recipient's page fell to "Other / custom rates" and the
  // proposal it drafted said only "blow insulation".
  'productType',
  'rPerInch',
  'cuFtPerBag',
  'pricePerBag',
  'blowHoursPer1000',
  'baffleCount',
  'bafflePrice',
  'penetrations',
  'removeExisting',
  'removalHoursPer1000',
  'addOns',
  'hourlyWage',
  'burdenRate',
  'milesOneWay',
  'speedMph',
  'setupHours',
  'minOnSiteHours',
  'tripFee',
  'dumpsterCost',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

const AREA_KEYS = Object.freeze(['name', 'lengthFt', 'widthFt', 'existingR', 'targetR', 'vaulted']);
const ADD_ON_KEYS = Object.freeze(['id', 'label', 'hours', 'parts', 'enabled']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(payload.areas)) {
    payload.areas = payload.areas.map(area => pick(area || {}, AREA_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
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
  if (Array.isArray(payload.areas)) {
    payload.areas = payload.areas.map(area => pick(area || {}, AREA_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
  }
  return payload;
}
