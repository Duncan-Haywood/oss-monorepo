import { DEFAULTS } from './calc.mjs';

/**
 * Every field a link carries.
 *
 * Derived from `DEFAULTS` rather than typed out again. The one field the
 * calculator reads that is not a default is `proposedPrice` — it is optional by
 * design (blank means "no price on the table yet"), so it has no default to be
 * derived from, and it is appended explicitly.
 *
 * Restating the list here instead of importing it is the mistake CLAUDE.md
 * records twice: `share.mjs` carrying its own allowlist is how a shared link
 * silently drops a field the sender typed, and the recipient then computes a
 * different price from the same link with nothing on screen saying so.
 */
export const SHARE_FIELDS = Object.freeze([...Object.keys(DEFAULTS), 'proposedPrice']);

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of SHARE_FIELDS) {
    // A blank is a real state on this form and is not the same as an absent
    // key: `proposedPrice` blank means "no price on the table", and a blank
    // cost field is an error the recipient should see rather than have
    // silently replaced by the page's shipped example.
    if (input?.[field] === '') {
      params.set(field, '');
      continue;
    }
    const value = Number(input?.[field]);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of SHARE_FIELDS) {
    if (!params.has(field)) continue;
    if (params.get(field) === '') {
      result[field] = '';
      continue;
    }
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  return result;
}

/**
 * The supported way to apply a decoded link: every field the form owns is
 * written, so a field the sender left blank is cleared rather than left showing
 * whatever was already in the box. See
 * `platform/ci/check_shared_link_clears.py` for the defect this shape exists to
 * prevent.
 */
export function formValues(decoded) {
  return Object.fromEntries(
    SHARE_FIELDS.map(field => [field, decoded?.[field] !== undefined ? String(decoded[field]) : '']),
  );
}
