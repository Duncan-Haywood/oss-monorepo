// Shareable bid link. A gutter shop comparing a takeoff with a homeowner,
// spouse, or GC needs the recipient to see the exact same job -- profile,
// stories, gutter footage, inside and outside miters, downspouts and
// downspout footage past the included allowance, fascia repair, tear-off,
// steep access, hidden hangers, and every hour and dollar figure -- not just
// the headline price a screenshot would show. Retyping thirty-plus fields is
// how that comparison never happens, and a silently dropped field is how the
// recipient computes a different price than the sender saw. The transform is
// pure: no DOM, no storage, no network, and everything after the # never
// reaches a server.
//
// This venture prices one job as a fixed field set -- gutter footage, miters,
// downspouts, fascia, and every rate are each a single number or select the
// shop types or picks, not a visitor-grown list of rows like
// `carpet-cleaning-bid-calculator`'s rooms/upholstery -- so the plain "one
// query param per field" pattern from `exterior-painting-bid-calculator` and
// the other thirteen ventures that already closed this gap applies directly.
//
// Profile and stories are each checked against calc.mjs's own preset ids
// rather than a hand-duplicated list, so a crafted or stale link can only set
// them to a value the form's own `<select>` could have produced -- the drift
// class CLAUDE.md's "RENAME SUSPECTED" note describes for a select field left
// off an allowlist. Tear-off, steep access, and hidden hangers are checkboxes
// rather than numbers or an enum, so each travels as '1'/'0' the same way
// `electrical-panel-upgrade-bid-calculator`'s replace-meter-socket, new
// grounding, and temporary power checkboxes do.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `foundation-repair-bid-calculator` and
// `furnace-bid-calculator` use -- not duplicated here, so the calculators
// cannot drift on how those five fields are carried. Company and customer
// details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { PROFILE_PRESETS, STORY_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'gutterFeet', 'insideMiters', 'outsideMiters', 'downspouts', 'downspoutFeet',
  'includedDownspouts', 'includedDownspoutFeetPerDrop', 'fasciaFeet',
  'hoursTrip', 'hoursPerGutterFoot', 'hoursPerStoryFoot', 'hoursInsideMiter',
  'hoursOutsideMiter', 'hoursPerExtraDownspout', 'hoursPerExtraDownspoutFoot',
  'hoursPerFasciaFoot', 'hoursPerTearOffFoot', 'hoursPerSteepFoot', 'siteHours',
  'gutterPerFoot', 'profilePremiumPerFoot', 'downspoutOutletCost', 'downspoutPerFoot',
  'insideMiterCost', 'outsideMiterCost', 'fasciaPerFoot', 'tearOffDumpPerFoot',
  'hangerPerFoot', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['tearOff', 'steepAccess', 'addHiddenHangers'];

// Mirrors the <select id="profile">/<select id="stories"> options in
// index.html, sourced from calc.mjs so the allowed values cannot drift out of
// step with the presets the form offers.
export const ENUM_FIELDS = {
  profile: PROFILE_PRESETS.map((preset) => preset.id),
  stories: STORY_PRESETS.map((preset) => preset.id),
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
