// A creator re-types the same plan tier, patron counts, and pledge amounts
// every time they check this month's numbers. This module keeps that whole
// month — plan, three pledge tiers, billing frequency, posts published,
// other income, and the target payout — restored in the visitor's own
// browser between visits, and carried into a link they can send themselves
// or a co-creator.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The visit
// travels in the URL *fragment* (`#...`), never the query string, for the
// same reason `twitch-payout-calculator/share.mjs` gives: a fragment is not
// sent in the request line a server logs, nor in a `Referer` header a later
// click would carry.
//
// The field list is imported from `calc.mjs`'s `DEFAULTS` rather than
// restated here, so a field added to the arithmetic is shareable and
// restorable the moment it exists. `planTier` and `billingFrequency` are
// presets rather than free numbers, so they are checked against the
// calculator's own preset ids instead of being coerced as numbers — a
// crafted link cannot inject a plan or billing shape the calculator has no
// rates for.

import { DEFAULTS, PLAN_PRESETS, BILLING_PRESETS } from './calc.mjs';

export const FIELD_IDS = Object.keys(DEFAULTS);

const CHOICE_OPTIONS = {
  planTier: PLAN_PRESETS.map((p) => p.id),
  billingFrequency: BILLING_PRESETS.map((b) => b.id),
};

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const options = CHOICE_OPTIONS[id];
    if (options) {
      const value = input?.[id];
      if (typeof value === 'string' && options.includes(value)) params.set(id, value);
      continue;
    }
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const options = CHOICE_OPTIONS[id];
    if (options) {
      const value = params.get(id);
      if (options.includes(value)) result[id] = value;
      continue;
    }
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

// The supported way to apply a decoded link: every field the form owns gets
// written, so a field the sender left blank is cleared rather than left
// showing whatever the recipient's own saved draft put there. See
// `platform/ci/check_shared_link_clears.py` and
// `twitch-payout-calculator/share.mjs`'s note on the same rule.
export function formValues(decoded) {
  return Object.fromEntries(FIELD_IDS.map((id) => [id, decoded?.[id] !== undefined ? String(decoded[id]) : '']));
}
