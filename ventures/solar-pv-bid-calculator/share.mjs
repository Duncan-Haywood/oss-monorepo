// Shareable bid link for the solar PV install calculator.
//
// A solar contractor sizing a job needs the person on the other end -- a
// homeowner deciding, an office manager building the contract, a second
// estimator checking the array -- to open the *same* bid: module count and
// wattage, roof and mount factor, the electrical adder, battery hours and
// material, every wage, burden, overhead and margin figure. A screenshot
// shows the headline number and none of the inputs behind it, and retyping
// twenty fields is how the second opinion never happens.
//
// The transform is pure: no DOM, no storage, no network. Everything after
// the `#` stays in the browser and never reaches a server.
//
// This venture prices one system as a fixed field set -- every input is a
// single number or a select the installer picks, not a visitor-grown list
// of rows -- so the "one query param per field" pattern that
// `sump-pump-bid-calculator` and `water-softener-bid-calculator` use
// applies directly.
//
// The three selects are validated against `calc.mjs`'s own presets rather
// than a hand-copied list, so a crafted or stale link can only set values
// the form's own `<option>`s could have produced. `systemPreset` is an
// index into `SYSTEM_PRESETS` rather than an id -- that is how index.html
// fills it -- so its allowed values are derived from the preset array's
// length and cannot drift as presets are added.
//
// Two deliberate exclusions, for different reasons:
//
//   - Company and customer details (`companyName`, `clientAddress`, and the
//     rest) stay out. They persist per device via `proposal.mjs`'s
//     `loadCompany`/`saveCompany`, and a customer's name or address has no
//     business riding in a URL two people paste into text or email.
//
//   - `usageOptOut` stays out because it is the *recipient's* privacy
//     choice, not part of the bid. A link that carried it would let a
//     sender silently re-enable counting on someone else's browser.
//
// The proposal panel's five terms -- deposit, hold-price days, and the
// three prose blocks -- are NOT in either category and do ride along, in
// `pfterms`, handled by `proposal-terms.mjs`. Omitting them is the bug
// `platform/proposal/term-ids.test.mjs` exists to catch: they persist per
// device too, and per-device persistence is exactly what the recipient
// does not have, so a link without them reopens a $30,000 bid under the
// recipient's own default deposit percentage.

import { ROOF_PRESETS, ELECTRICAL_PRESETS, SYSTEM_PRESETS } from './calc.mjs';

// Mirrors `FIELD_IDS` in index.html: every number the form collects.
export const NUMBER_FIELD_IDS = Object.freeze([
  'moduleCount', 'wattsPerModule', 'moduleCostEach', 'inverterCost', 'rackingPerModule', 'bosPerWatt',
  'roofFactor', 'laborHoursPerKw', 'electricalHours', 'electricalMaterial', 'batteryHours', 'batteryMaterial',
  'hourlyWage', 'burdenRate', 'permitAndInterconnection', 'designEngineering', 'travelDumpsterLift',
  'overheadRate', 'targetMargin', 'proposedPrice',
]);

// Sourced from calc.mjs so the allowed values cannot drift out of step with
// the options index.html actually renders. `systemPreset` is keyed by array
// index because `fillSelect` gives it `String(index)` for a value.
export const ENUM_FIELDS = Object.freeze({
  roofPreset: ROOF_PRESETS.map((preset) => preset.id),
  electricalPreset: ELECTRICAL_PRESETS.map((preset) => preset.id),
  systemPreset: SYSTEM_PRESETS.map((_, index) => String(index)),
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
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
