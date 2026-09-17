// Shareable bid link. A spa dealer comparing an install with an office
// manager, a second estimator, or a homeowner needs the recipient to see
// the exact same job -- size, access path, power scope, circuit footage,
// every pad/haul/cover-lift/steps/gas add-on, and every wage, cost, and
// margin figure -- not just the headline price a screenshot would show.
// Retyping thirty-plus fields is how that comparison never happens, and a
// silently dropped field is how the recipient computes a different price
// than the sender saw. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// `size`, `access`, and `power` are themselves direct inputs to
// calculateBid -- billCircuit and billCrane read `power`/`access`
// directly, and unitCostMultiplier defaults off `size` -- not
// suggestion-only presets like retaining-wall's wallTypePreset, so they
// travel here as ENUM_FIELDS, checked against calc.mjs's own preset ids.
// The numeric fields those selects also *suggest*
// (hoursSet/unitCostMultiplier, hoursAccess, hoursPower --
// SUGGESTED_SIZE_IDS/SUGGESTED_ACCESS_IDS/SUGGESTED_POWER_IDS in
// index.html) already round-trip as plain NUMBER_FIELD_IDS, so a restored
// link reproduces the bid without those suggestion tables.
//
// `jobPresets` is left out, matching `sump-pump-bid-calculator`'s
// treatment of its own index-based bulk preset: it only re-derives fields
// this module already carries individually, and an index is meaningless
// once JOB_PRESETS is reordered.
//
// Deposit, hold-price days, and the proposal panel's other prose terms are
// deliberately left out, along with company and customer details: they
// persist per device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a
// customer's name or address has no business riding in a URL two people
// paste into text or email.

import { SIZE_PRESETS, ACCESS_PRESETS, POWER_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'circuitFeet',
  'hoursTrip', 'hoursSet', 'hoursAccess', 'hoursPower',
  'hoursPerCircuitFoot', 'hoursPad', 'hoursHaul', 'hoursCoverLift',
  'hoursSteps', 'hoursGas', 'siteHours',
  'unitCost', 'unitCostMultiplier', 'craneFee', 'circuitKit', 'circuitPerFoot',
  'padCost', 'haulFee', 'coverLiftCost', 'stepsCost', 'gasCost', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['addPad', 'addHaul', 'addCoverLift', 'addSteps', 'addGas'];

// Mirrors the <select id="size">/<select id="access">/<select id="power">
// options in index.html, sourced from calc.mjs so the allowed values
// cannot drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  size: SIZE_PRESETS.map((preset) => preset.id),
  access: ACCESS_PRESETS.map((preset) => preset.id),
  power: POWER_PRESETS.map((preset) => preset.id),
};

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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    const value = usableEnum(inputs?.[id], allowed);
    if (value !== null) params.set(id, value);
  }
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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
