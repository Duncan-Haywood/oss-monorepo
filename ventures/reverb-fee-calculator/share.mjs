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
