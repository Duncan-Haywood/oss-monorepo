// Puts a scenario's numbers in the URL itself, so a seat review can be sent to
// a manager or finance partner without uploading anything -- seat counts and
// per-seat price are commercially sensitive, which is the same reason
// usage.mjs never sends them anywhere either. Single-sourced from calc.mjs's
// INPUT_FIELDS so a field added to the form is shareable the day it ships.
import { INPUT_FIELDS as FIELDS } from './calc.mjs';

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
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
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  return result;
}
