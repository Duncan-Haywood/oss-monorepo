import { INPUT_FIELDS as FIELDS, ENTRY_TYPES } from './calc.mjs';

const STRING_FIELDS = new Set(['entryType']);
const BOOLEAN_FIELDS = new Set(['oceanFreight']);

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const raw = input?.[field];
    if (BOOLEAN_FIELDS.has(field)) {
      if (raw !== undefined && raw !== '') params.set(field, raw === true || raw === '1' || raw === 'true' ? '1' : '0');
      continue;
    }
    if (STRING_FIELDS.has(field)) {
      if (field === 'entryType' && ENTRY_TYPES.includes(raw)) params.set(field, raw);
      continue;
    }
    // Blank inputs use the calculator's fallback; an explicit zero does not.
    if (raw === '') {
      params.set(field, '');
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of FIELDS) {
    if (!params.has(field)) continue;
    const raw = params.get(field);
    if (BOOLEAN_FIELDS.has(field)) {
      result[field] = raw === '1';
      continue;
    }
    if (STRING_FIELDS.has(field)) {
      if (field === 'entryType' && ENTRY_TYPES.includes(raw)) result[field] = raw;
      continue;
    }
    if (raw === '') {
      result[field] = '';
      continue;
    }
    const number = Number(raw);
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
  return Object.fromEntries(FIELDS.map((field) => {
    const value = decoded?.[field];
    if (BOOLEAN_FIELDS.has(field)) return [field, value === true];
    // entryType drives a <select> with no blank option, so an omitted link
    // field falls back to 'formal' rather than an empty string a <select>
    // could not represent -- every other field genuinely clears.
    if (field === 'entryType') return [field, ENTRY_TYPES.includes(value) ? value : 'formal'];
    return [field, value !== undefined ? String(value) : ''];
  }));
}
