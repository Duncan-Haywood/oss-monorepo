// Allowlisted share encoding for the paver patio bid calculator. A shared
// URL must reconstruct the same quote the sender saw — silently dropping
// base depth, pattern waste, haul-away, or target margin is how two people
// compute different profits from the "same" link. Only these keys ride in
// the hash; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'lengthFeet',
  'widthFeet',
  'wastePct',
  'patternLaborFactor',
  'hoursPerFinishedSf',
  'hoursPerEdgeLf',
  'excavateYdPerHour',
  'baseDepthIn',
  'beddingIn',
  'paverThicknessIn',
  'edgeLf',
  'haulAway',
  'paverCostPerSf',
  'gravelCostPerCuYd',
  'sandCostPerCuYd',
  'polymericCoverageSf',
  'polymericBagCost',
  'edgeCostPerLf',
  'haulCostPerCuYd',
  'hourlyWage',
  'burdenRate',
  'travelAndEquipment',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
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
  return payload;
}
