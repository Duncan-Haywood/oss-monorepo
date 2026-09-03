// Shareable bid link. A refinisher comparing a job with a partner, an
// estimator, or a customer asking how a price was built needs the recipient
// to see the exact same job -- the field square footage, the stair and
// closet counts, the method and stain choice, every rate -- not just the
// headline price a screenshot would show. Retyping twenty-plus numbers is
// how that comparison never happens. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// Each field is validated the same way the form itself would reject a bad
// value (no negative numbers), and the method and stain choices are checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set known fields to values the form could
// have produced -- the same drift class a select field left off an
// allowlist caused on the paver-patio and roofing calculators (#2962).
//
// Company details and the customer's name and address are deliberately
// left out: those already persist per-device via proposal.mjs's
// loadCompany/saveCompany, and a customer's name or address has no business
// riding in a URL two people paste into text or email.

import { METHOD_PRESETS, STAIN_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'floorSqFt', 'treads', 'closets', 'hoursPer100', 'hoursPerTread', 'hoursPerCloset',
  'methodLaborFactor', 'stainHoursPer100', 'extraCoats', 'extraCoatHoursPer100',
  'furnitureHours', 'repairHours', 'baseCoats', 'finishCoverage', 'stainCoverage',
  'finishCost', 'stainCost', 'suppliesPer100', 'hourlyWage', 'burdenRate',
  'travelAndEquipment', 'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['staining'];

// Mirrors the <select id="methodId"> / <select id="stainId"> options in
// index.html, sourced from calc.mjs so the allowed values cannot drift out
// of step with the presets the form itself offers.
export const METHOD_VALUES = METHOD_PRESETS.map((preset) => preset.id);
export const STAIN_VALUES = STAIN_PRESETS.map((preset) => preset.id);

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
  const methodId = usableEnum(inputs?.methodId, METHOD_VALUES);
  if (methodId !== null) params.set('methodId', methodId);
  const stainId = usableEnum(inputs?.stainId, STAIN_VALUES);
  if (stainId !== null) params.set('stainId', stainId);
  if (inputs?.staining !== undefined) {
    params.set('staining', inputs.staining ? '1' : '0');
  }
  return params.toString();
}

export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const trimmed = source.replace(/^[?#]/, '');
  const params = new URLSearchParams(trimmed);
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  if (params.has('methodId')) {
    const methodId = usableEnum(params.get('methodId'), METHOD_VALUES);
    if (methodId !== null) inputs.methodId = methodId;
  }
  if (params.has('stainId')) {
    const stainId = usableEnum(params.get('stainId'), STAIN_VALUES);
    if (stainId !== null) inputs.stainId = stainId;
  }
  if (params.has('staining')) {
    inputs.staining = params.get('staining') === '1';
  }
  return inputs;
}
