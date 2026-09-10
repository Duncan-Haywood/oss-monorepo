import { INPUT_FIELDS as FIELDS } from './calc.mjs';

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    // Blank inputs use the calculator's fallback; an explicit zero does not.
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
  for (const field of FIELDS) {
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

// The supported way to apply a decoded link: every field the form owns gets
// written, so a field the sender left blank is cleared rather than left
// showing whatever the *recipient's own saved draft* put there. Applying a
// decoded link with a plain object spread (`{ ...defaults, ...saved,
// ...fromLink }`) looks like the link wins and is not -- a key fromLink
// omits still falls through to saved's value for that key, ahead of the
// defaults. See platform/ci/check_shared_link_clears.py.
export function formValues(decoded) {
  return Object.fromEntries(FIELDS.map(field => [field, decoded?.[field] !== undefined ? String(decoded[field]) : '']));
}
