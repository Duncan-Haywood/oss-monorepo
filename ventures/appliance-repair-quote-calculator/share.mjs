// Shareable quote link. A technician comparing a repair-vs-replace call with
// a second tech, a service manager who signs off on quotes, or the customer
// themselves needs the recipient to see the exact same numbers -- every
// hour, the labor rate, the parts markup, the callback reserve, and the
// repair-vs-replace comparison inputs -- not just the headline target price
// a screenshot would show. Retyping fifteen fields is how that comparison
// never happens, and a silently dropped field is how the recipient computes
// a different price than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// This venture prices one job as two fixed field sets -- the repair quote
// (diagnostic, repair, and travel hours; labor rate; trip cost; parts cost
// and markup; callback reserve; overhead; target margin) and the
// repair-vs-replace comparison (replacement price, remaining years for each
// path, and what the tech keeps if the customer declines) -- so the plain
// "one query param per field" pattern from `water-softener-bid-calculator`
// and the other ventures that already closed this gap applies directly.
// There is no visitor-grown row list here, so no `rows` kind is needed.
//
// The two field lists are declared once, from the same ids `index.html`
// already uses for `readInput`/`currentReplace`/persisting the draft, rather
// than duplicated -- a field added to either list tomorrow rides in the link
// with no edit here.
//
// Company and customer details are deliberately left out: they persist per
// device via `proposal.mjs`'s `loadCompany`/`saveCompany`, and a customer's
// name or address has no business riding in a URL two people paste into
// text or email.
//
// The proposal panel's five terms are not part of this venture's arithmetic
// and ride beside this payload instead, in `pfterms`, handled by
// `proposal-terms.mjs` (see `platform/proposal/term-ids.test.mjs`) -- a
// deposit and validity window that silently reopen at this venture's
// defaults instead of the setter's own choice is a different-money bug, not
// a cosmetic one. Nothing below needs to know about the terms.

/** The repair-quote fields, in the order `index.html` declares them. */
export const QUOTE_FIELD_IDS = Object.freeze([
  'diagnosticHours', 'repairHours', 'travelHours', 'laborRate', 'tripCost',
  'partsCost', 'partsMarkup', 'callbackReserve', 'overheadRate', 'targetMargin',
]);

/** The repair-vs-replace comparison fields. */
export const REPLACE_FIELD_IDS = Object.freeze([
  'replacementPrice', 'remainingRepairYears', 'remainingReplaceYears',
  'diagnosticCollected', 'yourReplaceProfit',
]);

export const NUMBER_FIELD_IDS = Object.freeze([...QUOTE_FIELD_IDS, ...REPLACE_FIELD_IDS]);

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
