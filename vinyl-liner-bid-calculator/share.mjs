// Shareable bid link. A liner installer comparing a takeoff with an office
// manager, a homeowner, or a second crew lead needs the recipient to see the
// exact same job -- shape, deep-end profile, mil, bead, stairs, pattern,
// access, the spans, every hour, and every material and margin figure -- not
// just the headline price a screenshot would show. Retyping forty-plus
// fields is how that comparison never happens, and a silently dropped field
// is how the recipient computes a different price than the sender saw. The
// transform is pure: no DOM, no storage, no network, and everything after
// the # never reaches a server.
//
// This venture prices one job as a fixed field set -- shape, depth, mil,
// bead, stairs, pattern, access, and every rate are each a single number,
// checkbox, or select the installer types or picks, not a visitor-grown
// list of rows -- so the plain "one query param per field" pattern from
// `water-softener-bid-calculator` and the other ventures that already
// closed this gap applies directly.
//
// Shape, depth, mil, bead, stairs, pattern, and access are each checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set them to a value the form's own
// `<select>` could have produced -- the drift class CLAUDE.md's "RENAME
// SUSPECTED" note describes for a select field left off an allowlist.
// Replace-track, replace-cove, replace-wall-foam, include-cover, include-
// permit, and pump-down are checkboxes rather than numbers or an enum, so
// each travels as '1'/'0' the same way `water-softener-bid-calculator`'s
// haulAway/addElectrical do.
//
// Company and customer details are deliberately left out: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's
// name or address has no business riding in a URL two people paste into
// text or email.
//
// The proposal panel's five terms are not part of this venture's arithmetic
// and ride beside this payload instead, in `pfterms`, handled by
// `proposal-terms.mjs` (see `platform/proposal/term-ids.test.mjs`) -- the
// water-softener-bid-calculator header explains why: a deposit and validity
// window that silently reopen at this venture's defaults instead of the
// setter's own choice is a different-money bug, not a cosmetic one. Nothing
// below needs to know about the terms.

import {
  SHAPE_PRESETS, DEPTH_PRESETS, MIL_PRESETS, BEAD_PRESETS,
  STAIR_PRESETS, PATTERN_PRESETS, ACCESS_PRESETS,
} from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'lengthFeet', 'widthFeet', 'wallHeightFeet',
  'hoursTrip', 'hoursPer100SfLiner', 'hoursStairs', 'hoursBead', 'hoursPerTrackLf',
  'hoursCove', 'hoursFoam', 'hoursAccess', 'hoursPump', 'hoursCover', 'siteHours',
  'waterSurfaceSf', 'perimeterLf', 'wallSf', 'hopperExtraSf', 'stairSf', 'linerSf',
  'wastePercent', 'orderSf',
  'linerPerSf', 'fittingsLump', 'disposalFee', 'trackPerLf', 'coveLump', 'foamPerLf',
  'coverFee', 'mobilizationFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = [
  'replaceTrack', 'replaceCove', 'replaceWallFoam', 'includeCover', 'includePermit', 'pumpDown',
];

// Mirrors the <select id="shape">/<select id="depth">/<select id="mil">/
// <select id="bead">/<select id="stairs">/<select id="pattern">/
// <select id="access"> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const ENUM_FIELDS = {
  shape: SHAPE_PRESETS.map((preset) => preset.id),
  depth: DEPTH_PRESETS.map((preset) => preset.id),
  mil: MIL_PRESETS.map((preset) => preset.id),
  bead: BEAD_PRESETS.map((preset) => preset.id),
  stairs: STAIR_PRESETS.map((preset) => preset.id),
  pattern: PATTERN_PRESETS.map((preset) => preset.id),
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
