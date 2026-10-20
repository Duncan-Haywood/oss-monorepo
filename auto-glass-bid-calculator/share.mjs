// Shareable bid link. A technician comparing a quote with a shop manager, an
// insurance adjuster, or a customer needs the recipient to see the exact same
// job -- glass position, source, calibration requirement, service, payer,
// and every hour, cost, and margin figure -- not just the headline price a
// screenshot would show. Retyping nineteen fields is how that comparison
// never happens, and a silently dropped field is how the recipient computes
// a different price than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// This venture prices one job as a fixed field set -- position, source,
// calibration, service, and payer are each a single select, and every rate
// is a single number or checkbox -- so the plain "one query param per field"
// pattern from sump-pump-bid-calculator's share.mjs applies directly.
//
// Position, source, calibration, service, and payer are each checked against
// calc.mjs's own preset ids rather than a hand-duplicated list, so a crafted
// or stale link can only set them to a value the form's own <select> could
// have produced.
//
// The customer's name, vehicle, and job address have no business riding in a
// URL two people paste into text or email, so this venture carries none of
// them -- there is no company/client persistence layer here at all.

import {
  GLASS_POSITION_PRESETS,
  GLASS_SOURCE_PRESETS,
  CALIBRATION_PRESETS,
  SERVICE_PRESETS,
  PAYER_PRESETS,
} from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'hoursRR', 'hoursCalibration', 'tripHours', 'wiperServiceHours', 'siteHours',
  'glassCost', 'moldingCost', 'urethaneKitCost', 'calibrationCost', 'tripFee', 'wiperServiceCost',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'cashDiscountPercent', 'deductible', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['addWiperService'];

// Mirrors the <select id="position">/<select id="glassSource">/
// <select id="calibration">/<select id="service">/<select id="payer">
// options in index.html, sourced from calc.mjs so the allowed values cannot
// drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  position: GLASS_POSITION_PRESETS.map((preset) => preset.id),
  glassSource: GLASS_SOURCE_PRESETS.map((preset) => preset.id),
  calibration: CALIBRATION_PRESETS.map((preset) => preset.id),
  service: SERVICE_PRESETS.map((preset) => preset.id),
  payer: PAYER_PRESETS.map((preset) => preset.id),
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
