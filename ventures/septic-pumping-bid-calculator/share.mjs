// Shareable bid link. A pumper comparing a takeoff with an office manager,
// a homeowner, or a second truck needs the recipient to see the exact same
// job -- tank gallons, extra tanks, hose footage past the included run,
// access (exposed or buried), risers, baffles, inspection, after-hours
// dispatch, and every wage, dump, and margin figure -- not just the
// headline price a screenshot would show. Retyping thirty fields is how
// that comparison never happens, and a silently dropped field is how the
// recipient computes a different price than the sender saw. The transform
// is pure: no DOM, no storage, no network, and everything after the #
// never reaches a server.
//
// This venture prices one job as a fixed field set -- tank gallons, hose
// feet, extra tanks, and every rate are each a single number, checkbox, or
// select the shop types or picks, not a visitor-grown list of rows like
// `carpet-cleaning-bid-calculator`'s rooms/upholstery -- so the plain "one
// query param per field" pattern from `gutter-install-bid-calculator` and
// the other ventures that already closed this gap applies directly.
//
// Access is checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set it to a
// value the form's own `<select>` could have produced -- the drift class
// CLAUDE.md's "RENAME SUSPECTED" note describes for a select field left off
// an allowlist. Replace baffles, inspection report, and after-hours are
// checkboxes rather than numbers or an enum, so each travels as '1'/'0' the
// same way `gutter-install-bid-calculator`'s tearOff/steepAccess/
// addHiddenHangers do.
//
// Deposit, hold-price days, and the proposal's prose terms are deliberately
// left out, along with company and customer details: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's
// name or address has no business riding in a URL two people paste into
// text or email. The deposit and prose terms still travel -- alongside this
// payload, via `proposal-terms.mjs`'s `withTerms`/`splitTerms`, wired in
// `index.html`.

import { ACCESS_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'tankGallons', 'extraTankGallons', 'extraTankCount', 'hoseFeet', 'riserCount',
  'includedGallons', 'includedHoseFeet',
  'hoursBasePump', 'hoursPerExtra100Gal', 'hoursBuriedLid', 'hoursPerHoseFoot',
  'hoursPerExtraTank', 'hoursBaffles', 'hoursPerRiser', 'hoursInspection',
  'hoursAfterHours', 'siteHours',
  'dumpTripFee', 'disposalPerGallon', 'baffleKitCost', 'riserCostEach',
  'afterHoursFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['replaceBaffles', 'inspectionReport', 'afterHours'];

// Mirrors the <select id="access"> options in index.html, sourced from
// calc.mjs so the allowed values cannot drift out of step with the presets
// the form offers.
export const ENUM_FIELDS = {
  access: ACCESS_PRESETS.map((preset) => preset.id),
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
