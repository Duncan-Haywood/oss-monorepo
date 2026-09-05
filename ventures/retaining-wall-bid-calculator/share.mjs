// Shareable bid link. A hardscape contractor comparing a takeoff with an
// office manager, a homeowner, or a second estimator needs the recipient to
// see the exact same job -- wall length, exposed height, embedment, wall
// type, drain stone, geogrid layers, corners, the engineer/permit step, and
// every wage, cost, and margin figure -- not just the headline price a
// screenshot would show. Retyping twenty-plus fields is how that comparison
// never happens, and a silently dropped field is how the recipient computes
// a different price than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// This venture prices one job as a fixed field set -- length, height,
// drainage, geogrid, corners, and every rate are each a single number, not a
// visitor-grown list of rows like `carpet-cleaning-bid-calculator`'s
// rooms/upholstery -- so the plain "one query param per field" pattern from
// `gutter-install-bid-calculator` and the other ventures that already closed
// this gap applies directly.
//
// Unlike gutter-install's profile/stories, this venture's wall-type, height,
// and engineer/permit `<select>`s are not themselves inputs to
// `calculateBid` -- they only suggest starting values for wallTypeFactor,
// blockCostPerSf, heightFactor, and engineerAndPermitFee, the numbers
// calc.mjs actually consumes. Those numbers already round-trip as plain
// NUMBER_FIELD_IDS, so the bid itself is fully reconstructed without the
// presets. The three presets are still carried here as ENUM_FIELDS, checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// restored link shows the same selection the sender saw in the dropdown --
// otherwise a wall priced at the poured-concrete factor could restore with
// the "Segmental block (SRW)" option still showing, and the proposal's
// scope line (`suggestScope`, which reads the select, not the factor) would
// hand the customer the wrong wall-type label. The starting-layout preset
// (`wallPreset`) is left out, matching `sump-pump-bid-calculator`'s
// `jobPresets`: it is index-based rather than id-based and only bulk-applies
// the same numeric fields this module already carries individually.
//
// There are no checkbox bid inputs on this venture (the only checkbox is the
// usage opt-out, which is deliberately never shared).
//
// Deposit, hold-price days, and the proposal panel's other prose terms are
// deliberately left out, along with company and customer details: they
// persist per device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a
// customer's name or address has no business riding in a URL two people
// paste into text or email.

import { WALL_TYPE_PRESETS, HEIGHT_PRESETS, ENGINEER_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'lengthFeet', 'exposedHeightFeet', 'embedmentFeet', 'blockCostPerSf', 'capCostPerFoot',
  'stoneCostPerCuYd', 'stoneDepthFeet', 'drainPipeCostPerFoot', 'geogridLayers',
  'geogridDepthFeet', 'geogridCostPerSqYd', 'wallTypeFactor', 'heightFactor',
  'hoursPerFaceSqFt', 'corners', 'hoursPerCorner', 'excavationHours', 'drainHours',
  'hourlyWage', 'burdenRate', 'engineerAndPermitFee', 'travelAndEquipment',
  'overheadRate', 'targetMargin', 'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = [];

// Mirrors the <select id="wallTypePreset">/<select id="heightPreset">/
// <select id="engineerPreset"> options in index.html, sourced from calc.mjs
// so the allowed values cannot drift out of step with the presets the form
// offers.
export const ENUM_FIELDS = {
  wallTypePreset: WALL_TYPE_PRESETS.map((preset) => preset.id),
  heightPreset: HEIGHT_PRESETS.map((preset) => preset.id),
  engineerPreset: ENGINEER_PRESETS.map((preset) => preset.id),
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
