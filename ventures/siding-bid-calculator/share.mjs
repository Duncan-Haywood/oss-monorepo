// Allowlisted share encoding for the siding calculator. A shared URL must
// reconstruct the same quote the sender saw — silently dropping a field
// (waste, stories, tear-off, target margin) is how two people compute
// different profits from the "same" link. Only these keys ride in the hash;
// anything else is ignored so a crafted fragment cannot inject unexpected
// behavior.

export const SHARE_FIELDS = Object.freeze([
  'walls',
  // The material the bid is for. Not arithmetic — the three rates it stamps
  // are — but it names the work on the customer's proposal, and it used to be
  // reconstructed on arrival by matching those rates back against the preset
  // table. A setter who typed their own supplier price, which is the ordinary
  // case, matched nothing: the recipient's page read "Other / custom rates"
  // over the sender's fiber cement.
  'materialType',
  'openingSqFt',
  'openingCount',
  'wastePercent',
  'hoursPerSquare',
  'materialPerSquare',
  'tearOffHoursPerSquare',
  'stories',
  'tearOff',
  'housewrap',
  'housewrapPerSqFt',
  'accessories',
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

const WALL_KEYS = Object.freeze(['name', 'lengthFt', 'heightFt']);
const ACCESSORY_KEYS = Object.freeze(['id', 'label', 'linearFeet', 'hoursPer100Lf', 'materialPerLf']);
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
  if (Array.isArray(payload.walls)) {
    payload.walls = payload.walls.map(wall => pick(wall || {}, WALL_KEYS));
  }
  if (Array.isArray(payload.accessories)) {
    payload.accessories = payload.accessories.map(item => pick(item || {}, ACCESSORY_KEYS));
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
  if (Array.isArray(payload.walls)) {
    payload.walls = payload.walls.map(wall => pick(wall || {}, WALL_KEYS));
  }
  if (Array.isArray(payload.accessories)) {
    payload.accessories = payload.accessories.map(item => pick(item || {}, ACCESSORY_KEYS));
  }
  if (Array.isArray(payload.addOns)) {
    payload.addOns = payload.addOns.map(item => pick(item || {}, ADD_ON_KEYS));
  }
  return payload;
}
