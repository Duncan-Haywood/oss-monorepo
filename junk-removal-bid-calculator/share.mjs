// Allowlisted share encoding for the junk removal bid calculator. A shared
// URL must reconstruct the same job the sender saw — silently dropping a
// pile's weight, the dump-fee rate, or the target margin is how two people
// compute different profits from the "same" link. Only these keys ride in
// the hash; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'truckCapacityCubicYards', 'dumpFeePerTon', 'dumpMinimum', 'surchargeRate',
  'onSiteHours', 'stairsFlights', 'minutesPerFlight', 'longCarryMinutes',
  'oneWayMinutes', 'dumpMinutes', 'crewSize', 'hourlyWage', 'burdenRate',
  'fuelPerJob', 'otherJobCost', 'overheadRate', 'targetMargin', 'minimumCharge',
  'proposedPrice',
]);

// `name` travels as the material preset's own label — `addPileRow` matches
// it back to a preset, or to "Other material" when nothing matches — so a
// pile priced with a preset the sender edited restores as that preset, not
// as whichever preset happens to sit first in the list. `unit` and
// `cubicYardsEach` are not carried: they are looked up from the preset at
// read time (`readPiles()`), never stored on the row itself.
const PILE_KEYS = Object.freeze(['name', 'quantity', 'lbsPerUnit', 'specialFeeEach']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.piles)) {
    payload.piles = input.piles.map(row => pick(row || {}, PILE_KEYS));
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
  if (Array.isArray(parsed.piles)) {
    payload.piles = parsed.piles
      .map(row => pick(row || {}, PILE_KEYS))
      .filter(row => Object.keys(row).length > 0);
  }
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
