// Shareable bid link. A screen porch builder comparing a takeoff with a
// partner, a supply-house counter rep, or an office manager needs the
// recipient to see the exact same job -- attachment, roof, ceiling, mesh,
// wall height, every span and rate -- not just the headline price a
// screenshot would show. Retyping forty-plus fields is how that second
// opinion never happens. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// Enum fields (attachment, roof, ceiling, mesh, height) are checked against
// calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set them to values the form's own
// <select>s could have produced -- the drift class CLAUDE.md's "RENAME
// SUSPECTED" note describes for a select field left off an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `pool-plaster-bid-calculator` and
// `vinyl-liner-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company
// and customer details are deliberately left out: they persist per-device
// via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name
// or address has no business riding in a URL two people paste into text or
// email.

import {
  ATTACHMENT_PRESETS, ROOF_PRESETS, CEILING_PRESETS, MESH_PRESETS, HEIGHT_PRESETS,
} from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'widthFeet', 'depthFeet', 'kneeWallInches', 'panelWidthInches', 'doorCount',
  'hoursTrip', 'hoursPerPanel', 'extraHoursPerPanel', 'hoursPer100SfScreen', 'hoursPerKneeLf',
  'hoursPer100SfRoof', 'hoursPer100SfCeiling', 'hoursPerDoor', 'hoursFan', 'hoursDemo', 'hoursSite',
  'siteHours', 'wallHeightFeet', 'perimeterLf', 'wallScreenSf', 'roofSf', 'ceilingSf',
  'kneeWallLf', 'panelCount', 'screenPerSf', 'panelEach', 'kneeWallPerLf', 'roofPerSf',
  'ceilingPerSf', 'doorEach', 'hardwareLump', 'fanFee', 'demoFee', 'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['includeFan', 'includePermit', 'demoExisting'];

// Mirrors the <select> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const ATTACHMENT_VALUES = ATTACHMENT_PRESETS.map((preset) => preset.id);
export const ROOF_VALUES = ROOF_PRESETS.map((preset) => preset.id);
export const CEILING_VALUES = CEILING_PRESETS.map((preset) => preset.id);
export const MESH_VALUES = MESH_PRESETS.map((preset) => preset.id);
export const HEIGHT_VALUES = HEIGHT_PRESETS.map((preset) => preset.id);

const ENUM_FIELDS = Object.freeze({
  attachment: ATTACHMENT_VALUES,
  roof: ROOF_VALUES,
  ceiling: CEILING_VALUES,
  mesh: MESH_VALUES,
  height: HEIGHT_VALUES,
});

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
