// Allowlisted share encoding for the gutter cleaning bid calculator. A
// shared URL must reconstruct the same visit bid the sender saw — silently
// dropping a run's story, pitch, guards, or debris preset is how two people
// compute different profit from the "same" link. Only these keys ride in
// the hash; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'hourlyWage',
  'burdenRate',
  'minutesPer10ft',
  'minutesPerDownspout',
  'travelMinutes',
  'disposalPerVisit',
  'equipmentPerVisit',
  'overheadRate',
  'targetMargin',
  'visitsPerYear',
  'minimumCharge',
  'proposedPrice',
  'runs',
]);

const RUN_KEYS = Object.freeze(['name', 'linearFeet', 'story', 'pitch', 'guards', 'debris', 'downspouts']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(payload.runs)) {
    payload.runs = payload.runs.map(row => pick(row || {}, RUN_KEYS));
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
  if (Array.isArray(payload.runs)) {
    payload.runs = payload.runs.map(row => pick(row || {}, RUN_KEYS));
  }
  return payload;
}
