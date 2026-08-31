// Allowlisted share encoding for the concrete bid calculator. A shared URL
// must reconstruct the same pour the sender saw — silently dropping a field
// (a slab's thickness, the waste percentage, the target margin) is how two
// people compute different profits from the "same" link. Only these keys
// ride in the hash; anything else is ignored so a crafted fragment cannot
// inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'wastePct', 'concretePerYd', 'formPerLf', 'formHours', 'reinforcementPerSqFt', 'pumpFee',
  'shortLoadThresholdYd', 'shortLoadFee', 'demoSqFt', 'demoThicknessIn', 'haulPerYd', 'demoHours',
  'prepHours', 'hourlyWage', 'burdenRate', 'otherCost', 'overheadRate', 'targetMargin', 'proposedPrice',
]);

// `name` travels as the finish preset's own label — `addSlabRow` matches it
// back to a preset index, or to "Other finish" when nothing matches — so a
// slab priced with a preset the sender edited restores as that preset, not
// as whichever preset happens to sit first in the list.
const SLAB_KEYS = Object.freeze(['name', 'lengthFt', 'widthFt', 'thicknessIn', 'hoursPer100']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.slabs)) {
    payload.slabs = input.slabs.map(row => pick(row || {}, SLAB_KEYS));
  }
  if (typeof input?.reinforcement === 'string') payload.reinforcement = input.reinforcement;
  if (typeof input?.access === 'string') payload.access = input.access;
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
  if (Array.isArray(parsed.slabs)) {
    payload.slabs = parsed.slabs
      .map(row => pick(row || {}, SLAB_KEYS))
      .filter(row => Object.keys(row).length > 0);
  }
  if (typeof parsed.reinforcement === 'string') payload.reinforcement = parsed.reinforcement;
  if (typeof parsed.access === 'string') payload.access = parsed.access;
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
