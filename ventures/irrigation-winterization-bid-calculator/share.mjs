// Allowlisted share encoding for the irrigation winterization calculator.
// A shared URL must reconstruct the same quote the sender saw — silently
// dropping drip zones, backflows, freeze-warning premium, or target margin
// is how two people compute different profits from the "same" link. Only
// these keys ride in the hash; anything else is ignored so a crafted
// fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'systems',
  'sprayMinutes',
  'rotorMinutes',
  'dripMinutes',
  'backflows',
  'backflowMinutes',
  'freezeWarning',
  'afterHoursPremium',
  'hourlyWage',
  'burdenRate',
  'milesOneWay',
  'speedMph',
  'setupHours',
  'minOnSiteHours',
  'tripFee',
  'compressorCost',
  'fittingsCost',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

const SYSTEM_KEYS = Object.freeze([
  'name',
  'sprayZones',
  'rotorZones',
  'dripZones',
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
  if (Array.isArray(payload.systems)) {
    payload.systems = payload.systems.map(system => pick(system || {}, SYSTEM_KEYS));
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
  if (Array.isArray(payload.systems)) {
    payload.systems = payload.systems.map(system => pick(system || {}, SYSTEM_KEYS));
  }
  return payload;
}
