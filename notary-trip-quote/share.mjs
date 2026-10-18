// Shareable trip-quote link. A mobile notary comparing a quote with the
// signing service that offered the job, a spouse who books the calendar, or
// the signer themselves needs the recipient to see the exact same
// appointment -- every mile, every minute, every fee, and the offer under
// test -- not just the headline quote a screenshot would show. Retyping
// nineteen fields is how that comparison never happens, and a silently
// dropped field is how the recipient computes a different quote than the
// sender saw. The transform is pure: no DOM, no storage, no network, and
// everything after the # never reaches a server.
//
// This venture prices one appointment as a fixed field set -- mileage,
// drive/appointment/waiting/print minutes, the rates and fees, and the
// offered fee are each a single number the notary types, not a
// visitor-grown list of rows -- so the plain "one query param per field"
// pattern from `water-softener-bid-calculator` and the other ventures that
// already closed this gap applies directly.
//
// The field list is `Object.keys(defaults)` from calc.mjs itself rather than
// a hand-duplicated list -- the same list `index.html` already uses for
// `readInput`/the saved-draft round trip -- so a field added to `defaults`
// tomorrow rides in the link with no edit here. There are no checkboxes or
// `<select>` presets on this form to carry as booleans or enums; every field
// here is a plain, non-negative number.
//
// Company and client details are deliberately left out: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a signer's
// name or address has no business riding in a URL two people paste into text
// or email.
//
// The proposal panel's five terms are not part of this venture's arithmetic
// and ride beside this payload instead, in `pfterms`, handled by
// `proposal-terms.mjs` (see `platform/proposal/term-ids.test.mjs`) -- the
// water-softener-bid-calculator header explains why: a deposit and validity
// window that silently reopen at this venture's defaults instead of the
// setter's own choice is a different-money bug, not a cosmetic one. Nothing
// below needs to know about the terms.

import { defaults } from './calc.mjs';

export const NUMBER_FIELD_IDS = Object.keys(defaults);

export const BOOLEAN_FIELD_IDS = [];

export const ENUM_FIELDS = {};

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
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
  return inputs;
}
