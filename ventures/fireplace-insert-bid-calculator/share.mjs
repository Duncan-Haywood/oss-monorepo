// Shareable bid link. A shop comparing a fireplace-insert takeoff with a
// partner, an estimator, or an office manager needs the recipient to see the
// exact same job -- fuel, size, chimney scope, liner footage, every hour and
// rate -- not just the headline price a screenshot would show. Retyping
// thirty-plus numbers is how that comparison never happens. The transform is
// pure: no DOM, no storage, no network, and everything after the # never
// reaches a server.
//
// Enum fields are checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set them to
// values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left off
// an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `ev-charger-bid-calculator` uses -- not duplicated here, so
// the two calculators cannot drift on how those five fields are carried.
// Company and customer details are deliberately left out: they persist
// per-device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a
// customer's name or address has no business riding in a URL two people
// paste into text or email.

import { FUEL_PRESETS, SIZE_PRESETS, CHIMNEY_PRESETS, ACCESS_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'linerFeet',
  'hoursTrip', 'hoursSet', 'hoursSetPremium', 'hoursAccess', 'hoursChimney',
  'hoursPerLinerFoot', 'hoursHearth', 'hoursGasLine', 'hoursCircuit',
  'hoursSurround', 'hoursDamper', 'hoursTearOut', 'siteHours',
  'unitCost', 'unitCostMultiplier', 'linerKit', 'linerPerFoot', 'rebuildMaterial',
  'hearthCost', 'gasLineCost', 'circuitCost', 'surroundCost', 'damperCost',
  'dumpFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['addHearth', 'addGasLine', 'addCircuit', 'addSurround', 'addDamper', 'tearOut'];

// Mirrors the <select id="fuel"> / <select id="size"> / <select id="chimney">
// / <select id="access"> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const FUEL_VALUES = FUEL_PRESETS.map((preset) => preset.id);
export const SIZE_VALUES = SIZE_PRESETS.map((preset) => preset.id);
export const CHIMNEY_VALUES = CHIMNEY_PRESETS.map((preset) => preset.id);
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
  const fuel = usableEnum(inputs?.fuel, FUEL_VALUES);
  if (fuel !== null) params.set('fuel', fuel);
  const size = usableEnum(inputs?.size, SIZE_VALUES);
  if (size !== null) params.set('size', size);
  const chimney = usableEnum(inputs?.chimney, CHIMNEY_VALUES);
  if (chimney !== null) params.set('chimney', chimney);
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
  if (params.has('fuel')) {
    const fuel = usableEnum(params.get('fuel'), FUEL_VALUES);
    if (fuel !== null) inputs.fuel = fuel;
  }
  if (params.has('size')) {
    const size = usableEnum(params.get('size'), SIZE_VALUES);
    if (size !== null) inputs.size = size;
  }
  if (params.has('chimney')) {
    const chimney = usableEnum(params.get('chimney'), CHIMNEY_VALUES);
    if (chimney !== null) inputs.chimney = chimney;
  }
  if (params.has('access')) {
    const access = usableEnum(params.get('access'), ACCESS_VALUES);
    if (access !== null) inputs.access = access;
  }
  return inputs;
}
