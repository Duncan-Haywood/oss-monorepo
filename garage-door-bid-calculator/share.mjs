// Shareable bid link. A tech comparing a garage-door ticket with a partner,
// an estimator, or an office manager needs the recipient to see the exact
// same job -- door size, job type, every part cost, labor and travel rate --
// not just the headline price a screenshot would show. Retyping eighteen
// numbers is how that comparison never happens. The transform is pure: no
// DOM, no storage, no network, and everything after the # never reaches a
// server.
//
// `jobType`, `doorSize`, `construction` and `opener` are each checked against
// calc.mjs's own preset ids rather than a hand-duplicated list, so a crafted
// or stale link can only set them to a value the form could have produced --
// the same drift class CLAUDE.md's "RENAME SUSPECTED" note and #2962 both
// describe for a select field left off an allowlist.
//
// The last three used to be omitted, on the reasoning that they are kit
// selectors which only pre-fill other numeric fields (see applySuggestions in
// index.html), so "their effect already rides in those fields". The headline
// price does survive that way, which is why it went unnoticed -- but the
// recipient's form was still wrong in two ways that matter:
//
//   - A sender who picked "Custom size" because they hand-priced the door
//     handed over a bid labelled `double_16x7`. The recipient reads a
//     specific door as having been quoted, and touching any of the three
//     selects fires applySuggestions and overwrites the sender's hand-entered
//     costs with that kit's defaults.
//   - `proposalScope` is generated from the *construction* label, so the
//     customer-facing scope on the recipient's copy named a different door
//     than the sender's proposal did.
//
// Carrying them is safe because index.html runs applySuggestions({force:true})
// *before* restoreShare(), and restoreShare assigns `.value` without
// dispatching a change event -- so restoring a select cannot re-run the
// suggestion pass over the numbers the link just restored. Found by
// platform/pages/roundtrip.mjs.
//
// The deposit, validity window, and the proposal panel's three prose terms
// ride separately via `proposal-terms.mjs` (`withTerms`/`splitTerms`), the
// same mechanism `ev-charger-bid-calculator` and
// `fireplace-insert-bid-calculator` use -- not duplicated here, so all three
// calculators cannot drift on how those five fields are carried. Company and
// customer details are deliberately left out: they persist per-device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { JOB_TYPES, DOOR_SIZE_PRESETS, CONSTRUCTION_PRESETS, OPENER_PRESETS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'widthFt', 'heightFt',
  'doorCost', 'springCost', 'openerCost', 'hardwareCost', 'disposalCost', 'permitCost',
  'laborHours', 'hourlyWage', 'burdenRate', 'roundTripMiles', 'costPerMile', 'averageMph',
  'afterHoursMultiplier', 'overheadRate', 'targetMargin', 'proposedPrice',
];

// Mirrors the <select id="jobType"> options in index.html, sourced from
// calc.mjs so the allowed values cannot drift out of step with the presets
// the form itself offers.
export const JOB_TYPE_VALUES = JOB_TYPES.map((preset) => preset.id);

// The kit selectors, sourced the same way. `custom` is not a preset in
// calc.mjs -- index.html appends it to the doorSize list as the escape hatch
// for a hand-priced door -- so it is added here in the same shape rather than
// silently dropped, which is the case that started this.
export const DOOR_SIZE_VALUES = [...DOOR_SIZE_PRESETS.map((preset) => preset.id), 'custom'];
export const CONSTRUCTION_VALUES = CONSTRUCTION_PRESETS.map((preset) => preset.id);
export const OPENER_VALUES = OPENER_PRESETS.map((preset) => preset.id);

/** Every select the link carries, as id -> the ids that select can hold. */
export const ENUM_FIELDS = Object.freeze({
  jobType: JOB_TYPE_VALUES,
  doorSize: DOOR_SIZE_VALUES,
  construction: CONSTRUCTION_VALUES,
  opener: OPENER_VALUES,
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
