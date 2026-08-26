// Allowlisted share encoding for the window-replacement calculator. A shared
// URL must reconstruct the same quote the sender saw — silently dropping a
// field (story, United Inches, rot, target margin) is how two people compute
// different profits from the "same" link. Only these keys ride in the hash;
// anything else is ignored so a crafted fragment cannot inject unexpected
// behavior.

export const SHARE_FIELDS = Object.freeze([
  'openings',
  'hourlyWage',
  'burdenRate',
  'milesOneWay',
  'speedMph',
  'setupHours',
  'minOnSiteHours',
  'tripFee',
  'scaffoldingCost',
  'disposalPerOpening',
  'permitCost',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'addOns',
  'proposedPrice',
]);

const OPENING_KEYS = Object.freeze([
  'name', 'type', 'widthIn', 'heightIn', 'quantity', 'story', 'frame', 'install', 'condition', 'trim',
]);
const ADD_ON_KEYS = Object.freeze(['id', 'label', 'hoursPerOpening', 'partsPerOpening', 'enabled']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(payload.openings)) {
    payload.openings = payload.openings.map(row => pick(row || {}, OPENING_KEYS));
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
  if (Array.isArray(payload.openings)) {
    payload.openings = payload.openings.map(row => pick(row || {}, OPENING_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
  }
  return payload;
}
