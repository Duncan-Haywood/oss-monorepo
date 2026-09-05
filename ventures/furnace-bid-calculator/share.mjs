// Shareable bid link. An HVAC shop comparing a furnace or heat-pump takeoff
// with a homeowner, spouse, or GC needs the recipient to see the exact same
// job -- capacity, equipment, install location, extra duct past the included
// run, matching coil, gas upsize, haul-away, thermostat, and every hour and
// dollar figure -- not just the headline price a screenshot would show.
// Retyping twenty-plus fields is how that comparison never happens, and a
// silently dropped field is how the recipient computes a different price
// than the sender saw. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// This venture prices one job as a fixed field set -- capacity, equipment,
// location, duct footage, and every rate are each a single number or select
// the shop types or picks, not a visitor-grown list of rows like
// `carpet-cleaning-bid-calculator`'s rooms/upholstery -- so the plain "one
// query param per field" pattern from `exterior-painting-bid-calculator` and
// the other twelve ventures that already closed this gap applies directly.
//
// Capacity, equipment, and location are each checked against calc.mjs's own
// preset ids rather than a hand-duplicated list, so a crafted or stale link
// can only set them to a value the form's own `<select>` could have
// produced -- the drift class CLAUDE.md's "RENAME SUSPECTED" note describes
// for a select field left off an allowlist. Matching evaporator coil, gas
// upsize, haul-away, and new thermostat are checkboxes rather than numbers
// or an enum, so each travels as '1'/'0' the same way
// `electrical-panel-upgrade-bid-calculator`'s replace-meter-socket, new
// grounding, and temporary power checkboxes do.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `countertop-bid-calculator` and
// `foundation-repair-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company
// and customer details are deliberately left out: they persist per device
// via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { CAPACITY_PRESETS, EQUIPMENT_PRESETS, LOCATION_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'ductFeet', 'includedDuctFeet',
  'hoursTrip', 'hoursFurnaceBase', 'hoursLocation', 'hoursPerExtraDuctFoot',
  'hoursCoil', 'hoursGas', 'hoursHaul', 'hoursThermostat', 'siteHours',
  'furnaceCost', 'furnacePremium', 'coilCost', 'gasCost', 'ductPerFoot',
  'haulFee', 'thermostatCost', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['addCoil', 'addGas', 'haulAway', 'addThermostat'];

// Mirrors the <select id="capacity">/<select id="equipment">/<select
// id="location"> options in index.html, sourced from calc.mjs so the allowed
// values cannot drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  capacity: CAPACITY_PRESETS.map((preset) => preset.id),
  equipment: EQUIPMENT_PRESETS.map((preset) => preset.id),
  location: LOCATION_PRESETS.map((preset) => preset.id),
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
