// Shareable bid link. A spray-foam crew comparing a takeoff with a foam
// distributor, a GC, or an office manager needs the recipient to see the
// exact same job -- plane, cell, rim, coating, waste, every hour and rate --
// not just the headline price a screenshot would show. Retyping thirty-plus
// numbers is how that comparison never happens. The transform is pure: no
// DOM, no storage, no network, and everything after the # never reaches a
// server.
//
// Enum fields are checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set them to
// values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left off
// an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `well-pump-bid-calculator` and `fireplace-insert-bid-
// calculator` use -- not duplicated here, so the calculators cannot drift on
// how those five fields are carried. Company and customer details are
// deliberately left out: they persist per-device via `proposal.mjs`'s
// `loadCompany`/`saveCompany`, and a customer's name or address has no
// business riding in a URL two people paste into text or email.

import { AREA_PRESETS, CELL_PRESETS, PITCH_PRESETS, BARRIER_PRESETS, ACCESS_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'lengthFeet', 'widthFeet', 'thicknessInches', 'rimLf', 'rimHeightInches', 'rimThicknessInches',
  'hoursTrip', 'hoursPer1000Bf', 'hoursRimPerLf', 'hoursBarrierPer100Sf', 'hoursAccess', 'siteHours',
  'areaSf', 'openBf', 'closedBf', 'rimBf', 'wastePercent', 'orderOpenBf', 'orderClosedBf',
  'foamPerBfOpen', 'foamPerBfClosed', 'barrierPerSf', 'consumablesLump', 'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['includePermit'];

// Mirrors the <select id="area"> / <select id="cell"> / <select id="pitch"> /
// <select id="barrier"> / <select id="access"> options in index.html, sourced
// from calc.mjs so the allowed values cannot drift out of step with the
// presets the form offers.
export const AREA_VALUES = AREA_PRESETS.map((preset) => preset.id);
export const CELL_VALUES = CELL_PRESETS.map((preset) => preset.id);
export const PITCH_VALUES = PITCH_PRESETS.map((preset) => preset.id);
export const BARRIER_VALUES = BARRIER_PRESETS.map((preset) => preset.id);
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
  const area = usableEnum(inputs?.area, AREA_VALUES);
  if (area !== null) params.set('area', area);
  const cell = usableEnum(inputs?.cell, CELL_VALUES);
  if (cell !== null) params.set('cell', cell);
  const pitch = usableEnum(inputs?.pitch, PITCH_VALUES);
  if (pitch !== null) params.set('pitch', pitch);
  const barrier = usableEnum(inputs?.barrier, BARRIER_VALUES);
  if (barrier !== null) params.set('barrier', barrier);
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
  if (params.has('area')) {
    const area = usableEnum(params.get('area'), AREA_VALUES);
    if (area !== null) inputs.area = area;
  }
  if (params.has('cell')) {
    const cell = usableEnum(params.get('cell'), CELL_VALUES);
    if (cell !== null) inputs.cell = cell;
  }
  if (params.has('pitch')) {
    const pitch = usableEnum(params.get('pitch'), PITCH_VALUES);
    if (pitch !== null) inputs.pitch = pitch;
  }
  if (params.has('barrier')) {
    const barrier = usableEnum(params.get('barrier'), BARRIER_VALUES);
    if (barrier !== null) inputs.barrier = barrier;
  }
  if (params.has('access')) {
    const access = usableEnum(params.get('access'), ACCESS_VALUES);
    if (access !== null) inputs.access = access;
  }
  return inputs;
}
