// Single-sourced from the calculator so a new input field is shareable the day
// it ships, instead of being quietly discarded by an encoder that never learned
// about it. String enums travel as themselves; numbers travel as numbers. A
// shared link that dropped the gas upsize or the attic carry would let the
// recipient compute a different profit than the sender saw — that is the bug
// this allowlist exists to prevent.
import { INPUT_FIELDS as FIELDS } from './calc.mjs';

const STRING_FIELDS = new Set([
  'heaterType',
  'location',
  'venting',
  'gasLine',
  'electrical',
]);

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    if (field === 'proposedPrice' && (input?.[field] === '' || input?.[field] == null)) continue;
    if (STRING_FIELDS.has(field)) {
      const value = String(input?.[field] ?? '').trim();
      if (value) params.set(field, value);
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
    if (STRING_FIELDS.has(field)) {
      const text = String(params.get(field) || '').trim();
      if (text) result[field] = text;
      continue;
    }
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  return result;
}
