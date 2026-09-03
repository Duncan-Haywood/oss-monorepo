// Allowlisted share encoding for the sealcoating calculator. A shared URL
// must reconstruct the same quote the sender saw — silently dropping coats,
// oil spots, or target margin is how two people compute different profits
// from the "same" link. Only these keys ride in the hash; anything else is
// ignored so a crafted fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'surfaces',
  'condition',
  'method',
  'oilSpots',
  'crackFeet',
  'stalls',
  'sand',
  'addOns',
  'hourlyWage',
  'burdenRate',
  'milesOneWay',
  'speedMph',
  'setupHours',
  'minOnSiteHours',
  'tripFee',
  'sealerPerGallon',
  'primerPerGallon',
  'crackFillerPerFoot',
  'sandPerBag',
  'paintPerStall',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

const SURFACE_KEYS = Object.freeze([
  'name',
  'squareFeet',
  'coats',
  'firstCoatSqFtPerGal',
  'secondCoatSqFtPerGal',
]);
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
  if (Array.isArray(payload.surfaces)) {
    payload.surfaces = payload.surfaces.map(surface => pick(surface || {}, SURFACE_KEYS));
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
  if (Array.isArray(payload.surfaces)) {
    payload.surfaces = payload.surfaces.map(surface => pick(surface || {}, SURFACE_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
  }
  return payload;
}
