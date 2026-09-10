// Send a recipe's economics to the person who decides the menu price.
//
// A pour cost is worked out by whoever is standing behind the bar and acted
// on by whoever signs off the menu — a manager, an owner, a consultant on a
// different device. Today the only way to move a recipe between those two
// people is to read out twelve figures over the phone: three fields for each
// of up to three ingredient slots, plus menu price, target, volume and
// over-pour. Most of the time nobody does, and the drink gets repriced from
// the pour cost someone half-remembers.
//
// So the whole recipe travels in a link, and the link is built and copied in
// the reader's own browser. The figures ride in the URL *fragment* (`#...`),
// never the query string: a fragment is not sent in the request line a server
// logs, nor in the `Referer` header a later click carries.
//
// Unlike a shop's payroll — which `shop-rate-calculator` deliberately refuses
// to put in a URL, and should keep refusing — a recipe is bottle costs and a
// menu price. Those are the numbers a bar hands to a rep, a consultant, or a
// landlord's accountant in the ordinary course of business, and the drink's
// menu price is already printed on the menu.
//
// ## Absent is not the same as zero, and not the same as unchanged
//
// This is the trap specific to this page. Modifier and mixer are *optional
// slots*: blank across all three of a slot's fields means "this recipe does
// not use it". A shared spirit-only pour therefore encodes with those six
// fields simply missing — and if the page then left the recipient's own form
// defaults sitting in them, the recipient would price a three-ingredient
// cocktail while believing they were looking at the sender's highball. That
// is the exact silent-divergence defect `share.mjs` shipped once already
// elsewhere in this portfolio (a link that dropped `quantity` and
// `targetMargin`, so the recipient computed a different profit than the
// sender saw).
//
// `applyToForm` below is therefore the supported way to open a link: it
// writes *every* field the form owns, clearing the ones the link did not
// carry, so what the recipient sees is the sender's recipe and nothing of
// their own. A required field missing from a link leaves a blank box and
// `calc.mjs` reports it — visibly wrong on a form they are looking at, rather
// than quietly wrong in a number they are not.
//
// The field list is imported from `calc.mjs` rather than restated here, so a
// field added to the arithmetic is shareable the moment it exists. This
// repository has twice paid for a copied rule going stale instead of being
// imported — see CLAUDE.md, "168 became 169".

import { ALL_INPUT_IDS, OPTIONAL_INGREDIENT_IDS, REQUIRED_INGREDIENT_IDS } from './calc.mjs';

export const FIELD_IDS = ALL_INPUT_IDS;

/** Re-exported so callers and tests never restate calc.mjs's own definition. */
export const OPTIONAL_FIELD_IDS = OPTIONAL_INGREDIENT_IDS;
export const REQUIRED_FIELD_IDS = REQUIRED_INGREDIENT_IDS;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
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
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

/** Whether a link carried anything at all. The page uses this to decide
 * whether to open on the shared recipe or on its own worked example. */
export function hasSharedInputs(decoded) {
  return Object.keys(decoded || {}).length > 0;
}

/**
 * Every field the form owns, as the string a form control holds — the shared
 * value where the link had one, and `''` where it did not.
 *
 * Returning the cleared fields explicitly, rather than leaving the caller to
 * remember to blank them, is the whole point: see the note above. A caller
 * that iterates this result sets the form to exactly the sender's recipe.
 */
export function formValues(decoded) {
  return Object.fromEntries(
    FIELD_IDS.map((id) => [id, id in (decoded || {}) ? String(decoded[id]) : '']),
  );
}
