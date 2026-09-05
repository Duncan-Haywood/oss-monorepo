// Shareable bid link. A tech comparing a garage-door ticket with a partner,
// an estimator, or an office manager needs the recipient to see the exact
// same job -- door size, job type, every part cost, labor and travel rate --
// not just the headline price a screenshot would show. Retyping eighteen
// numbers is how that comparison never happens. The transform is pure: no
// DOM, no storage, no network, and everything after the # never reaches a
// server.
//
// `jobType` is checked against calc.mjs's own JOB_TYPES ids rather than a
// hand-duplicated list, so a crafted or stale link can only set it to a
// value the form could have produced -- the same drift class CLAUDE.md's
// "RENAME SUSPECTED" note and #2962 both describe for a select field left
// off an allowlist. `doorSize`, `construction`, and `opener` are kit
// selectors that only pre-fill other numeric fields (see applySuggestions
// in index.html); their effect already rides in those fields, so they are
// not carried separately here.
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

import { JOB_TYPES } from './calc.mjs';

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
  const jobType = usableEnum(inputs?.jobType, JOB_TYPE_VALUES);
  if (jobType !== null) params.set('jobType', jobType);
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
  if (params.has('jobType')) {
    const jobType = usableEnum(params.get('jobType'), JOB_TYPE_VALUES);
    if (jobType !== null) inputs.jobType = jobType;
  }
  return inputs;
}
