// Allowlisted share encoding for the lawn care bid calculator. A shared URL
// must reconstruct the same quote the sender saw — silently dropping the
// crew wage, the travel time, or the proposed price is how two people
// compute different profits from the "same" link. Only these keys ride in
// the payload; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'visitsPerWeek',
  'serviceWeeksPerYear',
  'oneWayMinutes',
  'crewSize',
  'hourlyWage',
  'burdenRate',
  'fuelPerVisit',
  'dumpPerVisit',
  'equipmentMonthly',
  'otherMonthly',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

// Everything `readServices()` in index.html puts on a service row, so a
// shared link reconstructs the exact same row whether it matched a service
// preset by name or was hand-edited into a custom one.
const SERVICE_KEYS = Object.freeze(['name', 'unit', 'quantity', 'productionRate']);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    const value = object?.[key];
    // A blank field is not the number zero. `proposedPrice` left blank means
    // "no price to compare"; `Number('')` is 0 in JavaScript, so carrying an
    // empty string through would let a shared link silently invent a $0
    // proposed price — or a $0 wage, crew size, or travel time — the sender
    // never typed.
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.services)) {
    const services = input.services.map(service => pick(service, SERVICE_KEYS));
    if (services.length > 0) payload.services = services;
  }
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^[#?]/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const payload = pick(parsed, SHARE_FIELDS);
  if (Array.isArray(parsed.services)) {
    const services = parsed.services
      .filter(service => service && typeof service === 'object' && !Array.isArray(service))
      .map(service => pick(service, SERVICE_KEYS));
    if (services.length > 0) payload.services = services;
  }
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
