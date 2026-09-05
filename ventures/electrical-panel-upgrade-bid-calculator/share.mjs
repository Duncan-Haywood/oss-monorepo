// Shareable bid link. An electrician comparing a takeoff with a homeowner,
// property manager, or GC needs the recipient to see the exact same job --
// existing and new amps, service path, panel style, panel location, feeder
// feet, circuit count, AFCI/GFCI count, meter socket / grounding / temporary
// power, and every hour and rate -- not just the headline price a screenshot
// would show. Retyping thirty-plus fields is how that comparison never
// happens, and a silently dropped field is how the recipient computes a
// different price than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// The service path, panel style, and panel location fields are each checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set them to a value the form could have
// produced -- the drift class CLAUDE.md's "RENAME SUSPECTED" note describes
// for a select field left off an allowlist. Replace-meter-socket, new
// grounding, and temporary power are checkboxes rather than numbers or an
// enum, so they travel as '1'/'0' the same way
// `basement-waterproofing-bid-calculator`'s new-pit, freeze-discharge, and
// dehumidifier checkboxes do.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `countertop-bid-calculator` and
// `basement-waterproofing-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { SERVICE_PRESETS, PANEL_STYLE_PRESETS, LOCATION_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'existingAmps', 'newAmps', 'feederFeet', 'circuitCount', 'afciCount',
  'hoursPanelSwap', 'hoursServiceChange', 'hoursUnderground', 'hoursFinishedAccess',
  'hoursPerFeederFoot', 'hoursPerCircuit', 'hoursPerAfci', 'hoursMeterSocket',
  'hoursGrounding', 'hoursTemporaryPower', 'hoursUtilityCoordination', 'siteHours',
  'panelCost', 'breakerCostEach', 'afciCostEach', 'seCablePerFoot', 'mastKitCost',
  'meterSocketCost', 'groundRodKit', 'tempPowerCost', 'permitFee', 'utilityFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['replaceMeterSocket', 'newGrounding', 'temporaryPower'];

// Mirrors the <select id="service">, <select id="panelStyle">, and
// <select id="location"> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  service: SERVICE_PRESETS.map((preset) => preset.id),
  panelStyle: PANEL_STYLE_PRESETS.map((preset) => preset.id),
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
