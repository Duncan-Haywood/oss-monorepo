// Shareable bid link. A shop comparing a takeoff with a partner, a
// supply-house counter rep, or an office manager needs the recipient to see
// the exact same job -- shape, depth, mil, bead, stairs, pattern, access,
// every span, hour, and rate -- not just the headline price a screenshot
// would show. Retyping forty-plus numbers is how that second opinion never
// happens. The transform is pure: no DOM, no storage, no network, and
// everything after the # never reaches a server.
//
// Enum fields (shape, depth, mil, bead, stairs, pattern, access) are checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set them to values the form's own
// <select>s could have produced -- the drift class CLAUDE.md's "RENAME
// SUSPECTED" note describes for a select field left off an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `pool-plaster-bid-calculator` and
// `concrete-lifting-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per-device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import {
  SHAPE_PRESETS, DEPTH_PRESETS, MIL_PRESETS, BEAD_PRESETS, STAIR_PRESETS, PATTERN_PRESETS, ACCESS_PRESETS,
} from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'lengthFeet', 'widthFeet', 'wallHeightFeet',
  'hoursTrip', 'hoursPer100SfLiner', 'hoursStairs', 'hoursBead', 'hoursPerTrackLf', 'hoursCove', 'hoursFoam',
  'hoursAccess', 'hoursPump', 'hoursCover', 'siteHours',
  'waterSurfaceSf', 'perimeterLf', 'wallSf', 'hopperExtraSf', 'stairSf', 'linerSf', 'wastePercent', 'orderSf',
  'linerPerSf', 'fittingsLump', 'disposalFee', 'trackPerLf', 'coveLump', 'foamPerLf', 'coverFee',
  'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = [
  'replaceTrack', 'replaceCove', 'replaceWallFoam', 'includeCover', 'includePermit', 'pumpDown',
];

// Mirrors the <select> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const SHAPE_VALUES = SHAPE_PRESETS.map((preset) => preset.id);
export const DEPTH_VALUES = DEPTH_PRESETS.map((preset) => preset.id);
export const MIL_VALUES = MIL_PRESETS.map((preset) => preset.id);
export const BEAD_VALUES = BEAD_PRESETS.map((preset) => preset.id);
export const STAIR_VALUES = STAIR_PRESETS.map((preset) => preset.id);
export const PATTERN_VALUES = PATTERN_PRESETS.map((preset) => preset.id);
export const ACCESS_VALUES = ACCESS_PRESETS.map((preset) => preset.id);

const ENUM_FIELDS = Object.freeze({
  shape: SHAPE_VALUES,
  depth: DEPTH_VALUES,
  mil: MIL_VALUES,
  bead: BEAD_VALUES,
  stairs: STAIR_VALUES,
  pattern: PATTERN_VALUES,
  access: ACCESS_VALUES,
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
