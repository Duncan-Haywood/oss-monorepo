// Send a whole exclusive-versus-wide comparison to the other person on the book.
//
// This page decides one thing — whether KDP Select is ahead of going wide for
// *this* title — and it takes seventeen inputs to decide it: two list prices,
// a page count, a royalty plan, a KENP rate, and unit economics for four
// separate sales channels. That decision is almost never made alone. A
// co-author, an editor, a small press, or the author's own other device all
// need to see the same seventeen numbers to disagree usefully about them, and
// today the only way to move them is to read them out.
//
// So the comparison travels in a link, built and copied in the reader's own
// browser. The figures ride in the URL *fragment* (`#...`), never the query
// string: a fragment is not sent in the request line a server logs, nor in
// the `Referer` header a later click carries.
//
// (Unlike `shop-rate-calculator`, which deliberately refuses to put a shop's
// payroll in a URL and should keep refusing, everything here is a list price,
// a page count, or a royalty rate off a public schedule. The list prices are
// already printed on the book's own store page.)
//
// ## Two selects, and why they are not just strings
//
// `ebookPlan` and `paperbackColor` are choices, not numbers. Assigning an
// unrecognised value to a `<select>` does not throw and does not clear it —
// it leaves the previous selection standing. So a link carrying
// `ebookPlan=50` would silently compute a 70%-plan royalty while the sender
// believed they had sent a different plan, which is the same
// silent-divergence defect this portfolio's `share.mjs` shipped once already
// (a link that dropped `quantity` and `targetMargin`, so the recipient
// computed a different profit than the sender saw). `decodeInputs` therefore
// validates both against the option lists `calc.mjs` publishes, and drops
// anything else.
//
// The field list, the option lists, and which field may be blank are all
// imported from `calc.mjs` rather than restated here — see the note on
// `FORM_FIELD_IDS` there.

import {
  FORM_FIELD_IDS,
  NUMERIC_FIELD_IDS,
  OPTIONAL_FIELD_IDS,
  SELECT_OPTIONS,
} from './calc.mjs';

export const FIELD_IDS = FORM_FIELD_IDS;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

/** The value to put in a link for one field, or `null` to leave it out. */
function encodeField(id, value) {
  if (id in SELECT_OPTIONS) {
    const text = String(value ?? '');
    return SELECT_OPTIONS[id].includes(text) ? text : null;
  }
  const number = usableNumber(value);
  return number === null ? null : String(number);
}

/** The value to accept from a link for one field, or `null` to ignore it. */
function decodeField(id, value) {
  return encodeField(id, value);
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const encoded = encodeField(id, input?.[id]);
    if (encoded !== null) params.set(id, encoded);
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = decodeField(id, params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

/** Whether a link carried anything at all. */
export function hasSharedInputs(decoded) {
  return Object.keys(decoded || {}).length > 0;
}

/**
 * Every field the form owns, as the string a control holds — the shared value
 * where the link had one, and `''` where it did not.
 *
 * The clearing is the part that matters, and it is why callers should use
 * this rather than writing the decoded object onto the form directly.
 * `paperbackPrintOverride` may legitimately be blank, meaning "derive the
 * print cost from the page count"; a sender who left it blank and a
 * recipient whose form still held their own override would be comparing two
 * different books. Selects are the exception — a `<select>` cannot hold `''`
 * when that is not one of its options, so an absent choice falls back to the
 * option the form ships selected rather than to an empty string.
 */
export function formValues(decoded) {
  const source = decoded || {};
  return Object.fromEntries(
    FIELD_IDS.map((id) => {
      if (id in source) return [id, String(source[id])];
      if (id in SELECT_OPTIONS) return [id, SELECT_OPTIONS[id][0]];
      return [id, ''];
    }),
  );
}

export { NUMERIC_FIELD_IDS, OPTIONAL_FIELD_IDS, SELECT_OPTIONS };
