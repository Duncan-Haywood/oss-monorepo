// Allowlisted share encoding for the drywall calculator. A shared URL must
// reconstruct the same quote the sender saw — silently dropping a field
// (finish level, waste, tear-out, target margin) is how two people compute
// different profits from the "same" link. Only these keys ride in the hash;
// anything else is ignored so a crafted fragment cannot inject unexpected
// behavior.

export const SHARE_FIELDS = Object.freeze([
  'rooms',
  // The board and texture the bid is for. Neither is arithmetic — the rates
  // they stamp are — but both name the work on the customer's proposal
  // ("textureLabel"), and they were reconstructed on arrival by matching the
  // four carried rates back against the preset table. A setter who typed their
  // own sheet price, which is the ordinary case, matched nothing: the
  // recipient's page read "Other / custom rates" and "No texture" over the
  // sender's Type X and orange peel, and printed a proposal that named neither.
  'boardType',
  'textureType',
  'openingSqFt',
  'openingCount',
  'wastePercent',
  'hangHoursPer100',
  'materialPer100',
  'sheetSqFt',
  'tapeLfPerSqFt',
  'finishLevel',
  'textureHoursPer100',
  'textureMaterialPer100',
  'tearOff',
  'tearOffHoursPer100',
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

const ROOM_KEYS = Object.freeze(['name', 'lengthFt', 'widthFt', 'heightFt', 'includeCeiling']);
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
  if (Array.isArray(payload.rooms)) {
    payload.rooms = payload.rooms.map(room => pick(room || {}, ROOM_KEYS));
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
  if (Array.isArray(payload.rooms)) {
    payload.rooms = payload.rooms.map(room => pick(room || {}, ROOM_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
  }
  return payload;
}
