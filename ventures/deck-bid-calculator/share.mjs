// Allowlisted share encoding for the deck bid calculator. A shared URL must
// reconstruct the same quote the sender saw — silently dropping height,
// railing, stairs, demo, or target margin is how two people compute different
// profits from the "same" link. Only these keys ride in the hash; anything
// else is ignored so a crafted fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'sections',
  'railingLf',
  'railingStyle',
  'stairs',
  'demoSf',
  'hourlyWage',
  'burdenRate',
  'milesOneWay',
  'speedMph',
  'setupHours',
  'minOnSiteHours',
  'tripFee',
  'disposalPerSf',
  'footingEach',
  'permitCost',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

const SECTION_KEYS = Object.freeze(['name', 'lengthFt', 'widthFt', 'heightFt', 'material']);
const STAIR_KEYS = Object.freeze(['name', 'runs', 'widthFt', 'risers']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(payload.sections)) {
    payload.sections = payload.sections.map(row => pick(row || {}, SECTION_KEYS));
  }
  if (Array.isArray(payload.stairs)) {
    payload.stairs = payload.stairs.map(row => pick(row || {}, STAIR_KEYS));
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
  if (Array.isArray(payload.sections)) {
    payload.sections = payload.sections.map(row => pick(row || {}, SECTION_KEYS));
  }
  if (Array.isArray(payload.stairs)) {
    payload.stairs = payload.stairs.map(row => pick(row || {}, STAIR_KEYS));
  }
  return payload;
}
