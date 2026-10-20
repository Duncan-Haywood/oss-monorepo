// Shareable bid link. A crew comparing a takeoff with a homeowner, GC, or
// property manager needs the recipient to see the exact same job -- method,
// access, slab area, void depth, extra holes, joint seal, and every rate and
// cost -- not just the headline price a screenshot would show. Retyping
// twenty-plus numbers is how that comparison never happens, and a silently
// dropped field is how the recipient computes a different price than the
// sender saw. The transform is pure: no DOM, no storage, no network, and
// everything after the # never reaches a server.
//
// Enum fields (method, access) are checked against calc.mjs's own preset ids
// rather than a hand-duplicated list, so a crafted or stale link can only set
// them to values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note describes for a select field left off an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `cabinet-refinishing-bid-calculator` and
// `basement-waterproofing-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { METHOD_PRESETS, ACCESS_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'slabSqFt', 'voidInches', 'extraHoles',
  'hoursTrip', 'hoursLift', 'hoursAccess', 'hoursPerCf',
  'hoursPerExtraHole', 'hoursSeal', 'hoursInterior', 'siteHours',
  'materialPerCf', 'extraHoleCost', 'sealCost', 'interiorKit',
  'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['addSeal'];

// Mirrors the <select id="method"> / <select id="access"> options in
// index.html, sourced from calc.mjs so the allowed values cannot drift out of
// step with the presets the form offers.
export const METHOD_VALUES = METHOD_PRESETS.map((preset) => preset.id);
export const ACCESS_VALUES = ACCESS_PRESETS.map((preset) => preset.id);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    if (inputs?.[id] !== undefined) params.set(id, inputs[id] ? '1' : '0');
  }
  const method = usableEnum(inputs?.method, METHOD_VALUES);
  if (method !== null) params.set('method', method);
  const access = usableEnum(inputs?.access, ACCESS_VALUES);
  if (access !== null) params.set('access', access);
  return params.toString();
}

export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id) === '1';
  }
  if (params.has('method')) {
    const method = usableEnum(params.get('method'), METHOD_VALUES);
    if (method !== null) inputs.method = method;
  }
  if (params.has('access')) {
    const access = usableEnum(params.get('access'), ACCESS_VALUES);
    if (access !== null) inputs.access = access;
  }
  return inputs;
}
