// Shareable bid link. A drain shop comparing a takeoff with an office
// manager, a homeowner, or a second tech needs the recipient to see the
// exact same job -- work type, access method, line type, footage past the
// included run, hose run, roots, grease, a second line, and every wage,
// cost, and margin figure -- not just the headline price a screenshot would
// show. Retyping thirty fields is how that comparison never happens, and a
// silently dropped field is how the recipient computes a different price
// than the sender saw. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// This venture prices one job as a fixed field set -- work, access, line,
// and every rate are each a single number, checkbox, or select the shop
// types or picks, not a visitor-grown list of rows -- so the plain "one
// query param per field" pattern from `gutter-install-bid-calculator` and
// the other ventures that already closed this gap applies directly.
//
// Work, access, and line are each checked against calc.mjs's own preset ids
// rather than a hand-duplicated list, so a crafted or stale link can only
// set them to a value the form's own `<select>` could have produced -- the
// drift class CLAUDE.md's "RENAME SUSPECTED" note describes for a select
// field left off an allowlist. Roots, grease, and a second line are
// checkboxes rather than numbers or an enum, so each travels as '1'/'0'.
//
// Company and customer details are deliberately left out: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's
// name or address has no business riding in a URL two people paste into
// text or email.
//
// The proposal panel's five terms are NOT in that category. A shop that
// prices a job at a 50% deposit held for 15 days and copies the link must
// not have the recipient's page reopen it at this venture's 30%/30-day
// defaults beneath a headline price that matches to the cent -- two people
// reading one price and different money on acceptance, with nothing on
// either page saying so. The terms ride beside this payload in `pfterms`,
// handled by `proposal-terms.mjs` (see `platform/proposal/term-ids.test.mjs`),
// so nothing below needs to know about them.

import { WORK_PRESETS, ACCESS_PRESETS, LINE_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'lineFeet', 'includedFootage', 'hoseRunFeet', 'includedHoseFeet',
  'hoursTrip', 'hoursCameraBase', 'hoursCableBase', 'hoursJetBase', 'hoursPerExtraFoot',
  'hoursToiletPull', 'hoursNewCleanout', 'hoursRoofVent', 'hoursRootCut', 'hoursGreasePass',
  'hoursSecondLine', 'hoursPerExtraHoseFoot', 'siteHours',
  'cameraWear', 'cableWear', 'jetWear', 'waxRing', 'cleanoutFitting', 'rootCutterRental', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['hasRoots', 'hasGrease', 'extraLine'];

// Mirrors the <select id="work">/<select id="access">/<select id="line">
// options in index.html, sourced from calc.mjs so the allowed values cannot
// drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  work: WORK_PRESETS.map((preset) => preset.id),
  access: ACCESS_PRESETS.map((preset) => preset.id),
  line: LINE_PRESETS.map((preset) => preset.id),
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
