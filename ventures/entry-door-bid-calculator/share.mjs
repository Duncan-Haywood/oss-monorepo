// Shareable bid link. A door-and-carpentry shop comparing a takeoff with a
// homeowner, property manager, or GC needs the recipient to see the exact
// same job -- configuration, material, hang style, access, rot footage, every
// extra (out-of-square, transom, brickmold, storm door, smart lock, paint,
// tear-out), and every hour and rate -- not just the headline price a
// screenshot would show. Retyping thirty-plus fields is how that comparison
// never happens, and a silently dropped field is how the recipient computes a
// different price than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// The configuration, material, hang-style, and story fields are each checked
// against calc.mjs's own preset ids rather than a hand-duplicated list, so a
// crafted or stale link can only set them to a value the form could have
// produced -- the drift class CLAUDE.md's "RENAME SUSPECTED" note describes
// for a select field left off an allowlist. Out-of-square, transom,
// brickmold, storm door, smart lock, paint, and tear-out are checkboxes
// rather than numbers or an enum, so they travel as '1'/'0' the same way
// `electrical-panel-upgrade-bid-calculator`'s replace-meter-socket, new
// grounding, and temporary power checkboxes do.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `countertop-bid-calculator` and
// `electrical-panel-upgrade-bid-calculator` use -- not duplicated here, so the
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { CONFIG_PRESETS, MATERIAL_PRESETS, HANG_PRESETS, STORY_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'rotFeet',
  'hoursTrip', 'hoursHang', 'hoursHangPremium', 'hangHourFactor', 'hoursStory',
  'hoursOutOfSquare', 'hoursPerRotFoot', 'hoursTransom', 'hoursBrickmold',
  'hoursStormDoor', 'hoursSmartLock', 'hoursPaint', 'hoursTearOut', 'siteHours',
  'unitCost', 'unitCostMultiplier', 'unitCostFactor', 'transomCost', 'brickmoldCost',
  'stormDoorCost', 'lockCost', 'paintMaterial', 'rotPerFoot', 'dumpFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = [
  'outOfSquare', 'addTransom', 'addBrickmold', 'addStormDoor', 'addSmartLock', 'addPaint', 'tearOut',
];

// Mirrors the <select id="config">, <select id="material">,
// <select id="hangStyle">, and <select id="stories"> options in index.html,
// sourced from calc.mjs so the allowed values cannot drift out of step with
// the presets the form offers.
export const ENUM_FIELDS = {
  config: CONFIG_PRESETS.map((preset) => preset.id),
  material: MATERIAL_PRESETS.map((preset) => preset.id),
  hangStyle: HANG_PRESETS.map((preset) => preset.id),
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
