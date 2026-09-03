// Allowlisted share encoding for the roofing bid calculator. A shared URL
// must reconstruct the same quote the sender saw — silently dropping a
// section's pitch, tear-off layers, waste, or target margin is how two
// people compute different profit from the "same" link. Only these keys
// ride in the hash; anything else is ignored so a crafted fragment cannot
// inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'materialPreset',
  'sections',
  'wastePercent',
  'materialPerSquare',
  'underlaymentPerSquare',
  'accessoriesFlat',
  'installHoursPerSquare',
  'tearOffHoursPerSquare',
  'hourlyWage',
  'burdenRate',
  'dumpPerSquare',
  'dumpsterFee',
  'permitFee',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

const SECTION_KEYS = Object.freeze(['name', 'footprintSqFt', 'pitchRise', 'tearOffLayers']);

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
  return payload;
}
