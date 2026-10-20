// Allowlisted share encoding for the pressure-washing bid calculator. A
// shared URL must reconstruct the same job the sender priced — silently
// dropping a surface's chemical cost, the drive time, or the target margin
// is how two people compute different profits from the "same" link. Only
// these keys ride in the hash; anything else is ignored so a crafted
// fragment cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'hourlyWage', 'burdenRate', 'roundTripMinutes', 'setupMinutes', 'waterCost',
  'equipmentWear', 'otherCost', 'overheadRate', 'targetMargin', 'minimumJob',
  'packageVisits', 'packageDiscount', 'proposedPrice',
]);

// `name` travels as the surface preset's own label — `addSurfaceRow` matches
// it back to a preset index, or to "Other surface" when nothing matches — so
// a surface priced with a preset the sender edited (a custom production rate
// or chemical cost) restores as that preset, not as whichever preset happens
// to sit first in the list.
const SURFACE_KEYS = Object.freeze(['name', 'squareFeet', 'productionRate', 'chemicalCost']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.surfaces)) {
    payload.surfaces = input.surfaces.map(row => pick(row || {}, SURFACE_KEYS));
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
  if (Array.isArray(parsed.surfaces)) {
    payload.surfaces = parsed.surfaces
      .map(row => pick(row || {}, SURFACE_KEYS))
      .filter(row => Object.keys(row).length > 0);
  }
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
