// Shareable bid link. A well-service or plumbing shop comparing a takeoff
// with a partner, a supply-house counter rep, or an office manager needs the
// recipient to see the exact same job -- depth, horsepower, pitless
// condition, cable, tank, every hour and rate -- not just the headline price
// a screenshot would show. Retyping thirty-plus numbers is how that
// comparison never happens. The transform is pure: no DOM, no storage, no
// network, and everything after the # never reaches a server.
//
// Enum fields are checked against calc.mjs's own preset ids rather than a
// hand-duplicated list, so a crafted or stale link can only set them to
// values the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left off
// an allowlist.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `fireplace-insert-bid-calculator` and `ev-charger-bid-
// calculator` use -- not duplicated here, so the calculators cannot drift on
// how those five fields are carried. Company and customer details are
// deliberately left out: they persist per-device via `proposal.mjs`'s
// `loadCompany`/`saveCompany`, and a customer's name or address has no
// business riding in a URL two people paste into text or email.

import { TYPE_PRESETS, WORK_PRESETS, HP_PRESETS, PITLESS_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'wellDepthFeet', 'includedFootage', 'cableFeet', 'includedCableFeet',
  'hoursTrip', 'hoursPumpBase', 'hoursPerExtraFoot', 'hoursTank', 'hoursPitless',
  'hoursStuckPull', 'hoursSwitch', 'hoursPerExtraCableFoot', 'hoursVfd', 'siteHours',
  'pumpCost', 'tankCost', 'pitlessCost', 'cablePerFoot', 'switchCost', 'vfdCost', 'hoistFee', 'permitFee',
  'hourlyWage', 'burdenRate', 'travelAndEquipment', 'overheadRate', 'targetMargin',
  'proposedPrice',
];

export const BOOLEAN_FIELD_IDS = ['stuckPump', 'addVfd'];

// Mirrors the <select id="type"> / <select id="work"> / <select id="hp"> /
// <select id="pitless"> options in index.html, sourced from calc.mjs so the
// allowed values cannot drift out of step with the presets the form offers.
export const TYPE_VALUES = TYPE_PRESETS.map((preset) => preset.id);
export const WORK_VALUES = WORK_PRESETS.map((preset) => preset.id);
export const HP_VALUES = HP_PRESETS.map((preset) => preset.id);
export const PITLESS_VALUES = PITLESS_PRESETS.map((preset) => preset.id);

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
  const type = usableEnum(inputs?.type, TYPE_VALUES);
  if (type !== null) params.set('type', type);
  const work = usableEnum(inputs?.work, WORK_VALUES);
  if (work !== null) params.set('work', work);
  const hp = usableEnum(inputs?.hp, HP_VALUES);
  if (hp !== null) params.set('hp', hp);
  const pitless = usableEnum(inputs?.pitless, PITLESS_VALUES);
  if (pitless !== null) params.set('pitless', pitless);
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
  if (params.has('type')) {
    const type = usableEnum(params.get('type'), TYPE_VALUES);
    if (type !== null) inputs.type = type;
  }
  if (params.has('work')) {
    const work = usableEnum(params.get('work'), WORK_VALUES);
    if (work !== null) inputs.work = work;
  }
  if (params.has('hp')) {
    const hp = usableEnum(params.get('hp'), HP_VALUES);
    if (hp !== null) inputs.hp = hp;
  }
  if (params.has('pitless')) {
    const pitless = usableEnum(params.get('pitless'), PITLESS_VALUES);
    if (pitless !== null) inputs.pitless = pitless;
  }
  return inputs;
}
