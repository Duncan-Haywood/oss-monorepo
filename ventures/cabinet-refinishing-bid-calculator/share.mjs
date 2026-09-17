// Shareable bid link. A refinisher comparing a takeoff with a homeowner,
// GC, or kitchen designer needs the recipient to see the exact same job --
// door and drawer counts, face-frame openings, hardware, finish method,
// color change, degrease hours, every coverage rate and cost -- not just
// the headline price a screenshot would show. Retyping twenty-plus numbers
// is how that comparison never happens. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// Enum fields are checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set them to
// values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left
// off an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `spray-foam-bid-calculator` and
// `basement-waterproofing-bid-calculator` use -- not duplicated here, so
// the calculators cannot drift on how those five fields are carried.
// Company and customer details are deliberately left out: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a
// customer's name or address has no business riding in a URL two people
// paste into text or email.

import { FINISH_PRESETS, COLOR_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'doors', 'drawers', 'openings', 'hardwarePieces', 'hoursPerDoor', 'hoursPerDrawer',
  'hoursPerOpening', 'hoursPerHardware', 'finishLaborFactor', 'extraCoats',
  'extraCoatHoursPerPiece', 'degreaseHours', 'primerCoverage', 'finishCoverage',
  'primerCost', 'finishCost', 'supplies', 'hardwareCost', 'hourlyWage', 'burdenRate',
  'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['replaceHardware'];

// Mirrors the <select id="finishId"> / <select id="colorId"> options in
// index.html, sourced from calc.mjs so the allowed values cannot drift out
// of step with the presets the form offers.
export const FINISH_VALUES = FINISH_PRESETS.map((preset) => preset.id);
export const COLOR_VALUES = COLOR_PRESETS.map((preset) => preset.id);

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
  const finishId = usableEnum(inputs?.finishId, FINISH_VALUES);
  if (finishId !== null) params.set('finishId', finishId);
  const colorId = usableEnum(inputs?.colorId, COLOR_VALUES);
  if (colorId !== null) params.set('colorId', colorId);
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
  if (params.has('finishId')) {
    const finishId = usableEnum(params.get('finishId'), FINISH_VALUES);
    if (finishId !== null) inputs.finishId = finishId;
  }
  if (params.has('colorId')) {
    const colorId = usableEnum(params.get('colorId'), COLOR_VALUES);
    if (colorId !== null) inputs.colorId = colorId;
  }
  return inputs;
}
