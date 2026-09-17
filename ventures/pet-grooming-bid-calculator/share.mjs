// Shareable bid link. A groomer comparing a quote with a second groomer, the
// shop owner, or the pet owner themselves needs the recipient to see the
// exact same job -- size, coat, matting, every add-on, mobile travel, wage,
// burden, fee, and target margin -- not just the headline contribution
// figure a screenshot would show. Retyping this many fields is how that
// comparison never happens, and a silently dropped field is how the
// recipient computes a different price than the sender saw. The transform is
// pure: no DOM, no storage, no network, and everything after the # never
// reaches a server.
//
// Size, coat, and matting are enums checked against calc.mjs's own tables
// rather than a hand-duplicated list, so a crafted or stale link can only set
// them to a value the form could have produced -- the drift class CLAUDE.md's
// "RENAME SUSPECTED" note describes for a select field left off an allowlist.
// The severe-matting acknowledgment and every add-on travel as booleans, the
// same pattern `duct-cleaning-bid-calculator`'s crawl/occupied/coil/sanitizer
// checkboxes use.
//
// The proposal panel's five terms are not part of this venture's arithmetic
// and ride beside this payload instead, in `pfterms`, handled by
// `proposal-terms.mjs` -- see `platform/proposal/term-ids.test.mjs`. Company
// and customer details are deliberately left out: they persist per device via
// `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's name or
// address has no business riding in a URL two people paste into text or
// email.

import { ADD_ON_IDS, COAT_TYPES, MATTING_LEVELS, SIZE_TIERS } from './calc.mjs';

export const NUMBER_FIELD_IDS = [
  'targetPrice', 'travelMiles', 'vehicleRate', 'travelSetupMinutes',
  'wage', 'burdenPercent', 'supplies', 'overhead', 'paymentRate', 'targetMargin',
];

export const BOOLEAN_FIELD_IDS = ['severeMattingAck', 'mobile', ...ADD_ON_IDS];

export const ENUM_FIELDS = {
  size: Object.keys(SIZE_TIERS),
  coat: Object.keys(COAT_TYPES),
  matting: Object.keys(MATTING_LEVELS),
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
