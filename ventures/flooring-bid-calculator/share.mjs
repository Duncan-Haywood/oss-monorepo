// Allowlisted share encoding for the flooring bid calculator. A shared URL
// must reconstruct the same job the sender priced — silently dropping a
// field (a room's waste percent, the target margin, the stair count) is how
// two people compute different profits from the "same" link. Only these keys
// ride in the hash; anything else is ignored so a crafted fragment cannot
// inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'materialCostPerSqFt', 'underlaymentCostPerSqFt', 'stairTreads', 'hoursPerTread', 'stairMaterialEach',
  'transitionCount', 'hoursPerTransition', 'transitionMaterialEach', 'furnitureRooms', 'hoursPerFurnitureRoom',
  'levelingSqFt', 'hoursPer100Leveling', 'levelingMaterialPerSqFt', 'baseboardLf', 'hoursPer100Baseboard',
  'baseboardMaterialPerLf', 'hourlyWage', 'burdenRate', 'dumpFee', 'travelCost', 'otherCost', 'overheadRate',
  'targetMargin', 'proposedPrice',
]);

// `material` and `tearout` travel as the preset's own label, the same choice
// `share.mjs` in concrete-bid-calculator makes for a slab's finish preset —
// `addRoomRow` matches the label back to a preset index, or to "Other
// material"/the first tear-out option when nothing matches, so a room priced
// with a preset the sender edited restores as that preset rather than
// whichever preset happens to sit first in the list.
const ROOM_KEYS = Object.freeze(['name', 'material', 'squareFeet', 'wastePct', 'installSqFtPerHour', 'tearout']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.rooms)) {
    payload.rooms = input.rooms.map(row => pick(row || {}, ROOM_KEYS));
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
  if (Array.isArray(parsed.rooms)) {
    payload.rooms = parsed.rooms
      .map(row => pick(row || {}, ROOM_KEYS))
      .filter(row => Object.keys(row).length > 0);
  }
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
